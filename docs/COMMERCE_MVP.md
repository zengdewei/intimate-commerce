# 女性用品商城 MVP

## 已确认范围

- 美国市场、自有美国单仓、英文、美元、PC 优先，兼容手机和平板。
- 3～5 款起步，当前提供 4 款明确标注的演示商品。
- 暂用可配置的展示名称 `The Intimate Edit`，不是最终品牌或 Logo。
- 参考 Sustory 的商品分类与购物流程，不复制其品牌、图片、评价或销量。
- 固定运费、满额包邮、人工发货、订单查询、基础优惠码与人工售后。
- 不实现自动销售税计算；金额模型保留 `taxStatus=not_calculated`，不声明免税。

## 本地启动

需要 Node.js 20+。不需要 Docker、Redis、支付或邮件密钥。

在 `backend` 目录执行：

```sh
npm install
npx prisma migrate deploy
npx prisma db seed
npm run start:dev
```

在 `frontend` 目录执行：

```sh
npm install
npm run dev
```

默认数据库为本地 MySQL 8.0+（端口 3306），开发库名 `intimate_commerce_dev`，
字符集 `utf8mb4`，排序规则 `utf8mb4_unicode_ci`。首次准备：

```sql
CREATE DATABASE intimate_commerce_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

示例连接串：`mysql://root:123456@localhost:3306/intimate_commerce_dev?schema=public&connection_limit=10`，
生产部署请更换独立账号和强密码。

项目已有 `.env`；新环境可使用 `.env.example` 复制准备 `.env`。
应用优先读取 `.env.local`，其次 `.env`；Prisma CLI 默认读取 `.env`。
两处 `DATABASE_URL` 必须一致，生产建议通过进程环境统一注入。

访问：

- 商城：http://localhost:5173
- 后台：http://localhost:5173/admin
- 开发 API 文档：http://localhost:3000/api/docs
- 管理员：`admin@local.dev` / `Admin@123456`
- 演示顾客：`test@example.com` / `Test@123456`
- 演示优惠码：`PREVIEW10`，减免 10%。

以上密码仅限本地。管理员邮箱与密码取自 `ADMIN_EMAIL` / `ADMIN_PASSWORD`，未设置时回退为
`admin@example.com` / `Admin@123456`。本工作区 `backend/.env` 设为 `ADMIN_EMAIL="admin@local.dev"`，
因此实际管理员是 `admin@local.dev`（`npx prisma db seed` 日志会打印真实生效的邮箱）。
seed 使用 `upsert` + 空 `update`，已存在账户不会被 seed 重置密码；旧开发数据库可能已有历史测试账户。

## 页面

| 页面 | 路由 |
| --- | --- |
| 首页 | `/` |
| 分类列表 | `/shop?category=non-powered`、`/shop?category=powered` |
| 商品详情 | `/products/:slug` |
| 购物袋 / 结账 | `/cart`、`/checkout` |
| 订单详情 | `/orders/:id` |
| 游客找单 | `/track` |
| 登录 / 注册 / 找回 | `/login`、`/register`、`/forgot`、`/reset` |
| 账户 | `/account` |
| 后台 | `/admin` |
| 帮助与政策 | `/help`、`/help/:page`、`/guide` |

## 操作方式

### 商品与库存

后台可以新建商品、编辑说明、图片 HTTPS 地址、材质、尺寸、护理方式及规格。
图片当前通过地址录入（每行一个，最多 8 条，强制 HTTPS），不包含文件上传或图片存储服务。
编辑器在图片文本区下方提供即时预览网格：每条 URL 独立显示状态标签（正常预览 / HTTPS required / Unavailable），
无效协议或加载失败的图片会高亮提醒，保存前再次校验。
商品可设为草稿、发布、演示、推荐；下架不删除历史订单。

没有真实图片的演示商品以文字编辑卡片展示，不伪造实物照片。
首页氛围图是生成的生活方式图片，不代表在售商品。
取消演示标记并发布时，接口要求：至少包含 1 条 active 变体且可用库存 `>0`，
同时应具备图片、材质、尺寸和护理说明；
资料真实性和销售资格仍需人工核验。

