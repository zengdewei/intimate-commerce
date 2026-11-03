# 从零部署手把手清单（Ubuntu 原生部署）

> 面向 Ubuntu 22.04 / 24.04 单台主机，路线 A（宿主 systemd + 宿主 Nginx + 宿主 MySQL 8）。
> 全程可复制粘贴。把 `shop.example.com` 换成真实域名，`你的强密码` 换成自己生成的密码。
>
> 前置：一台有公网 IP 的 Ubuntu 服务器 + 一个已解析到该 IP 的域名。

---

## 第 1 步：SSH 登录，装依赖

```sh
sudo apt-get update

# Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Nginx + MySQL + 其他
sudo apt-get install -y nginx mysql-server openssl rsync curl git

# 开机自启
sudo systemctl enable --now nginx mysql

# 验证版本
node -v          # 应 v20.x
mysql --version  # 应 8.x
```

---

## 第 2 步：建数据库和账号

先在本机生成一个纯 ASCII 强密码：`openssl rand -hex 16`，记下来替换下面的 `你的强密码`。

```sh
sudo mysql
```

```sql
CREATE DATABASE intimate_commerce_prod
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER 'intimate_commerce'@'localhost'
  IDENTIFIED WITH mysql_native_password BY '你的强密码';

GRANT ALL PRIVILEGES ON intimate_commerce_prod.* TO 'intimate_commerce'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

> ⚠️ 关键点：
> 1. 密码必须是**纯字母数字**（`@ : / ? # %` 等符号会破坏连接串）。
> 2. `IDENTIFIED WITH mysql_native_password` 不能省 —— Prisma 5 迁移引擎在部分 MySQL 8
>    环境会因 `caching_sha2_password` 认证失败（报 `Unknown authentication plugin`）。

---

## 第 3 步：放代码

```sh
sudo mkdir -p /opt/intimate-commerce
sudo chown -R $USER:$USER /opt/intimate-commerce

cd /opt
git clone https://github.com/你的组织/你的仓库.git intimate-commerce
# 私有仓库：git clone https://<你的PAT>@github.com/你的组织/你的仓库.git intimate-commerce
```

验证：

```sh
ls /opt/intimate-commerce
# 应看到：backend  frontend  deploy  docs  README.md
ls /opt/intimate-commerce/deploy/deploy.sh   # 必须存在
```

---

## 第 4 步：生成生产环境变量

```sh
sudo mkdir -p /etc/intimate-commerce
sudo cp /opt/intimate-commerce/deploy/env/backend.env.production.example \
        /etc/intimate-commerce/backend.env
sudo chmod 600 /etc/intimate-commerce/backend.env
sudo nano /etc/intimate-commerce/backend.env
```

逐项替换（`CHANGE_ME` 全部换掉）：

```ini
# 1) 域名（三处都改成你的）
APP_URL="https://shop.example.com"
FRONTEND_URL="https://shop.example.com"
CORS_ORIGINS="https://shop.example.com"

# 2) 数据库密码（改成第 2 步设的那个）
DATABASE_URL="mysql://intimate_commerce:你的强密码@127.0.0.1:3306/intimate_commerce_prod?schema=public&connection_limit=10"

# 3) JWT 密钥（服务器上跑 openssl rand -base64 48，粘进来）
JWT_ACCESS_SECRET="粘贴openssl输出"

# 4) 管理员账号（邮箱 + ≥14 位强口令）
ADMIN_EMAIL="ops@shop.example.com"
ADMIN_PASSWORD="至少14位的强口令"

# 5) 客服邮箱
STORE_SUPPORT_EMAIL="support@shop.example.com"
```

> `STRIPE_*`、`RESEND_API_KEY`、四个 `*_CONFIRMED` 是「真实收款」才需要，先保持默认。

---

## 第 5 步：执行部署脚本

```sh
cd /opt/intimate-commerce
sudo DOMAIN=shop.example.com ./deploy/deploy.sh --seed
```

脚本自动依次完成：预检 → 建用户/目录 → 隔离遗留 .env → 后端 `npm ci` → `prisma generate`
→ **`prisma migrate deploy`（建 10 张表）** → `nest build` → **`prisma db seed`（建管理员）**
→ `npm prune` → 前端构建 → 装 Nginx → 装 systemd → 健康检查。

看到结尾 `健康检查通过` 即成功。

---

## 第 6 步：签发 TLS 证书

```sh
# 第一步：装 certbot 并签发
sudo apt-get install -y certbot
sudo certbot certonly --webroot -w /var/www/certbot -d shop.example.com

# 第二步：重跑一次，脚本检测到证书会自动切 HTTPS
sudo DOMAIN=shop.example.com ./deploy/deploy.sh
```

自动续期 hook：

```sh
echo '#!/bin/sh
systemctl reload nginx' | sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
```

---

## 第 7 步：放行防火墙

```sh
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

> 3000（后端）与 3306（MySQL）绝不放行，只监听回环。

---

## 第 8 步：验证管理员登录

服务器上验证后端健康：

```sh
curl -fsS http://127.0.0.1:3000/api/store/health
```

浏览器打开：

| 入口 | 地址 |
|---|---|
| 店铺首页 | `https://shop.example.com` |
| 管理后台 | `https://shop.example.com/admin` |

用第 4 步的 `ADMIN_EMAIL` / `ADMIN_PASSWORD` 登录后台，即代表「数据库 → 表 → 管理员数据」全链路打通。

---

## 无域名分支（临时预览）

```sh
# 第 2 步库名换成 intimate_commerce_preview
# 第 4 步用预览模板：
sudo cp /opt/intimate-commerce/deploy/env/backend.env.preview.example /etc/intimate-commerce/backend.env
# 里面 APP_URL / FRONTEND_URL / CORS_ORIGINS 改成 http://你的服务器IP

# 第 5 步加 --preview：
sudo env DOMAIN=203.0.113.5 ./deploy/deploy.sh --preview --seed
```

预览模式跳过证书，直接 `http://你的IP` 访问，走模拟付款、不接受真实交易、别录真实数据。
拿到域名后按第 4/5/6 步切 production。

---

## 日常维护速查

```sh
# 服务状态 / 日志
systemctl status intimate-commerce-api
journalctl -u intimate-commerce-api -f

# 备份数据库
mysqldump --single-transaction --routines --events \
  -u intimate_commerce -p intimate_commerce_prod > backup-$(date +%F).sql

# 更新代码后重新部署（幂等，不动数据库）
cd /opt/intimate-commerce
sudo git pull
sudo DOMAIN=shop.example.com ./deploy/deploy.sh
```

---

## 常见报错速查

| 报错 | 原因 | 处理 |
|---|---|---|
| `Unknown authentication plugin` | 第 2 步漏了 `mysql_native_password` | 重新 `ALTER USER ... IDENTIFIED WITH mysql_native_password` |
| `Launch blocked: remove default demo credentials` | 生产库残留默认口令账号 | 删除 `Admin@123456`/`Test@123456` 账号后重启 |
| `Set a unique JWT_ACCESS_SECRET` | JWT 仍是 `change-me` 占位 | 用 `openssl rand -base64 48` 重新生成 |
| `Production FRONTEND_URL must use HTTPS` | 域名没配 https 或没证书 | 先签证书；无域名走 `--preview` |
| 接口 401 / CORS 报错 | `CORS_ORIGINS` 与地址栏不一致 | 改 env 后 `systemctl restart intimate-commerce-api` |
| 所有请求 429 限流 | `TRUST_PROXY_HOPS` 仍为 0 | 改为 `1` 后重启 |
