# 无域名快速部署手册（新服务器 · HTTP 预览）

> 适用场景：你刚拿到一台 Ubuntu 服务器，**暂时没有域名**，想把项目先跑起来。
> 这是「预览模式」部署：HTTP over 公网 IP，可浏览、可走模拟下单/模拟付款，**不接受真实交易**。

---

## 0. 先看懂这个约束（很重要）

项目代码里有一条**硬性校验**（`backend/src/core/commerce/commerce.config.ts` 的 `validate()`）：

> 生产模式下 `FRONTEND_URL` 必须 `https://` 开头，否则应用直接拒绝启动。

也就是说：**没有域名 → 拿不到 TLS 证书 → 不能用 HTTPS → 不能跑生产模式**。

所以没有域名时，唯一可行的路径是 **预览模式（`APP_ENV=development`）**：

- 应用绕过 HTTPS 强制校验，允许 HTTP 访问。
- 结账入口开启，但只走**模拟付款**（`COMMERCE_LIVE_ENABLED=false`）。
- 演示商品与演示账号会被 seed 创建（方便你直接登录后台看效果）。

**代价**：HTTP 下 JWT 和登录口令可被嗅探。所以预览库**不要录真实客户/订单数据**，等拿到域名后尽快切到生产模式。

> 想要「无域名也要 TLS」？用 `<IP>.nip.io` 这类指向 IP 的免费域名也能让 Let's Encrypt 签证书，见本文末尾「进阶」。

---

## 1. 服务器准备

确认系统版本与公网 IP：

```sh
lsb_release -a            # 应为 Ubuntu 22.04 / 24.04
curl -s https://api.ipify.org && echo    # 公网 IP（记下来，下文用 <SERVER_IP> 代替）
```

如果是云服务器，在安全组/防火墙里**先只放行 22（SSH）和 80（HTTP）**，443 留到有域名后再开。**不要放行 3000（后端）和 3306（MySQL）**。

---

## 2. 安装系统依赖

```sh
# Node.js 20（NodeSource 官方源）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

sudo apt-get update
sudo apt-get install -y nodejs nginx mysql-server openssl rsync curl git

sudo systemctl enable --now nginx mysql
node -v     # 应为 v20.x
mysql --version   # 应为 8.x
```

可选但建议：给 MySQL root 设密码并清理默认账号。

```sh
sudo mysql_secure_installation
```

---

## 3. 建库建账号

```sh
sudo mysql
```

```sql
-- 预览库与开发库分开，避免污染
CREATE DATABASE intimate_commerce_preview
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ⚠️ 下面 <YOUR_DB_PASSWORD> 必须替换成你自己的强密码，不要原样粘贴！
--    建议用纯字母数字（避免 URL 编码麻烦）：openssl rand -hex 16
--    把生成的串记下来，下一步要填进环境文件的 DATABASE_URL
CREATE USER 'intimate_commerce'@'localhost' IDENTIFIED BY '<YOUR_DB_PASSWORD>';
GRANT ALL PRIVILEGES ON intimate_commerce_preview.* TO 'intimate_commerce'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

> **如果你已经把 `<YOUR_DB_PASSWORD>` 原样当密码存进去了**（包括旧版手册的中文占位 `'换成你自己的强密码'`），用这条命令改回来：
> ```sh
> sudo mysql -e "ALTER USER 'intimate_commerce'@'localhost' IDENTIFIED BY '<新的强密码>'; FLUSH PRIVILEGES;"
> ```
> 然后同步改 `/etc/intimate-commerce/backend.env` 里的 `DATABASE_URL`，再 `sudo systemctl restart intimate-commerce-api`（如果服务已起）。

---

## 4. 把代码放到服务器

代码必须放在 `/opt/intimate-commerce`（`deploy.sh` 默认路径，可用 `APP_DIR=` 覆盖）。

**方式 A：git clone（推荐，自动排除 node_modules）**

```sh
sudo mkdir -p /opt/intimate-commerce
sudo chown -R $USER:$USER /opt/intimate-commerce
cd /opt
git clone <你的仓库地址> intimate-commerce
# 如果是私有仓库，用带 PAT 的 URL：
# git clone https://<PAT>@github.com/<org>/<repo>.git intimate-commerce
```

**方式 B：从本机 rsync 上传（在 Windows 本机执行，Git Bash 里）**

```sh
# 在本机项目根目录执行；注意末尾的斜杠
rsync -avz --exclude node_modules --exclude dist --exclude .env --exclude .env.local \
  -e "ssh -i ~/.ssh/你的私钥" \
  ./ root@<SERVER_IP>:/opt/intimate-commerce/