金额使用整数美分，例如 `3800` 表示 `$38.00`。库存字段表示可售库存，不含预占数量。
后台库存编辑附带版本号；编辑期间发生下单、释放或退回库存时，保存将返回冲突：
- 前端识别冲突消息，在变体编辑器每行显示"Reload to pick up latest version before saving."行级提示，
  编辑器顶部提供"Reload this product"一键重载，避免丢失其他字段。
- 后端仅允许 `updateMany(... where { id, version })` 匹配成功时写入，绝不覆盖并发变更。

### 购买与支付

服务端读取商品实时价格，不接受客户端传入总额。每规格最多购买 10 件。
下单事务保存商品与地址快照、计算优惠和运费、预占库存，订单保留 35 分钟。
同一请求使用幂等键，重试不会重复预占。库存不足时整个订单回滚。

开发环境在订单详情点击 `Simulate successful payment`，不输入银行卡、不产生真实扣款。
生产预览模式关闭下单与模拟支付。真实模式只处理验签通过、金额及币种匹配的支付；
支付回跳不是付款凭据。重复回调不会重复处理订单。

当前真实支付适配器是 Stripe Checkout，但支付渠道尚未选定或获批，不能视为已获得
该品类的收款许可。若最终选择其他支付商，需替换适配器并完成真实集成测试。
Stripe 会话按"折后金额单一行 + 单独运费 shipping_options shipping_rate_data"构造：
`subtotal - discount` 作为单条 `price_data.unit_amount`，`order.shipping` 作为单独的
`shipping_options[0].shipping_rate_data.fixed_amount.amount`（正数），避免负数 line item。
Stripe 创建会话至少需要 30 分钟有效期，因此尚未创建付款会话、且下单超过约 4 分钟时，
会要求取消并重新下单；已生成会话使用同一幂等键重试。

订单超过期限自动释放库存。付款在取消或过期之后到达时进入 `payment_review`，
不能自动发货，运营需要核对并退款。库存释放时 `updateMany` 必须按行返回影响数，
否则抛出冲突，绝不重复释放。后台概览显示此类订单数量和失败邮件数量。

### 发货与售后

后台订单支持多维度筛选与排序：
- 按支付状态：全部 / pending / paid / payment_review / refunded / after-sales requests
- 按履约状态（新增）：全部 / unfulfilled / shipped / returned
- 排序（新增）：Newest first / Oldest first / Largest total / Smallest total
每条订单展开显示客户、地址、物品、金额和运费明细；承运商、运单号发货确认，以及售后、全额退款记录，
都在同一面板完成。

后台选择承运商并填写单号，订单变为 `shipped`，发送发货通知。
不对接购买面单、承运商实时查询、签收回传、多仓、多包裹或拆单。
客户订单页展示承运商与单号，不虚构物流轨迹。

用户可提交售后原因，后台状态为：
`requested → approved → received`，或 `requested → rejected`。
存在待处理/已批准售后请求时，不能发货。

退款目前采用“支付商后台先操作全额退款，再录入退款 reference”的方式。
真实 Stripe 模式核验退款成功状态、金额、币种及所属 payment intent；
开发模式允许演示 reference。此表单不直接发起退款，不支持部分退款。
仅在商品实际可重新出售时勾选恢复库存；已发货商品必须先确认退回。
晚到付款的库存已释放，不会再次恢复。

### 隐私与账户

游客订单使用安全访问凭证，数据库仅保存访问凭证摘要。凭证通过邮件链接的 URL fragment
传递，页面读取后移除 fragment，之后由 `X-Order-Token` 请求头传递，不写入普通访问 URL。
默认有效期 30 天，可通过订单号和邮箱申请访问邮件。页面不直接返回凭证或泄露订单是否存在。
凭证持有人可以查看订单，必须提醒顾客不要转发链接。

账户订单只归属于下单时已登录的账户；不会仅凭相同邮箱自动关联未验证的游客历史订单。
管理员每次请求从数据库核验权限；商品、优惠码、发货、售后及退款操作写入审计表。
密码重置使用随机六位码、请求节流、失败次数限制和一次性领取。
JWT 默认 15 分钟，不提供刷新令牌；到期需重新登录。
年龄确认只是前台声明，不是身份证明或完整的地区年龄验证系统。

