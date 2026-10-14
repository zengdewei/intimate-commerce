#!/usr/bin/env bash
# ============================================================
# Intimate Commerce — Ubuntu 原生部署脚本（路线 A）
#
# 适用：Ubuntu 22.04 / 24.04，单台主机，systemd + 宿主 Nginx + 宿主 MySQL 8
#
# 用法：
#   sudo DOMAIN=shop.example.com ./deploy/deploy.sh            # 生产部署（需域名 + TLS）
#   sudo DOMAIN=shop.example.com ./deploy/deploy.sh --seed     # 额外初始化管理员账号
#   sudo DOMAIN=203.0.113.5 ./deploy/deploy.sh --preview --seed  # 无域名临时预览（HTTP over IP）
#   sudo DOMAIN=shop.example.com ./deploy/deploy.sh --skip-frontend
#   ./deploy/deploy.sh --help
#
# MODE 说明：
#   production（默认）—— APP_ENV=production / NODE_ENV=production，强制 HTTPS、真实收款门槛
#   preview           —— APP_ENV=development / NODE_ENV=development，HTTP 即可，
#                        绕过应用的生产校验（FRONTEND_URL 不强制 https），结账走模拟付款。
#                        应用设计上 production 才阻断演示账号，因此预览模式允许演示数据。
#
# 幂等：可重复执行，仅覆盖站点配置与构建产物，不动数据库数据。
# 安全：不会删除 /var/www 之外的任何内容；遇到遗留 .env 只做改名隔离，不删除。
# ============================================================

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/intimate-commerce}"
ENV_DIR="${ENV_DIR:-/etc/intimate-commerce}"
ENV_FILE="$ENV_DIR/backend.env"
SERVICE_USER="${SERVICE_USER:-intimate}"
SERVICE_NAME="${SERVICE_NAME:-intimate-commerce-api}"
WEB_ROOT="${WEB_ROOT:-/var/www/intimate-commerce}"
CERTBOT_WEBROOT="${CERTBOT_WEBROOT:-/var/www/certbot}"
DOMAIN="${DOMAIN:-}"
NODE_BIN="${NODE_BIN:-$(command -v node || echo /usr/bin/node)}"

DO_SEED=0
DO_FRONTEND=1
DO_NGINX=1
MODE="${MODE:-production}"

RED=$'\033[31m'; YEL=$'\033[33m'; GRN=$'\033[32m'; DIM=$'\033[2m'; RST=$'\033[0m'
log()  { printf '%s[deploy]%s %s\n' "$GRN" "$RST" "$*"; }
warn() { printf '%s[warn]%s   %s\n' "$YEL" "$RST" "$*"; }
die()  { printf '%s[error]%s  %s\n' "$RED" "$RST" "$*" >&2; exit 1; }
step() { printf '\n%s==> %s%s\n' "$DIM" "$*" "$RST"; }

usage() {
  awk 'NR>1 && /^#/ {sub(/^# ?/,""); print; next} NR>1 && /^$/ {exit}' "$0"
  exit 0
}

for arg in "$@"; do
  case "$arg" in
    --seed)          DO_SEED=1 ;;
    --skip-frontend) DO_FRONTEND=0 ;;
    --skip-nginx)    DO_NGINX=0 ;;
    --preview)       MODE=preview ;;
    -h|--help)       usage ;;
    *) die "未知参数：$arg（用 --help 查看用法）" ;;
  esac
done

case "$MODE" in
  production|preview) : ;;
  *) die "MODE 只能是 production 或 preview（当前：$MODE）" ;;
esac

if [ "$MODE" = "preview" ]; then
  NODE_ENV_VAL="development"
  REQUIRED_APP_ENV="development"
else
  NODE_ENV_VAL="production"
  REQUIRED_APP_ENV="production"
fi

# ------------------------------------------------------------
# 预检
# ------------------------------------------------------------
step "环境预检"

[ "$(id -u)" -eq 0 ] || die "需要 root 权限运行：sudo DOMAIN=你的域名 $0"

