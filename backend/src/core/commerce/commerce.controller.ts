/**
 * ============================================================================
 * 商城 HTTP 接口层
 * ----------------------------------------------------------------------------
 * 本文件定义两组控制器，构成前台与后台的边界：
 *
 *   1. CommerceController（/store/**）——面向顾客，大多数接口标注 @Public()，
 *      即无需登录即可访问。游客凭「订单私密令牌」（x-order-token 头）访问自己的订单，
 *      登录用户则可改走 JWT 身份通道。两条通道在 CommerceService.authorize 中合并校验。
 *
 *   2. CommerceAdminController（/store/admin/**）——面向后台运营，
 *      由 StoreAdminGuard 统一拦截，要求调用者是 status='active' 的管理员。
 *
 * 鉴权要点：
 *   - 全局 JwtAuthGuard（在 IdentityModule 注册）默认拦截所有接口，
 *     被 @Public() 标记的路由才会放行；本控制器里少数需要「可选登录」的接口
 *     自行解析 Authorization 头（见 identity 私有方法），从而同时支持登录与游客。
 *   - x-order-token 是订单级凭据，与用户级 JWT 相互独立。
 *
 * 本层只做参数绑定与转发，业务规则全部下沉到 CommerceService。
 * ============================================================================
 */

import { Body, CanActivate, Controller, ExecutionContext, ForbiddenException, Get, Headers, Injectable, Param, Post, Put, RawBodyRequest, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Public } from '@/common/decorators/public.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { PrismaService } from '@/infrastructure/database/prisma.service';
import { CommerceService } from './commerce.service';
import { CommerceConfig } from './commerce.config';
import { CheckoutDto, CouponDto, ProductDto, QuoteDto, RecoveryDto, RefundDto, ReturnDto, ReturnUpdateDto, ShipmentDto } from './commerce.dto';

/**
 * 后台管理员守卫。
 * 在全局 JWT 守卫之后执行：此时 req.user 已由 JwtAuthGuard 解析出 payload。
 * 二次查库确认用户仍存在、未禁用、且具备管理员身份——
 * 避免「令牌签发后被降权或停用」的账号继续操作后台。
 */
@Injectable()
export class StoreAdminGuard implements CanActivate {
  constructor(private readonly db: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    // req.user.sub 由 JwtAuthGuard 写入；无令牌时 user 为空，直接判定非管理员。
    const user = req.user?.sub ? await this.db.user.findUnique({ where: { id: req.user.sub } }) : null;
    if (!user?.isAdmin || user.status !== 'active') throw new ForbiddenException('Administrator access required');
    return true;
  }
}

/**
 * 前台商城控制器。
 * 接口分为三类：公开只读（设置/商品）、公开写入（报价/结账/找单）、
 * 订单私有操作（查单/支付/取消/售后，需 JWT 或订单令牌）。
 */
@Controller('store')
export class CommerceController {
  constructor(private readonly store: CommerceService, private readonly jwt: JwtService, private readonly cfg: CommerceConfig, private readonly db: PrismaService) {}

  /**
   * 可选身份解析：把 Authorization 头解析成用户 ID。
   *
   * 设计要点：
   *   - 未传令牌返回 undefined（合法，表示游客身份），不抛错。
   *   - 传了令牌但不合法（格式错误、验签失败、用户不存在或已禁用）时抛 401，
   *     而不是静默降级为游客——否则用户会「以为自己登录着」却拿不到自己的订单。
   *   - 使用与 JwtAuthGuard 相同的密钥（CommerceConfig.secret）验签，保证一致。
   */
  private async identity(auth?: string) {
    if (!auth) return undefined;
    try {
      if (!auth.startsWith('Bearer ')) throw new Error();
      const payload = this.jwt.verify(auth.slice(7), { secret: this.cfg.secret });
      const user = await this.db.user.findUnique({ where: { id: payload.sub } });
      if (!user || user.status !== 'active') throw new Error();
      return user.id;
    } catch { throw new UnauthorizedException('Session expired. Please sign in again.'); }
  }

  /** 公开站点设置：站名、运费、免邮门槛、各类公告文案、是否演示模式等。 */
  @Public() @Get('settings') settings() { return this.cfg.publicSettings(); }

  /** 公开商品目录（不含下架商品；live 模式下不含演示商品）。 */
  @Public() @Get('products') products() { return this.store.catalog(); }

  /** 公开商品详情，按 slug 查询。 */
  @Public() @Get('products/:slug') product(@Param('slug') slug: string) { return this.store.product(slug); }

  /** 购物车试算报价（公开，不写库、不占库存）。 */
  @Public() @Post('quote') quote(@Body() dto: QuoteDto) { return this.store.quote(dto); }

  /** 结账下单：支持游客（无 Authorization）与登录用户（带 Authorization）两种身份。 */
  @Public() @Post('checkout') async checkout(@Body() dto: CheckoutDto, @Headers('authorization') auth?: string) {
    return this.store.checkout(dto, await this.identity(auth));
  }