### 邮件

订单、支付、发货、退款、查单和密码重置邮件保存在 `StoreMail` outbox，作为权威审计记录。
未配置任何邮件渠道时，邮件仅保存在本地不外发：
- 开发人员可使用 `npx prisma studio` 查看 `StoreMail.text` 中的测试链接或验证码。
- 若 outbox 中存在 pending 邮件且未配置邮件渠道，每轮调度输出一条 verbose 级别日志，避免静默积压。
不要把这些内容复制到公开日志或发给其他人。

当前支持两种出站渠道（**任一即可**）：
1. **Resend**（推荐）：设置 `RESEND_API_KEY` + `MAIL_FROM`。每 30 秒领取待发邮件，使用 `Idempotency-Key: <StoreMail.id>` 调用 `/emails`，
   失败指数退避，最多 8 次重试。
2. **SMTP fallback**：设置 `DEV_SMTP_HOST` + `DEV_SMTP_PORT`，可选 `DEV_SMTP_USER` / `DEV_SMTP_PASS`。
   开发环境推荐本地 MailHog（默认端口 1025，Web UI 8025）查看邮件；生产环境可指向自建 SMTP 服务。

成功发送后 `StoreMail.status = 'sent'`，`text` 被替换为 `[delivered]`，避免长期保留私密链接。
超过重试次数的邮件需管理员在数据库中确认原因、修复配置后把 `attempts` 重置为 0 并将 `nextAt` 设为当前时间。
后台概览实时展示 `Pending emails` / `Failed emails` 数量。

### 游客找回 / 密码找回页面 UX

游客找回订单（`/track`）、密码重置请求（`/forgot`）和代码确认页（`/reset`）统一合并在 Auth 页面，按路由切换：
- 每个模式提供 muted 说明文案：Track 显示 30 天链接时效；Forgot 说明 15 分钟 code 过期；Reset 说明密码最小 8 位。
- 提交按钮文案按模式精确化：`Email order link` / `Email reset code` / `Change password` / `Sign in` / `Create account`。
- 成功 notice 内嵌后续操作跳转：Forgot 成功后提供「Enter reset code」按钮；Reset 成功后 1.2 秒自动跳转登录。
- 模式切换时自动清空错误与成功状态，避免跨模式残留误导提示。

## 自动验证

在 `backend`：

```sh
npm run build
npm run smoke:commerce
```

测试创建独立临时 MySQL 数据库（`CREATE DATABASE smoke_<hash>`），应用所有迁移并在完成后删除，
仅写自己的测试数据，不修改开发数据库。覆盖注册、管理权限、资料校验、计价、优惠、数量和金额篡改、
游客权限、幂等、库存冲突、支付验签、重复付款、人工发货、退货、退款、取消、
超时释放、晚到支付、找单邮件、密码重置及生产模拟支付禁用。

在 `frontend`：

```sh
npm run build
```

2026-10-08 已验证：
- 后端 `nest build` 通过；隔离集成测试 `commerce.smoke.ts` 全通过 22 项（注册、权限、计价、优惠、
  篡改拒绝、幂等、库存冲突、支付验签、晚到付款、发货/售后/退款、取消释放、
  超时释放、找单、密码重置 outbox、live 模式阻断、admin 数据库级权限、审计日志）。
- 前端 `vue-tsc -b && vite build` 生产构建通过。
- 桌面浏览器实走：首页 → 游客加入购物袋 → 结账创建订单 → 模拟付款 → 订单详情 paid/unfulfilled 渲染。
- 390px 手机宽度首页无横向溢出，抽屉导航与徽标正常显示。
- Admin 后台：图片 URL 编辑器三种状态（HTTPS required / 正常预览 / Unavailable 加载失败）全部可视化；
  变体库存冲突行级高亮 + 一键 Reload 按钮；订单 payment × fulfillment × sort 三维筛选控件正常。
- Track 游客找单提交成功后显示静默确认消息 + Back to sign in 内联跳转；Forgot/Reset 成功后状态消息正确。
- CommerceMail drainer 启动日志确认：DEV_SMTP 配置识别为 `CommerceMail drainer: DEV SMTP configured at 127.0.0.1:1025`。
- 真实支付、真实邮件出站、真实物流、生产主机和备份恢复尚未验收。