```

放好后核对结构：

```sh
ls /opt/intimate-commerce
# 应能看到：backend  frontend  deploy  docs  README.md  ...
ls /opt/intimate-commerce/deploy/deploy.sh   # 必须存在
```

---

## 5. 生成预览环境文件

```sh
sudo mkdir -p /etc/intimate-commerce
sudo cp /opt/intimate-commerce/deploy/env/backend.env.preview.example \
        /etc/intimate-commerce/backend.env
sudo chmod 600 /etc/intimate-commerce/backend.env
sudo chown root:intimate /etc/intimate-commerce/backend.env
```

> 用户 `intimate` 还没创建，`chown` 此时若报 "unknown user" 是正常的，部署脚本创建用户后会再设一次。可暂时 `chown root:root` 占位。

编辑文件，**至少改这三处**：

```sh
sudo nano /etc/intimate-commerce/backend.env
```

```ini
# 1) 把 <SERVER_IP> 全部换成第 1 步拿到的公网 IP
APP_URL="http://203.0.113.5"
FRONTEND_URL="http://203.0.113.5"
CORS_ORIGINS="http://203.0.113.5"

# 2) 数据库密码改成第 3 步设的那个
DATABASE_URL="mysql://intimate_commerce:你的强密码@127.0.0.1:3306/intimate_commerce_preview?schema=public&connection_limit=10"

# 3) JWT 密钥生成一个真的（在服务器上跑下面这条，把输出粘进去）
#    openssl rand -base64 48
JWT_ACCESS_SECRET="粘贴上面命令的输出"
```

强烈建议也改管理员密码（≥ 14 位）：

```ini
ADMIN_EMAIL="admin@example.com"
ADMIN_PASSWORD="你自己设的强口令至少14位"
```

---

## 6. 执行部署

```sh
cd /opt/intimate-commerce
sudo DOMAIN=<SERVER_IP> ./deploy/deploy.sh --preview --seed
```

参数解释：
- `DOMAIN=<SERVER_IP>` —— 用公网 IP 当作 `server_name`（nginx 会按 IP 匹配）。
- `--preview` —— 走预览模式（APP_ENV/NODE_ENV=development，HTTP only）。
- `--seed` —— 首次部署初始化管理员账号与演示商品。

脚本会自动完成：预检 → 校验环境变量 → 建系统用户 → 隔离遗留 `.env` →
后端 `npm ci` / `prisma generate` / `migrate deploy` / `build` / `seed` / `prune` →
前端构建并同步到 `/var/www/intimate-commerce` → 装 Nginx（HTTP-only bootstrap 配置）→
装 systemd 服务 → 健康检查。

成功结尾会打印一段汇总，包含模式、对外地址、常用命令。

---

## 7. 放行防火墙

```sh
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw enable
# 3000 与 3306 不放行；它们只监听回环，公网访问不到
sudo ufw status verbose
```

---

## 8. 访问验证

在你本机浏览器打开：

| 入口 | 地址 |
|---|---|
| 店铺首页 | `http://<SERVER_IP>` |
| 管理后台 | `http://<SERVER_IP>/admin` |
| API 文档 | `http://<SERVER_IP>/api/docs`（仅非生产模式暴露） |
| 健康检查 | `http://<SERVER_IP>/api/store/health` |

登录后台用环境文件里的 `ADMIN_EMAIL` / `ADMIN_PASSWORD`（没设密码则回退到 `admin@example.com` / `Admin@123456`）。

在服务器上命令行验证：

```sh
curl -fsS http://127.0.0.1/api/store/health
systemctl status intimate-commerce-api
journalctl -u intimate-commerce-api -f
```

---

## 9. 安全提醒（预览模式必读）

