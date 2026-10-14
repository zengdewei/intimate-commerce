# Ubuntu 生产部署手册

面向 Ubuntu 22.04 / 24.04 单台主机的部署说明。两条路线二选一：

- **路线 A（推荐）**：宿主 systemd + 宿主 Nginx + 宿主 MySQL 8 —— 组件少、资源占用低、排障直观。
- **路线 B**：Docker Compose —— 环境一致性更好，适合已经熟悉 Docker 的运维。

两条路线都是**单实例**方案。项目本身不是横向扩容架构：`prisma/schema.prisma` 的 provider 固定为 `mysql`，
迁移历史也是 MySQL 专用（TEXT 无默认值、VARCHAR 列宽等），不要只改 `DATABASE_URL` 就切到 SQLite 或 PostgreSQL。

> **没有域名？** 应用在生产模式下强制 `FRONTEND_URL` 必须 HTTPS，所以无域名（无 TLS）时不能跑生产模式。
> 这种情况用 `--preview` 预览模式（HTTP over 公网 IP），详见
> [QUICKSTART-NO-DOMAIN.md](./QUICKSTART-NO-DOMAIN.md)。本文件以下章节面向**有域名的生产部署**。

---

## 两种运行模式

`deploy.sh` 通过 `MODE` 区分两套行为，默认 `production`，加 `--preview` 切到预览：

| 维度 | `production`（默认） | `--preview` |
|---|---|---|
| `APP_ENV` / `NODE_ENV` | `production` | `development` |
| `FRONTEND_URL` | 强制 `https://` | 允许 `http://<IP>` |
| TLS 证书 | 必须（certbot 签发） | 不签发，HTTP only |
| 结账入口 | `COMMERCE_LIVE_ENABLED=false` 时**隐藏** | **开启**，走模拟付款 |
| 演示账号/商品 | seed 跳过（生产禁用默认口令） | seed 创建（方便直接登录看效果） |
| 启动阻断 | 校验 JWT 长度、CORS 白名单、HTTPS、演示口令 | 应用层绕过，但 `deploy.sh` 仍强制强 JWT |

> 预览模式部署在公网 IP 上仍是明文，JWT/口令可被嗅探，**不要录真实数据**；拿到域名后尽快切到 production。

---

## 前置事实（部署前必须知道）

| 事项 | 说明 |
|---|---|
| 运行前提 | Node.js 20+、MySQL 8.0+（`utf8mb4` / `utf8mb4_unicode_ci`） |
| 后端启动 | `node -r ./register-paths.cjs dist/src/main.js`，**工作目录必须是 `backend/`** |
| 环境文件优先级 | systemd / 容器注入的变量 **高于** `backend/.env` 与 `backend/.env.local` |
| 结账是否可用 | 生产模式下由 `COMMERCE_LIVE_ENABLED` 决定，为 `false` 时前台隐藏结账入口 —— 这是**设计行为**，不是故障。预览模式下结账开启、走模拟付款 |
| 生产启动阻断 | 生产模式下若库中仍有使用默认口令的账号，应用启动时直接抛错 |
| 前端 API 地址 | `VITE_API_BASE_URL` 留空即走相对路径 `/api`，同域反代即可，**换域名无需重新构建** |
| Redis | 可选。未配置或连不上时自动降级为进程内内存缓存（单实例安全） |
| 文件上传 | 项目无上传功能，不涉及磁盘写入与目录权限 |

---

## 路线 A：原生部署

### 0. 安装系统依赖

```sh
# Node.js 20（NodeSource）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs nginx mysql-server openssl rsync curl

sudo systemctl enable --now nginx mysql
node -v   # 应为 v20.x 或更高
```

### 1. 建库建账号

不要克隆含演示数据的开发库，生产库必须独立。

```sh
sudo mysql
```

```sql
CREATE DATABASE intimate_commerce_prod
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER 'intimate_commerce'@'localhost' IDENTIFIED BY '换成强密码';
GRANT ALL PRIVILEGES ON intimate_commerce_prod.* TO 'intimate_commerce'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### 2. 放置代码

```sh
sudo mkdir -p /opt/intimate-commerce
sudo rsync -a --exclude node_modules --exclude dist --exclude .env --exclude .env.local \
  ./ /opt/intimate-commerce/