  /** 我的订单列表：需登录，用户 ID 取自 JWT。 */
  @Get('my-orders') myOrders(@CurrentUser() user: any) { return this.store.myOrders(user.sub); }

  /** 游客找单：凭「订单号 + 邮箱」触发私密链接邮件（无论是否存在均返回相同响应）。 */
  @Public() @Post('recover') recover(@Body() dto: RecoveryDto) { return this.store.recovery(dto.number, dto.email); }

  /** 查询单个订单：需 JWT 身份或 x-order-token 订单令牌之一。 */
  @Public() @Get('orders/:id') async order(@Param('id') id: string, @Headers('x-order-token') token?: string, @Headers('authorization') auth?: string) {
    return this.store.order(id, token, await this.identity(auth));
  }

  /** 发起支付：返回 Stripe 跳转地址，或演示模式下返回 { demo: true }。 */
  @Public() @Post('orders/:id/payment') async payment(@Param('id') id: string, @Headers('x-order-token') token?: string, @Headers('authorization') auth?: string) {
    return this.store.payment(id, token, await this.identity(auth));
  }

  /** 模拟付款：仅开发/预览环境可用，生产环境返回 404。 */
  @Public() @Post('orders/:id/mock-pay') async mockPay(@Param('id') id: string, @Headers('x-order-token') token?: string, @Headers('authorization') auth?: string) {
    return this.store.mockPay(id, token, await this.identity(auth));
  }

  /** 取消未支付订单，取消后库存立即释放。 */
  @Public() @Post('orders/:id/cancel') async cancel(@Param('id') id: string, @Headers('x-order-token') token?: string, @Headers('authorization') auth?: string) {
    return this.store.cancel(id, token, await this.identity(auth));
  }

  /** 提交售后申请（仅已支付订单可提交）。 */
  @Public() @Post('orders/:id/returns') async requestReturn(@Param('id') id: string, @Body() dto: ReturnDto, @Headers('x-order-token') token?: string, @Headers('authorization') auth?: string) {
    return this.store.requestReturn(id, dto.reason, token, await this.identity(auth));
  }

  /**
   * Stripe Webhook 回调入口。
   * 必须使用原始请求体（rawBody）做签名校验，因此不能用常规 Body 解析结果；
   * 签名来自 stripe-signature 头，缺失或校验失败一律 400。
   */
  @Public() @Post('webhook/stripe') webhook(@Req() req: RawBodyRequest<import('express').Request>, @Headers('stripe-signature') signature?: string) {
    return this.store.webhook(req.rawBody || Buffer.alloc(0), signature);
  }
}

/**
 * 后台商城管理控制器。
 * 整个控制器挂 StoreAdminGuard，所有接口需管理员身份；
 * 凡涉及写操作（商品/发货/售后/退款/优惠码）都要求管理员必须在库中存在且状态正常，
 * 并且服务层会把操作人 ID 写入审计日志。
 */
@Controller('store/admin')
@UseGuards(StoreAdminGuard)
export class CommerceAdminController {
  constructor(private readonly store: CommerceService) {}

  /** 商品列表（含下架变体，供后台编辑）。 */
  @Get('products') products() { return this.store.adminProducts(); }

  /** 新建商品（含上架合规校验与变体并发控制）。 */
  @Post('products') create(@Body() dto: ProductDto, @CurrentUser() u: any) { return this.store.saveProduct(null, dto, u.sub); }

  /** 更新商品（变体需带 version 做乐观锁校验）。 */
  @Put('products/:id') update(@Param('id') id: string, @Body() dto: ProductDto, @CurrentUser() u: any) { return this.store.saveProduct(id, dto, u.sub); }

  /** 订单列表（最多 200 条）。 */
  @Get('orders') orders() { return this.store.adminOrders(); }

  /** 发货：填写承运商与运单号，成功后自动邮件通知顾客。 */
  @Post('orders/:id/ship') ship(@Param('id') id: string, @Body() dto: ShipmentDto, @CurrentUser() u: any) { return this.store.ship(id, dto, u.sub); }

  /** 处理售后单状态流转（approved / rejected / received）。 */
  @Put('orders/:id/return') returns(@Param('id') id: string, @Body() dto: ReturnUpdateDto, @CurrentUser() u: any) { return this.store.updateReturn(id, dto, u.sub); }

  /** 登记退款（可选是否回补库存）。 */
  @Post('orders/:id/refund') refund(@Param('id') id: string, @Body() dto: RefundDto, @CurrentUser() u: any) { return this.store.refund(id, dto, u.sub); }

  /** 优惠码列表。 */
  @Get('coupons') coupons() { return this.store.coupons(); }

  /** 新建或更新优惠码。 */
  @Post('coupons') coupon(@Body() dto: CouponDto, @CurrentUser() u: any) { return this.store.saveCoupon(dto, u.sub); }

  /** 运营健康指标：邮件积压、待复核付款、演示商品数等。 */
  @Get('health') health() { return this.store.health(); }
}