- **HTTP 明文**：登录口令、JWT 都在明文传输。不要在预览库里录真实客户数据。
- **admin 后台暴露**：任何人扫到 IP 都能尝试登录。建议二选一加固：
  - 用防火墙把 80 端口限制为只允许你自己的 IP（`sudo ufw allow from <你的IP> to any port 80`），或
  - 用 SSH 隧道访问后台，不对外开 80：本机执行 `ssh -L 8080:127.0.0.1:80 server_user@<SERVER_IP>`，然后浏览器开 `http://localhost:8080`。
- **演示账号**：seed 会创建 `admin@example.com` 和 `test@example.com`，口令见 README。公网上务必改掉或限制访问。

---

## 10. 常见问题

**脚本卡在「数据库迁移失败」**
最常见是库没建或账号密码不对。回看第 3 步，确认库名 `intimate_commerce_preview`、用户密码与 `DATABASE_URL` 一致。用 `sudo mysql -u intimate_commerce -p intimate_commerce_preview` 能登进去就说明账号没问题。

**浏览器打开是 Nginx 欢迎页或 502**
- 欢迎页：站点没启用，`ls /etc/nginx/sites-enabled/` 应有 `intimate-commerce.conf` 而无 `default`。
- 502：后端没起来，`systemctl status intimate-commerce-api` 看日志。

**接口全部 401 或 CORS 报错**
`CORS_ORIGINS` 必须和浏览器地址栏完全一致（含 `http://`、不含末尾斜杠）。改完环境文件后 `sudo systemctl restart intimate-commerce-api`。

**改了代码怎么更新**
```sh
cd /opt/intimate-commerce
git pull                       # 或重新 rsync
sudo DOMAIN=<SERVER_IP> ./deploy/deploy.sh --preview
```
脚本是幂等的，重新构建并覆盖静态产物，**不动数据库**。

---

## 11. 等拿到域名后：切到生产模式

1. 域名 A 记录指向 `<SERVER_IP>`，等 DNS 生效。
2. 换环境文件模板并改配置：
   ```sh
   sudo cp /opt/intimate-commerce/deploy/env/backend.env.production.example \
           /etc/intimate-commerce/backend.env
   sudo nano /etc/intimate-commerce/backend.env
   # APP_ENV=production
   # APP_URL/FRONTEND_URL/CORS_ORIGINS = https://你的域名
   # JWT_ACCESS_SECRET 用 openssl rand -base64 48 重新生成
   # ADMIN_PASSWORD 设 >= 14 位
   ```
3. 签发证书（脚本会先装 HTTP-only 配置让你过 webroot 校验）：
   ```sh
   sudo DOMAIN=你的域名 ./deploy/deploy.sh          # 第一次：装 bootstrap，应用切到 production
   sudo apt-get install -y certbot
   sudo certbot certonly --webroot -w /var/www/certbot -d 你的域名
   sudo DOMAIN=你的域名 ./deploy/deploy.sh          # 第二次：自动切到 HTTPS 配置
   ```
4. 防火墙放行 443。
5. **注意**：生产模式 + `COMMERCE_LIVE_ENABLED=false` 时，**结账入口会被隐藏**（这是设计行为）。需要真实收款时再逐项打开那四项人工确认开关 + Stripe 密钥。

---

## 进阶：无域名也要 TLS（`<IP>.nip.io`）

如果你不想等域名，又想要 HTTPS，可以用指向 IP 的免费域名 `nip.io`：

- 假设公网 IP 是 `203.0.113.5`，域名就是 `203-0-113-5.nip.io`（或 `203.0.113.5.nip.io`）。
- 它直接解析回你的 IP，Let's Encrypt 能为它签证书。
- 然后走第 11 步的**生产模式**流程，`DOMAIN` 用这个 nip.io 域名即可。

```sh
# 用 nip.io 域名走生产模式（无需购买域名）
sudo DOMAIN=203-0-113-5.nip.io ./deploy/deploy.sh --seed
sudo apt-get install -y certbot
sudo certbot certonly --webroot -w /var/www/certbot -d 203-0-113-5.nip.io
sudo DOMAIN=203-0-113-5.nip.io ./deploy/deploy.sh
```

注意：nip.io 是公共服务，稳定性不如自购域名；浏览器对 IP 形域名也不如正规域名友好。**只适合临时/演示**，正式上线仍建议自购域名。