```

> 用 `rsync` 排除 `node_modules` 与 `dist`，避免把 Windows 上的依赖和产物带到 Linux。

### 3. 生成生产环境变量文件

```sh
sudo mkdir -p /etc/intimate-commerce
sudo cp /opt/intimate-commerce/deploy/env/backend.env.production.example /etc/intimate-commerce/backend.env
sudo chmod 600 /etc/intimate-commerce/backend.env
sudo chown root:intimate /etc/intimate-commerce/backend.env
sudo nano /etc/intimate-commerce/backend.env
```

至少要替换：`DATABASE_URL`、`JWT_ACCESS_SECRET`（用 `openssl rand -base64 48`）、
`REDIS_PASSWORD`、`STORE_*`、`MAIL_FROM`、`ADMIN_EMAIL`、`ADMIN_PASSWORD`（长度 ≥ 14）。

同时把 `APP_URL` / `FRONTEND_URL` / `CORS_ORIGINS` 改成真实域名。

### 4. 执行部署

```sh
cd /opt/intimate-commerce
sudo DOMAIN=shop.example.com ./deploy/deploy.sh --seed
```

脚本会依次完成：预检 → 校验环境变量 → 建系统用户与目录 → 隔离遗留 `.env` →
`npm ci` / `prisma generate` / `migrate deploy` / `nest build` / `prisma db seed` / `npm prune` →
前端构建并同步到 `/var/www/intimate-commerce` → 安装 Nginx 配置 → 安装并启动 systemd 服务 → 健康检查。

常用开关：

```sh
sudo DOMAIN=shop.example.com ./deploy/deploy.sh --skip-frontend   # 只更新后端
sudo DOMAIN=shop.example.com ./deploy/deploy.sh --skip-nginx      # 不动 Nginx
sudo DOMAIN=shop.example.com ./deploy/deploy.sh --seed            # 初始化管理员
sudo DOMAIN=203.0.113.5 ./deploy/deploy.sh --preview --seed      # 无域名预览（HTTP over IP）
```

### 5. 签发证书

脚本首次运行时会发现证书不存在，自动安装 HTTP-only 临时配置：

```sh
sudo apt-get install -y certbot
sudo certbot certonly --webroot -w /var/www/certbot -d shop.example.com
sudo DOMAIN=shop.example.com ./deploy/deploy.sh   # 再跑一次，自动切换到 HTTPS 配置
```

自动续期由 certbot 的 systemd timer 负责，续期后需 `systemctl reload nginx`：

```sh
echo '#!/bin/sh
systemctl reload nginx' | sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
```

### 6. 防火墙

```sh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
# 3000（后端）与 3306（MySQL）绝不对外放行，只允许回环访问
```

---

## 路线 B：Docker Compose

```sh
sudo apt-get install -y docker.io docker-compose-v2
cd /opt/intimate-commerce

cp deploy/env/compose.env.example deploy/.env
cp deploy/env/backend.env.production.example deploy/env/backend.env
nano deploy/.env deploy/env/backend.env      # 填真实值

docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d --build
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env \
  --profile tools run --rm migrate           # 执行数据库迁移
curl -fsS http://127.0.0.1:8080/api/store/health
```

首次初始化管理员：

```sh
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env exec \
  -T api npx prisma db seed
```

> `runner` 镜像不含 prisma CLI，所以 seed 需要借用 `migrate` target：
> `docker build -t ic-migrate --target migrate ./backend` 后 `docker run --rm --env-file deploy/env/backend.env ic-migrate npx prisma db seed`。

TLS 仍由宿主 Nginx 终结，使用精简版配置：

```sh
sudo cp deploy/nginx/intimate-commerce-tls.conf /etc/nginx/sites-available/intimate-commerce.conf
sudo sed -i 's/shop.example.com/你的域名/g' /etc/nginx/sites-available/intimate-commerce.conf
sudo ln -sf /etc/nginx/sites-available/intimate-commerce.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