[ -n "$DOMAIN" ] || die "必须指定域名：sudo DOMAIN=shop.example.com $0"
case "$DOMAIN" in
  *localhost*|*127.0.0.1*) die "DOMAIN 必须是真实域名（当前：$DOMAIN）" ;;
esac

[ -f "$APP_DIR/backend/package.json" ] || die "未找到 $APP_DIR/backend/package.json，请先把代码放到 $APP_DIR"
[ -f "$APP_DIR/frontend/package.json" ] || die "未找到 $APP_DIR/frontend/package.json"

command -v node >/dev/null || die "未安装 Node.js，请先安装 Node 20+（见 deploy/README.md）"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || die "Node 版本过低（当前 $(node -v)），需要 20+"

# Prisma 查询引擎依赖 OpenSSL
if ! dpkg -s openssl >/dev/null 2>&1; then
  warn "openssl 未安装，正在安装（Prisma 引擎必需）"
  DEBIAN_FRONTEND=noninteractive apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq openssl
fi
log "Node $(node -v) · openssl 就绪"

# ------------------------------------------------------------
# 环境文件校验
# ------------------------------------------------------------
step "$MODE 模式环境变量校验"

if [ "$MODE" = "preview" ]; then
  ENV_TEMPLATE="$APP_DIR/deploy/env/backend.env.preview.example"
else
  ENV_TEMPLATE="$APP_DIR/deploy/env/backend.env.production.example"
fi

[ -f "$ENV_FILE" ] || die "缺少 $ENV_FILE
      请先执行：
        sudo mkdir -p $ENV_DIR
        sudo cp $ENV_TEMPLATE $ENV_FILE
        sudo chmod 600 $ENV_FILE && sudo chown root:$SERVICE_USER $ENV_FILE
        sudo nano $ENV_FILE   # 把所有 CHANGE_ME 替换掉（预览模式也请改掉 JWT 与管理员密码）"

env_get() { grep -E "^$1=" "$ENV_FILE" | tail -n1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"; }

APP_ENV_VAL="$(env_get APP_ENV)"
JWT_VAL="$(env_get JWT_ACCESS_SECRET)"
ADMIN_EMAIL_VAL="$(env_get ADMIN_EMAIL)"
ADMIN_PASS_VAL="$(env_get ADMIN_PASSWORD)"
LIVE_VAL="$(env_get COMMERCE_LIVE_ENABLED)"
CORS_VAL="$(env_get CORS_ORIGINS)"
HOPS_VAL="$(env_get TRUST_PROXY_HOPS)"

[ "$APP_ENV_VAL" = "$REQUIRED_APP_ENV" ] || die "APP_ENV 必须为 $REQUIRED_APP_ENV（当前：${APP_ENV_VAL:-空}，MODE=$MODE）。
      production 模式下它驱动生产阻断逻辑（演示账号拦截、结账开关、HTTPS 强制）；
      preview 模式下应用才允许 HTTP 访问与模拟结账。"

# JWT 无论哪种模式都强制强密钥：预览也部署在公网 IP 上，弱密钥会被在线爆破。
case "$JWT_VAL" in
  ""|*CHANGE_ME*|*change-me*) die "JWT_ACCESS_SECRET 未替换，请用 \`openssl rand -base64 48\` 生成" ;;
esac
if [ "${#JWT_VAL}" -lt 32 ]; then
  die "JWT_ACCESS_SECRET 长度需 >= 32（当前 ${#JWT_VAL}）"
fi

