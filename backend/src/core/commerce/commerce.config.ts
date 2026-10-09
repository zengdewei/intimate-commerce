/**
 * ============================================================================
 * 商城配置中心（CommerceConfig）
 * ----------------------------------------------------------------------------
 * 统一收敛商城运行所需的环境开关与公开文案，避免业务代码到处直接读 process.env。
 *
 * 两级安全开关（务必区分）：
 *   - production：是否为生产环境。由 APP_ENV 或 NODE_ENV 判定。
 *     开启后会执行安全基线校验（JWT 密钥强度、CORS 白名单、HTTPS 前台地址），
 *     并在服务启动时阻断使用默认演示口令的账号。
 *   - live：是否真正放开真实收款。必须在 production 为真时才能开启
 *     （即本地开发无法误开真实支付）。开启时额外要求合规确认项与支付/邮件密钥齐全。
 *
 * 公开设置（publicSettings）会直接下发给前台，因此其中全部字段
 * 都必须是可以公开的信息，不得包含密钥或内部标识。
 * ============================================================================
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CommerceConfig {
  constructor(private readonly cfg: ConfigService) {}

  /** 是否生产环境（APP_ENV 或 NODE_ENV 任一为 production 即视为生产）。 */
  get production() { return this.cfg.get('APP_ENV') === 'production' || process.env.NODE_ENV === 'production'; }

  /** 是否开启真实收款：必须同时满足「生产环境」且「显式开启 COMMERCE_LIVE_ENABLED」。 */
  get live() { return this.production && this.cfg.get('COMMERCE_LIVE_ENABLED') === 'true'; }

  /** 前台站点地址，用于拼接订单私密链接与支付回跳地址。 */
  get frontend() { return this.cfg.get<string>('FRONTEND_URL') || 'http://localhost:5173'; }

  /** 令牌签名密钥（与 JWT 访问密钥同源），用于生成/校验订单访问令牌。 */
  get secret() { return this.cfg.get<string>('jwt.accessSecret')!; }

  /**
   * 读取整数型配置项，非法值（非安全整数、负数）直接抛错。
   * 用在运费等金额配置上，避免拼写错误或单位误填导致静默失效。
   */
  integer(key: string, fallback: number) {
    const n = Number(this.cfg.get(key) ?? fallback);
    if (!Number.isSafeInteger(n) || n < 0) throw new Error(`Invalid ${key}`);
    return n;
  }

  /**
   * 下发到前台的公开配置。
   * 注意：demo 与 checkoutEnabled 都跟随 live 开关推导，保证前台展示的
   * 「演示/可购买」状态与后端实际放行状态一致，不会出现前台可下单而后端拒绝。
   * taxStatus 固定为 not_calculated：本系统不计算销售税，「未计算」不等于「免税」。
   */
  publicSettings() {
    return {
      name: this.cfg.get('STORE_NAME') || 'The Intimate Edit',
      supportEmail: this.cfg.get('STORE_SUPPORT_EMAIL') || '',
      demo: !this.live,                                   // 未开启真实收款即处于演示模式
      checkoutEnabled: !this.production || this.live,     // 生产未放行时前台隐藏结账入口
      shipping: this.integer('STORE_SHIPPING_CENTS', 695),        // 固定运费（美分），默认 $6.95
      freeShippingAt: this.integer('STORE_FREE_SHIPPING_CENTS', 7500), // 折后满多少免邮，默认 $75
      taxStatus: 'not_calculated',
      shippingNotice: this.cfg.get('STORE_SHIPPING_NOTICE') || 'US contiguous states only. Delivery estimates will be confirmed before launch.',
      returnsNotice: this.cfg.get('STORE_RETURNS_NOTICE') || 'Return conditions are being finalized. No live orders are accepted in preview.',
      privacyNotice: this.cfg.get('STORE_PRIVACY_NOTICE') || 'We use contact and address details to process orders. No advertising trackers are installed in this preview.',
      termsNotice: this.cfg.get('STORE_TERMS_NOTICE') || 'Preview only. Demonstration products are not available for real purchase.',
      discreetPackaging: this.cfg.get('STORE_DISCREET_PACKAGING') === 'true', // 是否启用隐私包装
    };
  }

  /**
   * 启动期配置校验（由 CommerceService.onModuleInit 调用）。
   *
   * 非生产环境仅做「配置可解析」的轻量检查后直接返回。
   * 生产环境强制以下安全基线，任一不满足即阻止启动：
   *   1. JWT 密钥长度 ≥ 32 且不能是占位串（dev-secret / change-me / xxxxxxxx）。
   *   2. CORS 白名单不得出现通配符 '*'，必须是显式域名列表。
   *   3. 前台地址必须是 HTTPS。
   * 若进一步开启了 live（真实收款），还需额外的合规确认与密钥完整性：
   *   4. 支付品类审批、商品合规、法律审查、税务审查四项人工确认必须为 true。
   *   5. Stripe 密钥、Webhook 密钥、客服邮箱、发件人、Resend 密钥、
   *      以及运费/退货/隐私/条款四类公告文案必须齐备。
   */
  validate() {
    this.publicSettings();
    if (!this.production) return;

    const secret = this.cfg.get<string>('JWT_ACCESS_SECRET') || '';
    if (secret.length < 32 || /dev-secret|change-me|xxxxxxxx/i.test(secret)) throw new Error('Set a unique JWT_ACCESS_SECRET (32+ characters)');
    if ((this.cfg.get<string>('CORS_ORIGINS') || '').includes('*')) throw new Error('Production CORS_ORIGINS must be an explicit allowlist');
    if (!this.frontend.startsWith('https://')) throw new Error('Production FRONTEND_URL must use HTTPS');

    if (this.live) {
      // 人工合规确认项：必须由经营者逐项确认后才能放开真实收款。
      const required = [
        'PAYMENT_CATEGORY_APPROVED', 'PRODUCT_COMPLIANCE_CONFIRMED', 'LEGAL_REVIEW_CONFIRMED',
        'TAX_REVIEW_CONFIRMED',
      ];
      for (const key of required) if (this.cfg.get(key) !== 'true') throw new Error(`Launch blocked: ${key}`);
      // 基础设施与文案完整性：任一缺失都会导致真实交易链路不可用。
      for (const key of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STORE_SUPPORT_EMAIL', 'MAIL_FROM',
        'RESEND_API_KEY', 'STORE_SHIPPING_NOTICE', 'STORE_RETURNS_NOTICE', 'STORE_PRIVACY_NOTICE', 'STORE_TERMS_NOTICE']) {
        if (!this.cfg.get(key)) throw new Error(`Launch blocked: ${key}`);
      }
    }
  }
}