## 生产部署

首版最简单的部署方案是单台主机、单个 Node 进程 + 独立 MySQL 8.0+（建议 utf8mb4_unicode_ci）。
这不是横向扩容方案；需要多实例时应补充并发压测、读写分离或 PostgreSQL 等更强数据库，并调整只读与延迟副本。
当前 Prisma provider 固定为 `mysql`，迁移历史也是 MySQL 专用（TEXT 无默认值、VARCHAR 列宽等），
不要只改 `DATABASE_URL` 就切换 SQLite/PostgreSQL。

1. 使用新的生产数据库，不要把含演示账户与订单的开发库克隆到生产。
2. 设置 `NODE_ENV=production`、`APP_ENV=production`、唯一随机 JWT 密钥及 HTTPS 前端地址。
3. 安装依赖、运行 `prisma generate`、`prisma migrate deploy`，使用安全的管理员账户 seed。
4. 执行后端 `npm run build`，使用 `npm run start:prod`；前端构建后将 `dist` 交给 Nginx/CDN。
5. 同域反代 `/api/` 至后端，其他路径 SPA fallback 到 `index.html`；不要用 Vite dev server 承载生产。
6. 配置 TLS、HTTP 跳转 HTTPS、限制后端端口访问、进程守护和重启。
7. 若可信反代为一跳，设置 `TRUST_PROXY_HOPS=1`，并确保后端端口不对公网开放。
8. 添加可达性监控，监控后台 `paymentReview`、`failedEmails`、磁盘余量和进程异常。
9. 制定持久化备份、访问控制、保留周期，并实际恢复到隔离环境验证。

历史改造前备份已删除。备份 MySQL 请使用 `mysqldump --single-transaction --routines --events`，或使用托管数据库
官方快照/时间点恢复。生产账户、数据库、邮件凭证及备份不能放入前端静态目录或版本库。

## 真实销售开关

参考 `.env.example`。默认 `COMMERCE_LIVE_ENABLED=false`。
开启真实模式需要经营者实际完成审核后配置：

- `PAYMENT_CATEGORY_APPROVED=true`
- `PRODUCT_COMPLIANCE_CONFIRMED=true`
- `LEGAL_REVIEW_CONFIRMED=true`
- `TAX_REVIEW_CONFIRMED=true`
- 真实支付与 webhook 密钥、Resend、发件地址、客服地址。
- 已确认的配送、退货、隐私、条款文本。

这些配置是技术上的防误开门槛，不是系统能自动确认的法律结论。
销售税功能本轮未实现。如核实后需要代收税，则须先补实现并测试，再开放真实交易。
不要仅为通过启动检查随意填写 `true`。

Stripe webhook 地址为 `POST /api/store/webhook/stripe`。
使用标准托管结账，不将卡号传入本站接口。真实支付及退款需要最终商户账户联调。

## 代码与数据边界

项目已完全转型为女性成人用品独立站，与旧的 Proxy IP 业务不再有任何交集：

- 旧源码已全部清除：`core/{orders,products,payments,notifications}`、`modules/intimate-commerce`、`admin/*`、`webhooks/*`、`identity/api-keys.service`。
- 旧数据库表已全部清除：`Product`、`Order`、`Payment`、`UserProxyInstance`、`ProviderConfig`、`ProviderBalanceLog`、`EmailLog`；仅保留共享的 `User`、`VerificationCode`、`AdminAuditLog` 与新商城 `Store*` 系列表。
- 旧文档已全部清除：`PROJECT_PLAN.md` 与 `docs/01-*` 至 `04-*`。
- 当前种子脚本为 `prisma/commerce.seed.ts`；冒烟测试为 `prisma/commerce.smoke.ts`。
- 构建入口仅注册 `IdentityModule + CommerceModule`，不存在任何遗留路由或定时任务。

## 尚未包含

正式品牌设计、实际商品录入与摄影、文件上传存储、多币种、多语言、积分、订阅、
真实评论、部分退款、拆单、实时物流、税务引擎、身份证件验证、完整法律审阅、
生产部署与商业账户审核，均不应被当作已交付能力。