`web` 容器只绑定 `127.0.0.1:8080`，公网流量必须先经过宿主 Nginx。

---

## 常用运维命令

```sh
# 路线 A
systemctl status intimate-commerce-api
journalctl -u intimate-commerce-api -f
systemctl restart intimate-commerce-api

# 健康检查（含 paymentReview / failedEmails 指标）
curl -fsS http://127.0.0.1:3000/api/store/health | python3 -m json.tool

# 数据库备份与恢复
mysqldump --single-transaction --routines --events \
  -u intimate_commerce -p intimate_commerce_prod > backup-$(date +%F).sql
```

### 更新发布

```sh
cd /opt/intimate-commerce
sudo git pull                       # 或 rsync 新代码
sudo DOMAIN=shop.example.com ./deploy/deploy.sh
```

脚本是幂等的，会重新构建并覆盖静态产物与站点配置，**不会触碰数据库数据**。

---

## 排障

**服务起不来，日志出现 `Launch blocked: remove default demo credentials`**
生产库里残留了使用 `Admin@123456` / `Test@123456` 的账号。删除这些账号后重启；或直接改用非演示的管理员邮箱，让 seed 只创建新账号。

**启动报 `Set a unique JWT_ACCESS_SECRET (32+ characters)`**
`JWT_ACCESS_SECRET` 长度不足 32，或仍含 `change-me` / `dev-secret` / `xxxxxxxx` 字样。
模板里的占位值刻意包含 `change-me`，就是为了让漏改的配置**无法启动**而不是带着弱密钥上线。
用 `openssl rand -base64 48` 生成后再重启。

**启动报 `Production CORS_ORIGINS must be an explicit allowlist` / `Production FRONTEND_URL must use HTTPS`**
这两条只在**生产模式**触发。`CORS_ORIGINS` 不能含 `*`，`FRONTEND_URL` 必须是 `https://` 开头。
如果你确实没有域名/证书，改用 `--preview` 预览模式（见 QUICKSTART-NO-DOMAIN.md），它会绕过这两条校验。

**启动报 `Launch blocked: <某个 KEY>`**
只有 `COMMERCE_LIVE_ENABLED=true` 时才会出现。说明该项人工确认或密钥缺失，
逐项补齐 `commerce.config.ts` 中 `validate()` 要求的那批变量即可（`deploy.sh` 也会在部署前拦一次）。

**`Unable to require libquery_engine` 或引擎加载失败**
缺 OpenSSL：`sudo apt-get install -y openssl`。容器路线下 `backend/Dockerfile` 已内置安装。

**`nginx -t` 报证书文件不存在**
证书还没签发。先装 bootstrap 配置跑 certbot，再重新运行 `deploy.sh`。

**前端能打开但接口全部失败**
检查 `frontend/.env.production` 的 `VITE_API_BASE_URL` 是否被填成了别的域名，以及 `CORS_ORIGINS` 是否包含当前域名。修改 `VITE_*` 后必须重新 `npm run build`。

**所有请求被限流（429）**
`TRUST_PROXY_HOPS` 还是 0，后端把所有请求都算成 Nginx 的同一个 IP。改为 `1` 后重启服务。

**改了 `backend/.env` 但不生效**
不要在生产服务器上放 `backend/.env`。真正的配置源是 `/etc/intimate-commerce/backend.env`，改完执行 `sudo systemctl restart intimate-commerce-api`。

---

## 尚未包含的能力

正式品牌与商品资料、文件上传存储、多币种多语言、积分订阅、真实评论、部分退款、拆单、
实时物流、税务引擎、身份证件验证、完整法律审阅、商业账户审核，均不属于当前交付范围。

真实收款还需要经营者完成支付品类审批、合规确认与法律审阅后，才能把
`COMMERCE_LIVE_ENABLED` 等开关置为 `true`。这些门槛是防误开机制，不是系统能自动给出的法律结论。
