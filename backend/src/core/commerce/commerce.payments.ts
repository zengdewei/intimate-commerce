/**
 * ============================================================================
 * 支付通道适配器（CommercePayments）
 * ----------------------------------------------------------------------------
 * 把 Stripe 的接入细节收拢在一个适配器里，对上层（CommerceService）只暴露
 * 三个能力：创建支付会话、解析并验签 Webhook、核验退款凭据。
 *
 * 安全设计：
 *   1. 未开启 live（真实收款）时，所有真实支付动作直接抛 503，
 *      保证「预览版不可能收到真钱」。
 *   2. 构造函数只在配置了 STRIPE_SECRET_KEY 时才初始化 Stripe 客户端，
 *      未配置时 stripe 为 undefined，运行期不会意外回退到真实通道。
 *   3. Webhook 强制验签，且签名密钥缺失、未开启 live、无签名一律 400。
 *   4. 退款核验要求「同一支付意图 + 金额完全一致 + 币种 usd + 状态 succeeded」，
 *      即只承认全额退款，杜绝部分退款被登记为全额退款。
 *
 * 计价口径：订单表的 subtotal / discount / shipping / total 均为整数美分。
 * Stripe 侧按「单条折后 line item + 独立运费」构造，保证任何情况下都不会
 * 出现负数价格（若把折扣做成负价 line item，Stripe 会直接拒绝）。
 * ============================================================================
 */

import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { StoreOrder } from '@prisma/client';
import { CommerceConfig } from './commerce.config';

/**
 * 支付适配器契约。
 * 便于将来替换支付服务商（如 PayPal），上层只依赖此接口。
 */
export interface StorePaymentAdapter {
  /** 为订单创建支付会话，返回会话 ID 与用户可跳转的支付地址。 */
  create(order: StoreOrder): Promise<{ id: string; url: string }>;
}

@Injectable()
export class CommercePayments implements StorePaymentAdapter {
  /** Stripe 客户端；未配置密钥时为 undefined（表示真实通道不可用）。 */
  private stripe?: Stripe;

  constructor(private readonly cfg: ConfigService, private readonly settings: CommerceConfig) {
    const key = cfg.get<string>('STRIPE_SECRET_KEY');
    // 锁定 API 版本，避免 Stripe 升级导致行为漂移。
    if (key) this.stripe = new Stripe(key, { apiVersion: '2023-10-16' });
  }

  /**
   * 创建 Stripe Checkout 会话。
   *
   * 构造要点：
   *   - 未开启 live 或未配置客户端 → 503，杜绝预览环境产生真实交易。
   *   - 运费作为独立的 shipping_option 传入（而非混入商品行），
   *     并标注 tax_behavior: 'exclusive'（运费不含税，税费由 Stripe 侧另行处理）。
   *   - 商品行只有一条，unit_amount = 小计 − 折扣；因为折扣已在服务端算完，
   *     这里不再使用 Stripe 的 discounts / promotion codes，
   *     从根本上避免出现负数价格行。
   *   - metadata 写入订单 ID 与订单号，Webhook 回调时据此找回订单。
   *   - expires_at 与订单支付窗口对齐，超时后会话自动失效。
   *   - 传入 idempotencyKey，确保网络重试不会创建出两个会话。
   */
  async create(order: StoreOrder) {
    if (!this.settings.live || !this.stripe) throw new ServiceUnavailableException('Live payment is not enabled');

    // 运费选项：金额为 0 时展示为「免费配送」文案。
    const shippingOptions: Stripe.Checkout.SessionCreateParams.ShippingOption[] = [{
      shipping_rate_data: {
        type: 'fixed_amount',
        fixed_amount: { amount: order.shipping, currency: 'usd' },
        display_name: order.shipping ? 'Standard shipping' : 'Complimentary shipping',
        tax_behavior: 'exclusive',
      },
    }];

    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: order.email,
      client_reference_id: order.id,
      // 供 Webhook 找回订单（settle 依赖 metadata.storeOrderId）。
      metadata: { storeOrderId: order.id, storeOrderNumber: order.number },
      locale: 'en',
      line_items: [{
        price_data: {
          currency: 'usd',
          // 唯一商品行承载「折后商品小计」，运费单独走 shipping_options，
          // 因此这里恒为非负数。
          unit_amount: order.subtotal - order.discount,
          product_data: {
            name: order.coupon ? `Order ${order.number} (after discount)` : `Order ${order.number}`,
            description: 'Physical intimate essentials order. Materials, dimensions and care details are available in your account.',
          },
        },
        quantity: 1,
      }],
      shipping_options: order.shipping >= 0 ? shippingOptions : undefined,
      // 折扣已在服务端计算完毕，关闭 Stripe 侧的优惠码入口，避免二次打折。
      discounts: undefined,
      allow_promotion_codes: false,
      // 支付完成/取消后回到订单页，由该页根据订单实际状态展示结果。
      success_url: `${this.settings.frontend}/orders/${order.id}?payment=returned`,
      cancel_url: `${this.settings.frontend}/orders/${order.id}`,
      expires_at: Math.floor(order.expiresAt.getTime() / 1000),
    }, { idempotencyKey: `store-${order.id}` });

    return { id: session.id, url: session.url! };
  }

  /**
   * 解析并验签 Stripe Webhook 事件。
   *
   * 验签是防止伪造支付回调的唯一手段，因此以下任一条件不满足都直接拒绝：
   *   - 未开启 live（预览环境不接收真实回调）
   *   - Stripe 客户端未初始化
   *   - STRIPE_WEBHOOK_SECRET 未配置
   *   - 请求未携带 stripe-signature 头
   * 验签使用原始请求体（由控制器传入 rawBody），不能用重新序列化的 JSON。
   */
  parse(payload: Buffer, signature?: string) {
    const secret = this.cfg.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!this.settings.live || !this.stripe || !secret || !signature) throw new BadRequestException('Signed live webhook required');
    try { return this.stripe.webhooks.constructEvent(payload, signature, secret); }
    catch { throw new BadRequestException('Invalid webhook signature'); }
  }

  /**
   * 核验退款凭据（live 模式生效）。
   *
   * 只有完全满足以下条件才放行登记退款：
   *   - 退款状态为 succeeded
   *   - 归属同一支付意图（refund.payment_intent === order.paymentIntent），
   *     防止拿另一笔订单的退款单号来冲抵本单
   *   - 退款金额与订单总额完全一致（仅接受全额退款）
   *   - 币种为 usd
   * 未开启 live（手动/线下退款登记）时直接返回，由人工负责核对。
   */
  async verifyRefund(order: StoreOrder, reference: string) {
    if (!this.settings.live || !this.stripe) return;
    const refund = await this.stripe.refunds.retrieve(reference);
    if (refund.status !== 'succeeded' || refund.payment_intent !== order.paymentIntent ||
        refund.amount !== order.total || refund.currency !== 'usd') {
      throw new BadRequestException('Reference must identify a successful full refund of this payment');
    }
  }
}
