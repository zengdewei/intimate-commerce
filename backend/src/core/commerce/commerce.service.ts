/**
 * ============================================================================
 * 商城核心业务服务（CommerceService）
 * ----------------------------------------------------------------------------
 * 职责：承载商城的全部业务规则，是订单生命周期的唯一权威实现。包含：
 *   1. 商品目录与详情（catalog / product）
 *   2. 购物车计价（calculate / quote）——服务端唯一计价入口
 *   3. 下单与库存预占（checkout）——含幂等键与乐观锁
 *   4. 订单访问鉴权（authorize）——登录用户或游客私密令牌二选一
 *   5. 支付结算（payment / mockPay / webhook / settle）
 *   6. 库存释放（release / expire / cancel）——超时或取消时归还库存
 *   7. 售后与退款（requestReturn / updateReturn / refund）
 *   8. 后台商品/订单/优惠码管理与操作审计
 *
 * 关键设计约定：
 *   - 金额一律为「整数美分」，绝不用浮点数，避免精度误差。
 *   - 计价只在服务端进行；前端传来的价格一律忽略。
 *   - 支付状态（paymentStatus）与履约状态（fulfillmentStatus）相互独立，
 *     一笔订单可能「已付款未发货」，也可能「待支付」。
 *   - 所有涉及库存与状态的写操作均在数据库事务内完成，并对变体版本号
 *     （StoreVariant.version）做乐观锁校验，防止并发超卖。
 *   - 生产环境（production）与真实收款（live）是两道独立开关：
 *     production 管安全基线，live 才真正放开支付通道。
 * ============================================================================
 */