FRONTEND_URL_VAL="$(env_get FRONTEND_URL)"
if [ "$MODE" = "preview" ]; then
  # 预览模式允许 HTTP（无域名无证书）。
  # 若是 http://<服务器IP>，浏览器通过 IP 访问即可；若留空会被拼成 localhost 导致支付回跳出错。
  case "$FRONTEND_URL_VAL" in
    http://*|https://*) : ;;
    *) die "FRONTEND_URL 必须填一个完整地址（当前：${FRONTEND_URL_VAL:-空}），
        预览模式推荐 http://<服务器公网IP>" ;;
  esac
  case "$FRONTEND_URL_VAL" in
    *localhost*) warn "FRONTEND_URL 含 localhost，远程浏览器拼接的订单私密链接会指向本机，无法访问。请改成 http://<服务器公网IP>" ;;
  esac
else
  case "$FRONTEND_URL_VAL" in
    https://*) : ;;
    *) die "FRONTEND_URL 必须为 HTTPS 地址（当前：${FRONTEND_URL_VAL:-空}）。
        应用生产校验会以 'Production FRONTEND_URL must use HTTPS' 阻止启动。" ;;
  esac
fi

if [ "$MODE" = "production" ]; then
  if [ -z "$ADMIN_EMAIL_VAL" ] || [ "${#ADMIN_PASS_VAL}" -lt 14 ]; then
    die "ADMIN_EMAIL 非空且 ADMIN_PASSWORD 长度需 >= 14。
        生产模式 seed 会强制校验这两项，否则拒绝执行。"
  fi
else
  # 预览模式 seed 不强制长度，但留默认弱口令在公网上风险大，只做提醒。
  if [ -z "$ADMIN_PASS_VAL" ] || [ "${#ADMIN_PASS_VAL}" -lt 14 ]; then
    warn "ADMIN_PASSWORD 为空或过短，预览 seed 会回退到默认口令 Admin@123456。
        公网部署强烈建议在 env 文件里设一个 >= 14 位的强口令。"
  fi
fi

if [ "$LIVE_VAL" = "true" ]; then
  if [ "$MODE" = "preview" ]; then
    die "COMMERCE_LIVE_ENABLED=true 在 preview 模式下无意义：live 必须 production 为真才会真正生效，
        且预览模式无 TLS，不能处理真实支付。请保持 COMMERCE_LIVE_ENABLED=false。"
  fi
  warn "COMMERCE_LIVE_ENABLED=true —— 即将对真实用户开放收款通道"
  for k in PAYMENT_CATEGORY_APPROVED PRODUCT_COMPLIANCE_CONFIRMED LEGAL_REVIEW_CONFIRMED TAX_REVIEW_CONFIRMED; do
    [ "$(env_get "$k")" = "true" ] || die "$k 未确认，不能开启真实收款"
  done
  # 与 commerce.config.ts 的 validate() 保持一致，避免"脚本过了但应用起不来"
  for k in STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET STORE_SUPPORT_EMAIL MAIL_FROM RESEND_API_KEY \
           STORE_SHIPPING_NOTICE STORE_RETURNS_NOTICE STORE_PRIVACY_NOTICE STORE_TERMS_NOTICE; do
    [ -n "$(env_get "$k")" ] || die "真实收款缺少 $k（应用启动时会以 'Launch blocked: $k' 拒绝启动）"
  done
  log "真实收款所需的人工确认项与密钥完整性检查通过"
else
  if [ "$MODE" = "production" ]; then
    log "COMMERCE_LIVE_ENABLED=${LIVE_VAL:-空} → 生产环境将关闭结账入口，仅保留浏览（符合预期）"
  else
    log "COMMERCE_LIVE_ENABLED=${LIVE_VAL:-空} → 预览模式：可浏览 + 可走模拟下单/模拟付款（无真实交易）"
  fi
fi

if [ "${HOPS_VAL:-0}" = "0" ]; then
  warn "TRUST_PROXY_HOPS=0，但请求会经过宿主 Nginx。
      这会让后端把所有请求识别为同一个 IP，限流会误伤真实用户。
      建议改为 TRUST_PROXY_HOPS=1。"
fi

case "$CORS_VAL" in
  *localhost*|*127.0.0.1*) die "CORS_ORIGINS 仍包含 localhost，线上会被 CORS 拦截：$CORS_VAL" ;;
