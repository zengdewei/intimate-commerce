# 女性用品商城 MVP

基于现有项目改造的美国实物商品独立站。Vue 3 + Vite + NestJS + Prisma / MySQL。
PC 优先，适配手机；英文、美元、美国单仓。原 Proxy IP 业务已停用。

## 当前状态

已完成商品分类与详情、购物袋、游客结账、账户订单、安全查单、库存预占与释放、
模拟付款、人工发货、售后退款记录、商品库存后台及基础优惠码。

**当前是可完整测试的预览版，不接受真实交易。**
商品照片与规格、最终价格、支付商审批、政策和生产部署资源尚待经营者提供。
临时展示名称可配置，不代表最终品牌。

## 启动

需要 Node.js 20+ 以及本地 MySQL 8.0+（端口 3306，字符集 utf8mb4/utf8mb4_unicode_ci）。
Docker、Stripe 或邮件密钥仅按需要启用。
新环境将 `backend/.env.example` 复制为 `.env`，现有工作区已包含环境文件。
首次在本机建立开发数据库：

```sql
CREATE DATABASE intimate_commerce_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

示例凭据：`root` / `123456`，生产部署请更换独立账号和强密码。

在 `backend` 目录：

```sh
npm install
npx prisma migrate deploy
npx prisma db seed
npm run start:dev
```

在 `frontend` 目录：

```sh
npm install
npm run dev
```

- 店铺：<http://localhost:5173>
- 后台：<http://localhost:5173/admin>
- 开发 API 文档：<http://localhost:3000/api/docs>
- 本地管理员：`admin@example.com` / `Admin@123456`
- 本地顾客：`test@example.com` / `Test@123456`
- 演示优惠码：`PREVIEW10`

若设置了 `ADMIN_EMAIL` / `ADMIN_PASSWORD`，seed 使用指定账户；已存在账户不会重置密码。

### 开发邮件查看

订单/找单/密码重置邮件默认保存在 `StoreMail` 数据表不外发，推荐两种方式查看：

1. **不配置任何邮件键（默认）**：使用 `npx prisma studio`，打开 `StoreMail` 表查看 `text` 字段中的私密链接或验证码。
2. **本地 MailHog（推荐）**：启动 `docker run -p 1025:1025 -p 8025:8025 mailhog/mailhog` 后，
   在 `backend/.env` 设置 `DEV_SMTP_HOST=127.0.0.1`、`DEV_SMTP_PORT=1025` 重启后端。
   CommerceMail drainer 会每 30 秒抓取 outbox 投递到 MailHog，浏览器打开 <http://localhost:8025> 查看完整邮件（含发件人、收件人、正文、私密链接）。

配置生产邮件请使用 Resend（`RESEND_API_KEY` + `MAIL_FROM`）或指向真实 SMTP 服务。
两种渠道二选一即可；若两种都未配置，后端日志每轮输出 verbose 级提示避免静默积压。

## 验证

```sh
# backend
npm run build
npm run smoke:commerce

# frontend
npm run build
```

隔离数据库测试覆盖 22 项交易和权限检查，不改动开发数据。
已在浏览器验证桌面游客购买与模拟支付，并检查 390px 手机首页。

## 运行边界

- 金额为整数美分；服务端计价、库存事务、商品库存版本锁。
- 支付与物流状态独立；重复付款幂等，过期晚到付款进入人工复核。
- 未实现销售税计算，不能将"未计算"解释为免税。
- 生产环境禁用模拟付款；真实销售必须通过配置门槛和实际经营审核。
- 初始生产方案为单实例 + 独立 MySQL 数据库；不是多实例方案。
- 不上传现有开发数据库到生产；数据库导出请使用 `mysqldump --single-transaction --routines` 或托管数据库的时间点快照。
- 旧 Proxy IP 源码、文档和数据库表已全部清除，不要使用任何旧 seed、支付路由或旧验收文档。
- **后台运营增强（最新）**：
  - 商品编辑器：图片 URL 每行一条（强制 HTTPS，最多 8 张），下方即时 3 态预览网格（正常预览 / HTTPS required / Unavailable）；
    变体库存冲突全行高亮 + 一键 Reload 再保存，绝不覆盖并发变更。
    发布真实商品时强制至少包含 1 条 active 且可用库存 > 0 的变体。
  - 订单面板：payment（6 档）× fulfillment（4 档）× sort（4 档，日期/金额）三维筛选。
- **游客找单 / 密码找回 UX（最新）**：合并于 Auth 页，按路由切换模式；每个模式提供说明文案、精确提交按钮名，
  成功后内嵌下一步跳转（Forgot → Enter reset code；Reset → 1.2s 自动跳登录），切换模式自动清除残留状态。
- **真实 Stripe 会话（最新）**：按"单条折后 line + shipping_options 独立运费"构造，绝不出现负数价格。

详见 [商城功能、配置和上线检查清单](docs/COMMERCE_MVP.md)。