import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma, StoreOrder } from '@prisma/client';
import { createHash, createHmac, randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '@/infrastructure/database/prisma.service';
import { CheckoutDto, CouponDto, ProductDto, QuoteDto, RefundDto, ReturnUpdateDto, ShipmentDto } from './commerce.dto';
import { CommerceConfig } from './commerce.config';
import { CommercePayments } from './commerce.payments';

/** 事务客户端类型别名，便于在私有方法签名中复用。 */
type Tx = Prisma.TransactionClient;

/**
 * 商品品类处理器契约。
 * 不同品类（如「非电动」「电动」）可有各自的校验/上架规则，
 * 通过注册表注入结算流程，避免在结算主链路里写 if-else 分支。
 */
interface CategoryHandler { productCategory: string; validate(): void }

/**
 * 品类处理器注册表（策略模式的轻量实现）。
 * 以 productCategory 字符串为键注册处理器，结算时按商品品类取出校验。
 */
class CategoryHandlerRegistry<T extends CategoryHandler> {
  private readonly map = new Map<string, T>();
  /** 注册一个品类处理器，同键后注册者覆盖先注册者。 */
  register(handler: T) { this.map.set(handler.productCategory, handler); }
  /** 按品类取处理器；未注册的品类返回 undefined（结算时会被判为不支持）。 */
  get(category: string): T | undefined { return this.map.get(category); }
}

/** SHA-256 十六进制摘要，用于生成请求指纹与访问令牌摘要。 */
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
/** 查询订单时统一带出的关联数据（明细项 + 售后单），避免各处重复书写。 */
const include = { items: true, returns: true } as const;

@Injectable()
export class CommerceService implements OnModuleInit {
  /** 品类处理器注册表，onModuleInit 时填充。 */
  private readonly registry = new CategoryHandlerRegistry<CategoryHandler>();

  constructor(
    private readonly db: PrismaService,
    /** 商城配置（环境开关、运费、公告文案等）。 */
    readonly settings: CommerceConfig,
    /** 支付通道适配器（Stripe 或降级实现）。 */
    private readonly payments: CommercePayments,
  ) {}

  /**
   * 模块启动钩子：执行配置自检，并在生产环境阻断「默认演示账号」上线。
   * 默认口令若仍存在于生产库中，直接抛错阻止启动，避免开箱即被登录。
   */
  async onModuleInit() {
    this.settings.validate();
    if (this.settings.production) {
      // 检查管理员账号与测试账号是否仍在使用 README 中公开的默认口令。
      const accounts = await this.db.user.findMany({ where: { OR: [{ isAdmin: true }, { email: 'test@example.com' }] } });
      for (const account of accounts) {
        if (await bcrypt.compare('Admin@123456', account.passwordHash) || await bcrypt.compare('Test@123456', account.passwordHash)) {
          throw new Error('Launch blocked: remove default demo credentials from the production database');
        }
      }
    }
    // Category behavior is registered, not branched in the checkout pipeline.
    // 品类行为通过注册表挂载，而不是在结算流程里写分支判断。
    for (const category of ['non-powered', 'powered']) this.registry.register({ productCategory: category, validate() {} });
  }

  /**
   * 生成订单访问令牌：HMAC-SHA256(密钥, "store-order:" + 订单 ID)。
   * 该令牌下发给结账者，游客凭它即可查看/支付自己的订单，无需注册。
   */
  private token(id: string) { return createHmac('sha256', this.settings.secret).update(`store-order:${id}`).digest('hex'); }

  /** 商品出参归一化：把数据库中以 JSON 字符串存储的 images 还原为数组。 */
  private productView(p: any) { return { ...p, images: JSON.parse(p.images) }; }

  /**
   * 订单出参归一化（白名单式脱敏）。
   * 先剥离访问凭证、幂等键、支付会话等敏感字段，再把 address 由 JSON 字符串还原为对象。
   */
  private orderView(o: any) {
    const { accessHash, accessExpiresAt, requestHash, idempotencyKey, paymentIntent, paymentSession, ...view } = o;
    return { ...view, address: JSON.parse(o.address) };
  }

  /**
   * 前台商品目录。
   * - 仅返回 active 商品；live 模式下额外过滤掉演示商品（demo=true）。
   * - 每个商品只带 active 变体，并按价格升序排列。
   * - 排序：推荐位（featured）优先，其次按创建时间倒序。
   */
  async catalog() {
    const products = await this.db.storeProduct.findMany({
      where: { active: true, ...(this.settings.live ? { demo: false } : {}) },
      include: { variants: { where: { active: true }, orderBy: { price: 'asc' } } },
      orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
    });
    return products.map(p => this.productView(p));
  }

  /** 按 slug 查询单个商品详情，未上架或不存在统一返回 404。 */
  async product(slug: string) {
    const p = (await this.catalog()).find(p => p.slug === slug);
    if (!p) throw new NotFoundException('Product not found');
    return p;
  }

  /**
   * 核心计价函数（服务端唯一权威计价入口）。
   *
   * 计算步骤：
   *   1. 合并同一变体的重复行（同一 variantId 数量累加）。
   *   2. 逐项校验：数量为 1~10 的整数、变体与所属商品均为 active、
   *      live 模式下禁止演示商品、库存充足、品类处理器已注册。
   *   3. 汇总小计（subtotal），按优惠码比例计算折扣（向下取整）。
   *   4. 折后金额达到免邮门槛则运费为 0，否则按配置收取固定运费。
   *   5. 返回含税状态标记 taxStatus='not_calculated'——本系统不计算销售税，
   *      「未计算」不等于「免税」，前端与政策文案必须如实呈现。
   *
   * 注意：本函数必须在事务内调用，以保证「校验库存 → 扣减库存」之间数据一致。
   *
   * @param tx  Prisma 事务客户端
   * @param input 计价入参（商品行 + 可选优惠码）
   */
  private async calculate(tx: Tx, input: QuoteDto) {
    // 步骤 1：合并同一变体的多行数量，防止前端拆行绕过单变体数量上限。
    const quantities = new Map<string, number>();
    for (const item of input.items) quantities.set(item.variantId, (quantities.get(item.variantId) || 0) + item.quantity);

    const lines: any[] = [];
    for (const [id, quantity] of quantities) {
      // 步骤 2：数量边界校验（单变体最多 10 件）。
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) throw new BadRequestException('Maximum 10 per variant');

      const variant = await tx.storeVariant.findUnique({ where: { id }, include: { product: true } });
      // 变体不存在、已下架、所属商品已下架，或 live 模式下的演示商品，一律视为不可售。
      if (!variant || !variant.active || !variant.product.active || (this.settings.live && variant.product.demo)) throw new BadRequestException('Product is unavailable');
      // 库存校验放在事务内，与后续扣减同事务，避免超卖。
      if (variant.stock < quantity) throw new ConflictException(`${variant.product.name}: insufficient stock`);

      // 走注册表做品类级校验；未注册品类说明配置缺失，直接拒绝下单。
      const handler = this.registry.get(variant.product.category);
      if (!handler) throw new BadRequestException('Unsupported product category');
      handler.validate();

      // 生成订单行快照：名称/规格/SKU 冗余存储，保证历史订单不受商品后续改名影响。
      lines.push({ variantId: id, name: variant.product.name, label: variant.label, sku: variant.sku,
        category: variant.product.category, quantity, unitPrice: variant.price });
    }

    // 步骤 3：小计 = Σ(单价 × 数量)；金额均为整数美分。
    const subtotal = lines.reduce((n, l) => n + l.unitPrice * l.quantity, 0);

    let discount = 0;
    const code = input.coupon?.trim().toUpperCase() || null;
    if (code) {
      const coupon = await tx.storeCoupon.findUnique({ where: { code } });
      // 优惠码需同时满足：存在、启用、未过期、且达到最低消费门槛。
      if (!coupon || !coupon.active || (coupon.expiresAt && coupon.expiresAt <= new Date()) || subtotal < coupon.minimum) {
        throw new BadRequestException('Coupon is invalid, expired, or minimum spend is not met');
      }
      // 折扣向下取整（floor），避免出现小数美分，且对商家更保守。
      discount = Math.floor(subtotal * coupon.percent / 100);
    }

    // 步骤 4：运费按「折后金额」判断是否达到免邮门槛。
    const cfg = this.settings.publicSettings();
    const shipping = subtotal - discount >= cfg.freeShippingAt ? 0 : cfg.shipping;
    return { lines, subtotal, discount, shipping, total: subtotal - discount + shipping, coupon: code, taxStatus: 'not_calculated' };
  }

  /**
   * 对外报价接口：先释放过期订单（顺带归还其库存），再在事务内执行计价。
   * 仅做试算，不写库、不占库存。
   */
  async quote(input: QuoteDto) {
    await this.expire();
    return this.db.$transaction(tx => this.calculate(tx, input));
  }

  /**
   * 下单（结账）核心流程。
   *
   * 关键保障：
   *   - 生产未放行时（production && !live）直接拒绝结账。
   *   - 幂等：以客户端生成的 idempotencyKey 去重；若同一键携带不同下单内容，
   *     判定为键复用冲突并报 409，防止重复扣款或串单。
   *   - 原子性：校验、扣库存、建单、写邮件队列全部在单个事务内完成，
   *     任一环节失败则整体回滚，不会出现「有订单无库存扣减」的中间态。
   *   - 防超卖：条件更新（stock >= 数量 且 active）配合 version 自增，
   *     更新影响行数为 0 即说明库存被并发抢占，立即中断事务。
   *
   * @param input  结账入参（含商品行、邮箱、地址、幂等键、条款同意标记）
   * @param userId 已登录用户 ID；游客结账时为 undefined
   * @returns 订单 ID 与访问令牌（游客后续凭此访问订单）
   */
  async checkout(input: CheckoutDto, userId?: string) {
    // 生产环境未开启 live 时，结账入口整体关闭（预览版不接受真实交易）。
    if (this.settings.production && !this.settings.live) throw new ServiceUnavailableException('Checkout is closed until launch approval');

    await this.expire();

    // 请求指纹：把下单内容（邮箱小写、用户 ID 归一化后）哈希，用于识别幂等键是否被换内容复用。
    const requestHash = hash(JSON.stringify({ ...input, email: input.email.toLowerCase(), userId: userId || null }));

    // 幂等前置检查：同一键重复提交直接返回既有订单，不重复建单。
    const existing = await this.db.storeOrder.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) {
      if (existing.requestHash !== requestHash) throw new ConflictException('Checkout key was already used for different details');
      return { id: existing.id, accessToken: this.token(existing.id) };
    }

    const id = randomBytes(16).toString('hex');
    await this.db.$transaction(async tx => {
      const quote = await this.calculate(tx, input);

      // 逐行预占库存：条件更新 + 版本号自增，影响行数为 0 视为并发抢占，直接失败。
      for (const item of quote.lines) {
        const reserved = await tx.storeVariant.updateMany({
          where: { id: item.variantId, stock: { gte: item.quantity }, active: true },
          data: { stock: { decrement: item.quantity }, version: { increment: 1 } },
        });
        if (!reserved.count) throw new ConflictException('Stock changed. Please refresh your cart.');
      }

      // 建单：订单号形如 IE-YYYYMMDD-XXXXXX；存 accessHash 而非明文令牌。
      const order = await tx.storeOrder.create({ data: {
        id, number: `IE-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomBytes(4).toString('hex').toUpperCase()}`,
        userId, email: input.email.toLowerCase(), address: JSON.stringify(input.address),
        // 访问令牌仅存哈希；有效期 30 天。
        accessHash: hash(this.token(id)), accessExpiresAt: new Date(Date.now() + 30 * 86400000),
        idempotencyKey: input.idempotencyKey, requestHash,
        subtotal: quote.subtotal, discount: quote.discount, shipping: quote.shipping, total: quote.total, coupon: quote.coupon,
        // 支付窗口 35 分钟；超时由 expire() 定时释放库存。
        expiresAt: new Date(Date.now() + 35 * 60000),
        items: { create: quote.lines },
      } });

      // 入队「订单已创建」邮件（不直接外发，由 CommerceMail 定时投递）。
      await this.mail(tx, order, 'created', 'Order received', `Your order ${order.number} is awaiting payment.`);
    }, { timeout: 10000 }); // 事务超时 10 秒，避免长时间持锁

    return { id, accessToken: this.token(id) };
  }

  /**
   * 将邮件写入发件箱（StoreMail 表），由 CommerceMail 的定时任务异步投递。
   *
   * 幂等设计：以 `${event}:${orderId}` 作为 eventKey 唯一键，upsert 且 update 为空操作，
   * 因此同一事件的重复触发不会产生重复邮件。
   *
   * 邮件正文自动附带订单私密链接（含访问令牌），并提示 30 天有效期与勿转发。
   */
  private async mail(tx: Tx, order: StoreOrder, event: string, subject: string, body: string) {
    const link = `${this.settings.frontend}/orders/${order.id}#access=${this.token(order.id)}`;
    await tx.storeMail.upsert({
      where: { eventKey: `${event}:${order.id}` }, update: {},
      create: { eventKey: `${event}:${order.id}`, recipient: order.email, subject,
        text: `${body}\n\nView your order securely: ${link}\nThis private link expires after 30 days. Do not forward it.` },
    });
  }

  /**
   * 订单访问鉴权（双通道，满足任一即可）。
   *   通道 A：登录用户且订单归属本人（order.userId === userId）。
   *   通道 B：持有有效访问令牌——未过期且 SHA-256(令牌) 与库中 accessHash 一致。
   * 鉴权失败统一抛 404（而非 403），避免泄露「该订单是否存在」。
   */
  async authorize(id: string, token?: string, userId?: string) {
    const order = await this.db.storeOrder.findUnique({ where: { id }, include });
    if (!order || !((userId && order.userId === userId) ||
      (token && order.accessExpiresAt > new Date() && hash(token) === order.accessHash))) {
      throw new NotFoundException('Order not found or access expired');
    }
    return order;
  }

  /** 查询单个订单详情（先释放过期订单，再做鉴权与脱敏输出）。 */
  async order(id: string, token?: string, userId?: string) {
    await this.expire();
    return this.orderView(await this.authorize(id, token, userId));
  }

  /** 查询当前登录用户的订单列表（按创建时间倒序，最多 100 条）。 */
  async myOrders(userId: string) {
    await this.expire();
    return (await this.db.storeOrder.findMany({ where: { userId }, include, orderBy: { createdAt: 'desc' }, take: 100 })).map(o => this.orderView(o));
  }

  /**
   * 游客找单（安全查单）。
   *
   * 防枚举设计：
   *   - 必须先匹配「订单号 + 邮箱」组合，二者缺一不可。
   *   - 无论订单是否存在，返回值完全一致，攻击者无法据此判断订单是否真实存在。
   *   - 邮件事件键带 5 分钟时间窗（Date.now()/300000），既允许用户重试，
   *     又能在 5 分钟内阻止对同一订单的重复发信轰炸。
   *   - 命中订单时顺带把访问链接有效期续期为 30 天。
   */
  async recovery(number: string, email: string) {
    const order = await this.db.storeOrder.findFirst({ where: { number, email: email.toLowerCase() } });
    if (order) await this.db.$transaction(async tx => {
      await tx.storeOrder.update({ where: { id: order.id }, data: { accessExpiresAt: new Date(Date.now() + 30 * 86400000) } });
      await this.mail(tx, order, `access-${Math.floor(Date.now() / 300000)}`, 'Your order access link', 'You requested access to your order.');
    });
    return { message: 'If the details match, a private order link will be emailed to you.' };
  }

  /**
   * 发起支付。
   *   - 仅 pending 且未过期的订单可支付。
   *   - 未开启 live 时：生产环境拒绝（结账关闭），开发环境返回 { demo: true } 走模拟付款。
   *   - live 模式下创建 Stripe Checkout Session；Stripe 要求会话有效期至少 30 分钟，
   *     故当剩余支付窗口不足 31 分钟且尚未创建过会话时，提前要求用户重新下单。
   */
  async payment(id: string, token?: string, userId?: string) {
    const order = await this.authorize(id, token, userId);
    if (order.paymentStatus !== 'pending' || order.expiresAt <= new Date()) throw new BadRequestException('Order is no longer payable');

    if (!this.settings.live) {
      if (this.settings.production) throw new ServiceUnavailableException('Checkout is closed');
      return { demo: true };
    }

    // Stripe requires at least 30 minutes until expiry when creating a new session.
    // Stripe 创建会话要求订单有效期至少还剩 30 分钟，这里留 1 分钟余量。
    if (!order.paymentSession && order.expiresAt.getTime() - Date.now() < 31 * 60000) {
      throw new BadRequestException('Payment window elapsed. Cancel this order and check out again.');
    }

    // 复用已创建的会话（paymentSession 已存在时不重建），避免重复计费风险。
    const result = await this.payments.create(order);
    await this.db.storeOrder.update({ where: { id }, data: { paymentSession: result.id } });
    return { demo: false, url: result.url };
  }

  /**
   * 模拟付款（仅开发/预览环境可用）。
   * 生产环境或已开启 live 时一律返回 404，确保模拟付款绝不可能出现在真实交易链路上。
   */
  async mockPay(id: string, token?: string, userId?: string) {
    if (this.settings.production || this.settings.live) throw new NotFoundException();
    const order = await this.authorize(id, token, userId);
    return this.settle(order.id, order.total, 'usd', `mock-${id}`, `mock-${id}`);
  }

  /**
   * Stripe Webhook 入口。
   * 先验签（parse 内部完成签名校验，失败即 400），再只关心
   * checkout.session.completed 且 payment_status === 'paid' 的事件；
   * 其余事件一律忽略（返回 { ignored: true }）保证幂等重放安全。
   * 订单 ID 从 session.metadata.storeOrderId 取回（创建会话时写入）。
   */
  async webhook(payload: Buffer, signature?: string) {
    const event = this.payments.parse(payload, signature);
    if (event.type !== 'checkout.session.completed') return { ignored: true };
    const session = event.data.object;
    if (session.payment_status !== 'paid' || !session.metadata?.storeOrderId) return { ignored: true };
    return this.settle(session.metadata.storeOrderId, session.amount_total!, session.currency!, session.id, String(session.payment_intent));
  }

  /**
   * 结算（把订单标记为已付款）——支付成功与模拟付款共用此路径。
   *
   * 三重校验（任一不满足即拒绝，防止伪造/串单）：
   *   1. 金额与币种必须与订单完全一致。
   *   2. 订单若已绑定支付会话，则会话 ID 必须一致（防跨订单挪用）。
   *   3. 已处于 paid / refunded / payment_review 的订单视为重复回调，直接返回 duplicate。
   *
   * 晚到付款处理：订单若已过期或已非 pending（例如超时后库存已释放），
   * 不直接标记已付，而是转入 payment_review（人工复核）并记录 paidAt，
   * 由运营决定退款或补发，避免自动发错货。
   *
   * 并发保护：最终状态更新使用条件更新（where paymentStatus='pending'），
   * 影响行数为 0 说明已被其他请求抢先结算，返回 duplicate。
   */
  private async settle(id: string, amount: number, currency: string, session: string, intent: string) {
    return this.db.$transaction(async tx => {
      const order = await tx.storeOrder.findUnique({ where: { id }, include });
      if (!order || amount !== order.total || currency !== order.currency) throw new BadRequestException('Payment does not match order');
      if (order.paymentSession && order.paymentSession !== session) throw new BadRequestException('Unexpected payment session');
      // 已结算过的终态，重复回调直接忽略（Webhook 可能重放多次）。
      if (['paid', 'refunded', 'payment_review'].includes(order.paymentStatus)) return { duplicate: true };

      // 晚到付款：订单已过期或状态异常，进入人工复核。
      if (order.paymentStatus !== 'pending' || order.expiresAt <= new Date()) {
        // 若仍是 pending 但已过期，先释放（此时库存可能已被 expire 释放过，release 内部会幂等处理）。
        if (order.paymentStatus === 'pending') await this.release(tx, order, 'expired');
        await tx.storeOrder.update({ where: { id }, data: { paymentStatus: 'payment_review', paymentSession: session, paymentIntent: intent, paidAt: new Date() } });
        return { review: true };
      }

      // 正常路径：条件更新保证只有一次请求能把订单从 pending 推进到 paid。
      const updated = await tx.storeOrder.updateMany({
        where: { id, paymentStatus: 'pending' }, data: { paymentStatus: 'paid', paidAt: new Date(), paymentSession: session, paymentIntent: intent },
      });
      if (!updated.count) return { duplicate: true };
      await this.mail(tx, order, 'paid', 'Payment received', `Payment for ${order.number} has been received. Your order is awaiting dispatch.`);
      return { paid: true };
    });
  }

  /**
   * 释放订单（超时/取消）并归还库存。
   *
   * 幂等保护：先以条件更新把订单从 pending 推进到目标状态，
   * 影响行数为 0 说明已被处理过，直接返回，保证库存只归还一次。
   * 归还同样采用「数量增加 + version 自增」的方式，维持乐观锁语义。
   */
  private async release(tx: Tx, order: any, status: string) {
    const changed = await tx.storeOrder.updateMany({ where: { id: order.id, paymentStatus: 'pending' }, data: { paymentStatus: status } });
    if (!changed.count) return; // 已被其他流程处理，避免重复归还库存

    for (const item of order.items) {
      const restored = await tx.storeVariant.updateMany({ where: { id: item.variantId }, data: { stock: { increment: item.quantity }, version: { increment: 1 } } });
      // 变体不存在（例如被硬删除）时中断，避免静默丢失库存归还。
      if (!restored.count) throw new ConflictException('Inventory changed while releasing. Please retry.');
    }
  }

  /**
   * 定时任务：每分钟扫描并过期处理超时未支付订单。
   * 规则：paymentStatus='pending' 且 expiresAt <= 现在 → 标记 expired 并归还库存。
   * 同时被 quote / order / checkout 等入口主动调用，保证用户读到的状态即时准确。
   */
  @Cron('0 * * * * *')
  async expire() {
    await this.db.$transaction(async tx => {
      const orders = await tx.storeOrder.findMany({ where: { paymentStatus: 'pending', expiresAt: { lte: new Date() } }, include: { items: true } });
      for (const order of orders) await this.release(tx, order, 'expired');
    });
  }

  /**
   * 用户主动取消订单。
   * 仅未支付（pending）订单可取消，取消即释放库存；接口幂等，重复取消会被拒绝。
   */
  async cancel(id: string, token?: string, userId?: string) {
    const order = await this.authorize(id, token, userId);
    if (order.paymentStatus !== 'pending') throw new BadRequestException('Only unpaid orders can be cancelled');
    await this.db.$transaction(tx => this.release(tx, order, 'cancelled'));
    return { cancelled: true };
  }

  /**
   * 提交售后申请（退货/退款诉求）。
   * 前置条件：订单已支付（paid）；否则视为无效售后请求。
   * 每笔订单最多一条售后单（orderId 唯一），重复提交按 upsert 覆盖原因并重置处理备注。
   */
  async requestReturn(id: string, reason: string, token?: string, userId?: string) {
    await this.authorize(id, token, userId);
    return this.db.$transaction(async tx => {
      const o = await tx.storeOrder.findUniqueOrThrow({ where: { id } });
      if (o.paymentStatus !== 'paid') throw new BadRequestException('Only paid orders support after-sales requests');
      return tx.storeReturn.upsert({ where: { orderId: id }, update: { reason, note: '' }, create: { orderId: id, reason, note: '' } });
    });
  }

  /** 后台商品列表：含全部变体（含已下架），按创建时间倒序。 */
  async adminProducts() {
    return (await this.db.storeProduct.findMany({ include: { variants: true }, orderBy: { createdAt: 'desc' } })).map(p => this.productView(p));
  }

  /**
   * 后台保存商品（新建或更新，同一方法处理）。
   *
   * 上架合规校验：
   *   - 真实商品（demo=false）且上架（active）时，必须具备图片、材质、尺寸、护理说明。
   *   - 图片必须为 HTTPS 且长度不超过 4000（拦截非安全外链与超长内联数据）。
   *   - 真实商品上架时，至少要有 1 个 active 且库存 > 0 的变体，避免上架空壳商品。
   *
   * 变体并发控制（关键）：更新已存在变体时必须携带 version，
   * 以 `where: { id, version }` 条件更新 + version 自增实现乐观锁；
   * 影响行数为 0 说明编辑期间库存已被他处修改（如顾客下单），报 409 并要求刷新后重试，
   * 绝不覆盖并发变更。
   *
   * 变体删除采用软删除（置 active=false），保留历史订单的关联引用。
   *
   * @param id    商品 ID；为 null 表示新建
   * @param input 商品 DTO（含变体数组）
   * @param actor 操作人（管理员用户 ID），写入审计日志
   */
  async saveProduct(id: string | null, input: ProductDto, actor: string) {
    // 上架合规校验一：真实商品必须有完整描述信息。
    if (!input.demo && input.active && (!input.images.length || !input.material.trim() || !input.dimensions.trim() || !input.care.trim())) {
      throw new BadRequestException('Real products require images, material, dimensions and care instructions');
    }
    // 上架合规校验二：图片必须为 HTTPS 直链，且长度受限。
    for (const image of input.images) {
      if (image.length > 4000 || !/^https:\/\//.test(image)) throw new BadRequestException('Images must use HTTPS');
    }
    // 上架合规校验三：需要至少一个可售变体（active 且库存 > 0）。
    const active = input.variants.some(v => v.active && v.stock > 0);
    if (input.active && !input.demo && !active) throw new BadRequestException('Published products need at least one active, in-stock variant');

    const { variants, images, ...data } = input;
    const defaults = { care: '', images: '[]' };
    return this.db.$transaction(async tx => {
      // 新建时补默认值；更新时留空字段不覆盖（care 为 undefined 表示不修改）。
      const payloadCreate = { ...data, care: data.care || defaults.care, images: JSON.stringify(images || []) };
      const payloadUpdate = { ...data, care: data.care || undefined, images: JSON.stringify(images || []) };
      const p = id ? await tx.storeProduct.update({ where: { id }, data: payloadUpdate })
        : await tx.storeProduct.create({ data: payloadCreate });

      // 取该商品当前已有变体，用于归属校验与软删除比对。
      const known = await tx.storeVariant.findMany({ where: { productId: p.id } });
      for (const v of variants) {
        if (v.id) {
          // 更新已有变体：先确认变体确属本商品，防止越权改他人变体。
          if (!known.some(k => k.id === v.id)) throw new BadRequestException('Variant belongs to a different product');
          if (v.version === undefined) throw new BadRequestException('Variant version required');
          const { version, ...values } = v;
          // 乐观锁更新：版本不匹配则影响行数为 0，中断并提示刷新。
          const result = await tx.storeVariant.updateMany({
            where: { id: v.id, version }, data: { ...values, version: { increment: 1 } },
          });
          if (!result.count) throw new ConflictException('Inventory changed while editing. Reload the product and try again.');
        } else {
          // 新建变体（无 id），直接挂到当前商品下。
          const { version, ...values } = v;
          await tx.storeVariant.create({ data: { ...values, productId: p.id } });
        }
      }

      // 未在本次提交中出现的旧变体做软删除，保证历史订单仍可关联到变体记录。
      const keep = variants.flatMap(v => v.id ? [v.id] : []);
      for (const old of known) if (!keep.includes(old.id)) await tx.storeVariant.update({ where: { id: old.id }, data: { active: false } });

      await this.audit(tx, actor, 'product.save', p.id);
      return this.productView({ ...p, variants: await tx.storeVariant.findMany({ where: { productId: p.id } }) });
    });
  }

  /** 后台订单列表：全量订单（最多 200 条），按创建时间倒序。 */
  async adminOrders() {
    await this.expire();
    return (await this.db.storeOrder.findMany({ include, orderBy: { createdAt: 'desc' }, take: 200 })).map(o => this.orderView(o));
  }

  /**
   * 后台发货。
   *
   * 发货前置条件（在条件更新中一次性表达，以影响行数判断）：
   *   - 订单已付款（paymentStatus='paid'）
   *   - 尚未发货（fulfillmentStatus='unfulfilled'）
   *   - 无进行中的售后单（不存在 requested/approved/received 状态的售后请求）
   * 三者任一不满足即拒绝发货，避免有售后争议的订单被发出。
   * 发货成功后邮件通知顾客并提供承运商与运单号。
   */
  async ship(id: string, input: ShipmentDto, actor: string) {
    return this.db.$transaction(async tx => {
      const changed = await tx.storeOrder.updateMany({
        where: { id, paymentStatus: 'paid', fulfillmentStatus: 'unfulfilled', returns: { none: { status: { in: ['requested', 'approved', 'received'] } } } },
        data: { ...input, fulfillmentStatus: 'shipped', shippedAt: new Date() },
      });
      if (!changed.count) throw new BadRequestException('Order cannot be shipped (unpaid, already shipped, or open after-sales request)');
      const o = await tx.storeOrder.findUniqueOrThrow({ where: { id } });
      await this.mail(tx, o, 'shipped', 'Your order has shipped', `${input.carrier} tracking number: ${input.trackingNumber}`);
      await this.audit(tx, actor, 'order.ship', id);
      return { shipped: true };
    });
  }

  /**
   * 后台处理售后单（状态流转）。
   *
   * 状态机（白名单驱动，非法流转直接拒绝）：
   *   requested → approved | rejected
   *   approved  → received
   *   rejected  → （终态）
   *   received  → （终态）
   * 注意：received 表示「已收到退货」，是执行退款并回补库存的前置条件。
   */
  async updateReturn(id: string, input: ReturnUpdateDto, actor: string) {
    return this.db.$transaction(async tx => {
      const request = await tx.storeReturn.findUnique({ where: { orderId: id } });
      const allowed = { requested: ['approved', 'rejected'], approved: ['received'], rejected: [], received: [] };
      if (!request || !allowed[request.status]?.includes(input.status)) throw new BadRequestException('Invalid after-sales transition');
      const result = await tx.storeReturn.update({ where: { orderId: id }, data: input });
      await this.audit(tx, actor, `return.${input.status}`, id);
      return result;
    });
  }

  /**
   * 后台退款登记。
   *
   * 流程：
   *   1. 仅 paid / payment_review 状态可退款。
   *   2. 若已发货且选择回补库存（restock），必须先确认退货已收到（售后单状态为 received）。
   *   3. live 模式下通过 Stripe 核验退款凭据（verifyRefund：必须是该支付的、
   *      金额与币种完全一致的成功全款退款），核验不过则拒绝登记。
   *   4. 条件更新订单状态，并发冲突时报 409。
   *   5. 回补库存的例外：payment_review（晚到付款复核）订单此前已释放过库存，
   *      因此仅对原本为 paid 的订单执行库存回补，避免重复加库存。
   *
   * @param input.reference Stripe 退款 ID 或线下退款凭证号
   * @param input.restock   是否把商品重新上架库存
   */
  async refund(id: string, input: RefundDto, actor: string) {
    const order = await this.db.storeOrder.findUniqueOrThrow({ where: { id }, include });
    if (!['paid', 'payment_review'].includes(order.paymentStatus)) throw new BadRequestException('Order is not refundable');
    // 已发货的订单要回补库存，必须先确认退货已收到。
    if (input.restock && order.fulfillmentStatus === 'shipped' && order.returns[0]?.status !== 'received') throw new BadRequestException('Confirm returned goods before restocking');
    await this.payments.verifyRefund(order, input.reference);
    return this.db.$transaction(async tx => {
      // 条件更新带原状态，确保退款期间订单未被其他操作改变。
      const changed = await tx.storeOrder.updateMany({
        where: { id, paymentStatus: order.paymentStatus, fulfillmentStatus: order.fulfillmentStatus }, data: { paymentStatus: 'refunded', refundReference: input.reference },
      });
      if (!changed.count) throw new ConflictException('Order changed');
      // Late-payment review orders already had their reservation released.
      // 晚到付款复核单的库存此前已释放，这里只对原本 paid 的订单回补库存，避免重复加库存。
      if (input.restock && order.paymentStatus === 'paid') {
        for (const item of order.items) await tx.storeVariant.update({ where: { id: item.variantId }, data: { stock: { increment: item.quantity }, version: { increment: 1 } } });
      }
      await this.mail(tx, order, 'refunded', 'Refund confirmed', `A full refund for ${order.number} has been recorded.`);
      await this.audit(tx, actor, 'order.refund', id);
      return { refunded: true };
    });
  }

  /** 优惠码列表（后台，按码值升序）。 */
  coupons() { return this.db.storeCoupon.findMany({ orderBy: { code: 'asc' } }); }

  /**
   * 后台保存优惠码（upsert：存在则覆盖，不存在则新建）。
   * expiresAt 由 ISO 字符串转换为 Date；留空表示永不过期。
   * 写库同时记录操作审计。
   */
  async saveCoupon(input: CouponDto, actor: string) {
    const data = { ...input, expiresAt: input.expiresAt ? new Date(input.expiresAt) : null };
    return this.db.$transaction(async tx => {
      const c = await tx.storeCoupon.upsert({ where: { code: input.code }, create: data, update: data });
      await this.audit(tx, actor, 'coupon.save', c.code);
      return c;
    });
  }

  /**
   * 写后台操作审计日志（与业务写操作同事务，保证「操作与日志」原子落库）。
   * @param actor  管理员用户 ID
   * @param action 动作标识，如 product.save / order.ship / order.refund / return.approved
   * @param id     操作对象主键（商品 ID、订单 ID 或优惠码）
   */
  private audit(tx: Tx, actor: string, action: string, id: string) {
    return tx.adminAuditLog.create({ data: { adminUserId: actor, action, targetType: 'commerce', targetId: id } });
  }

  /**
   * 后台健康检查：一次性暴露运营需要关注的积压与异常指标。
   *   - pendingEmails：未投递邮件数（outbox 积压）
   *   - failedEmails：重试已达 8 次的邮件（疑似投递失败）
   *   - paymentReview：待人工复核的晚到付款订单数
   *   - demoProducts：演示商品数量（live 上线前应重点关注）
   * 同时回带公开配置（站点名、运费、各类公告文案等）。
   */
  async health() {
    return {
      ...(this.settings.publicSettings()),
      pendingEmails: await this.db.storeMail.count({ where: { status: { not: 'sent' } } }),
      failedEmails: await this.db.storeMail.count({ where: { status: { not: 'sent' }, attempts: { gte: 8 } } }),
      paymentReview: await this.db.storeOrder.count({ where: { paymentStatus: 'payment_review' } }),
      demoProducts: await this.db.storeProduct.count({ where: { demo: true } }),
    };
  }
}