esac

log "环境变量校验通过"

# ------------------------------------------------------------
# 目录与账号
# ------------------------------------------------------------
step "准备系统账号与目录"

if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --system --shell /usr/sbin/nologin --home-dir "$APP_DIR" "$SERVICE_USER"
  log "已创建系统用户 $SERVICE_USER"
else
  log "系统用户 $SERVICE_USER 已存在"
fi

mkdir -p "$WEB_ROOT" "$CERTBOT_WEBROOT" "$ENV_DIR"
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR/backend" "$APP_DIR/frontend"
chown -R "$SERVICE_USER:$SERVICE_USER" "$WEB_ROOT"

case "$APP_DIR" in
  /home/*)
    warn "APP_DIR 位于 /home 下，而 systemd 单元启用了 ProtectHome=true，会导致服务无法读取代码。
      请改用 /opt 或 /srv，或从服务单元中移除 ProtectHome。" ;;
esac
chmod 750 "$ENV_DIR"
chmod 640 "$ENV_FILE" 2>/dev/null || true
chown root:"$SERVICE_USER" "$ENV_FILE" 2>/dev/null || true
log "目录就绪：$WEB_ROOT · $ENV_DIR"

# ------------------------------------------------------------
# 隔离遗留环境文件
# 后端 @nestjs/config 的 envFilePath 是 ['.env.local', '.env']，
# 若部署目录里残留开发用的 .env / .env.local，会污染生产配置
# （例如把 APP_ENV 拉回 development）。systemd 注入优先级更高，
# 但为了不留歧义，这里统一改名隔离而不是删除。
# ------------------------------------------------------------
step "检查并隔离遗留环境文件"

STAMP="$(date +%Y%m%d%H%M%S)"
for f in "$APP_DIR/backend/.env" "$APP_DIR/backend/.env.local"; do
  if [ -f "$f" ]; then
    mv "$f" "$f.disabled-$STAMP"
    warn "已改名隔离：$f → $f.disabled-$STAMP（确认无误后可手动删除）"
  fi
done

# ------------------------------------------------------------
# 后端构建
# ------------------------------------------------------------
step "构建后端"

cd "$APP_DIR/backend"

log "安装依赖（npm ci）"
npm ci

log "生成 Prisma Client"
npx prisma generate

log "执行数据库迁移（prisma migrate deploy）"
set -a; . "$ENV_FILE"; set +a
if ! npx prisma migrate deploy; then
  die "数据库迁移失败。常见原因：
      1) 库不存在 —— 执行：
           CREATE DATABASE intimate_commerce_prod CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
           CREATE USER 'intimate_commerce'@'localhost' IDENTIFIED BY '你的密码';
           GRANT ALL PRIVILEGES ON intimate_commerce_prod.* TO 'intimate_commerce'@'localhost';
           FLUSH PRIVILEGES;
      2) MySQL 未启动：sudo systemctl status mysql
      3) DATABASE_URL 账号密码错误"
fi

log "编译 TypeScript（nest build）"
npm run build

if [ "$DO_SEED" -eq 1 ]; then
  step "初始化管理员账号（生产 seed）"
  warn "seed 使用 upsert + 空 update，已存在账号不会被重置；只会创建/保留 ADMIN_EMAIL 对应账号"
  log "当前环境：APP_ENV=${APP_ENV:-未设置}（必须为 production 才会跳过演示商品与演示顾客）"
  npx prisma db seed
else
  log "跳过 seed。若首次部署需要创建管理员，请另行执行：
        cd $APP_DIR/backend && set -a && . $ENV_FILE && set +a && npx prisma db seed"
fi

# seed 依赖 ts-node，必须在 seed 之后再裁剪 devDependencies
log "裁剪开发依赖（npm prune --omit=dev）"
npm prune --omit=dev

# 构建过程以 root 执行，这里把产物归属交回服务账号
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR/backend"

# ------------------------------------------------------------
# 前端构建
# ------------------------------------------------------------
if [ "$DO_FRONTEND" -eq 1 ]; then
  step "构建前端并同步静态产物"

  cd "$APP_DIR/frontend"
  if [ ! -f .env.production ]; then
    cp "$APP_DIR/deploy/env/frontend.env.production.example" .env.production
    log "已生成 frontend/.env.production（VITE_API_BASE_URL 留空 → 走相对路径 /api）"
  fi

  log "安装依赖（npm ci）"
  npm ci

  log "生产构建（vue-tsc -b && vite build）"
  npm run build

  case "$WEB_ROOT" in
    /|/var|/var/www|/usr|/etc|/opt|/srv|/home)
      die "WEB_ROOT 过于宽泛（$WEB_ROOT），拒绝清理，请指定具体子目录" ;;
  esac

  log "同步 dist → $WEB_ROOT"
  mkdir -p "$WEB_ROOT"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete "$APP_DIR/frontend/dist/" "$WEB_ROOT/"
  else
    find "$WEB_ROOT" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
    cp -a "$APP_DIR/frontend/dist/." "$WEB_ROOT/"
  fi
  chown -R "$SERVICE_USER:$SERVICE_USER" "$WEB_ROOT"
else
  warn "已跳过前端构建（--skip-frontend），$WEB_ROOT 保持原样"
fi

# ------------------------------------------------------------
# Nginx
# ------------------------------------------------------------
if [ "$DO_NGINX" -eq 1 ]; then
  step "安装 Nginx 站点配置"

  command -v nginx >/dev/null || die "未安装 Nginx：sudo apt-get install -y nginx"

  CERT="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
  if [ -f "$CERT" ]; then
    SRC="$APP_DIR/deploy/nginx/intimate-commerce.conf"
    log "检测到证书，安装 HTTPS 配置"
  else
    SRC="$APP_DIR/deploy/nginx/intimate-commerce-bootstrap.conf"
    if [ "$MODE" = "preview" ]; then
      log "预览模式：使用 HTTP-only 配置（无证书、server_name=$DOMAIN）"
    else
      warn "未检测到 $CERT，先安装 HTTP-only 临时配置以便签发证书"
    fi
  fi

  DST="/etc/nginx/sites-available/intimate-commerce.conf"
  sed "s/shop\.example\.com/$DOMAIN/g" "$SRC" > "$DST"
  ln -sfn "$DST" /etc/nginx/sites-enabled/intimate-commerce.conf
  if [ -e /etc/nginx/sites-enabled/default ]; then
    rm -f /etc/nginx/sites-enabled/default
    log "已停用 Nginx 默认站点（sites-enabled/default）"
  fi

  if ! nginx -t; then
    die "nginx -t 校验失败，请检查上方输出。站点配置已写入 $DST（未生效）"
  fi
  systemctl reload nginx
  log "Nginx 配置已生效（server_name: $DOMAIN）"

  if [ ! -f "$CERT" ]; then
    if [ "$MODE" = "preview" ]; then
      warn "预览模式不签发证书，站点以 HTTP 对外提供。
      安全提醒：JWT 与登录口令在 HTTP 下可被嗅探，不要放真实数据，拿到域名后尽快切到 production 模式。"
    else
      warn "证书尚未签发。接下来执行：
        sudo apt-get install -y certbot
        sudo certbot certonly --webroot -w $CERTBOT_WEBROOT -d $DOMAIN
      证书签发成功后，重新运行本脚本即可自动切换为 HTTPS 配置。"
    fi
  fi
fi

# ------------------------------------------------------------
# systemd
# ------------------------------------------------------------
step "安装并启动 systemd 服务"

UNIT_SRC="$APP_DIR/deploy/systemd/$SERVICE_NAME.service"
UNIT_DST="/etc/systemd/system/$SERVICE_NAME.service"
[ -f "$UNIT_SRC" ] || die "未找到服务单元模板：$UNIT_SRC"

sed -e "s#^WorkingDirectory=.*#WorkingDirectory=$APP_DIR/backend#" \
    -e "s#^EnvironmentFile=.*#EnvironmentFile=$ENV_FILE#" \
    -e "s#^Environment=NODE_ENV=.*#Environment=NODE_ENV=$NODE_ENV_VAL#" \
    -e "s#^User=.*#User=$SERVICE_USER#" \
    -e "s#^Group=.*#Group=$SERVICE_USER#" \
    -e "s#^ExecStart=.*#ExecStart=$NODE_BIN -r ./register-paths.cjs dist/src/main.js#" \
    "$UNIT_SRC" > "$UNIT_DST"

systemctl daemon-reload
systemctl enable "$SERVICE_NAME" >/dev/null 2>&1 || true
# 加 || true：即使服务启动即失败，也要继续走到下面的健康检查，
# 由健康检查统一打印 status 与 journalctl 日志，避免只看到一个空错误。
systemctl restart "$SERVICE_NAME" || true

log "等待服务就绪…"
PORT_VAL="$(env_get APP_PORT)"
PORT_VAL="${PORT_VAL:-3000}"
OK=0
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT_VAL/api/store/health" >/dev/null 2>&1; then OK=1; break; fi
  sleep 1
done

if [ "$OK" -ne 1 ]; then
  printf '\n'
  systemctl --no-pager --full status "$SERVICE_NAME" || true
  printf '\n'
  journalctl -u "$SERVICE_NAME" -n 60 --no-pager || true
  die "服务启动后 30 秒内健康检查未通过。
      最常见原因：生产库中仍存在使用默认口令的演示账号
      （app 启动时会主动抛错 'Launch blocked: remove default demo credentials'）。
      处理方式：删除生产库中 admin / test@example.com 的默认口令账号后重启。"
fi

log "健康检查通过：$(curl -fsS "http://127.0.0.1:$PORT_VAL/api/store/health")"

# ------------------------------------------------------------
# 汇总
# ------------------------------------------------------------
step "部署完成"

cat <<EOF
  代码目录    $APP_DIR
  环境文件    $ENV_FILE
  静态产物    $WEB_ROOT
  服务名      $SERVICE_NAME
  模式        $MODE (NODE_ENV=$NODE_ENV_VAL, APP_ENV=$REQUIRED_APP_ENV)
  对外地址    $DOMAIN
  端口(回环)  127.0.0.1:$PORT_VAL

常用命令
  systemctl status $SERVICE_NAME
  journalctl -u $SERVICE_NAME -f
  nginx -t && systemctl reload nginx
  curl -fsS http://127.0.0.1:$PORT_VAL/api/store/health

后续必做
  1) 防火墙只放行 80（+日后 443），禁止 3000 与 3306 对公网开放
  2) 数据库备份：mysqldump --single-transaction --routines --events
  3) 监控后端 /api/store/health 中的 paymentReview 与 failedEmails 指标
EOF

if [ "$MODE" = "preview" ]; then
  cat <<EOF

${YEL}预览模式提醒${RST}
  · 站点以 HTTP 对外，JWT 与登录口令可被嗅探 —— 不要录入真实客户/订单数据
  · 拿到域名后：改 /etc/intimate-commerce/backend.env 的 APP_ENV=production、
    FRONTEND_URL/CORS_ORIGINS 改成 https://域名，签发证书，再用
    sudo DOMAIN=你的域名 ./deploy/deploy.sh 切到 production 模式
EOF
else
  if [ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
    printf '\n%s证书未签发：sudo certbot certonly --webroot -w %s -d %s && sudo %s%s\n' \
      "$YEL" "$CERTBOT_WEBROOT" "$DOMAIN" "$0" "$RST"
  fi
  if [ "$LIVE_VAL" != "true" ]; then
    printf '\n%s注意：COMMERCE_LIVE_ENABLED 非 true，站点可浏览但结账入口关闭，属于预期行为。%s\n' "$YEL" "$RST"
  fi
fi
