/**
 * ============================================================================
 * 全局 JWT 守卫（JwtAuthGuard）
 * ----------------------------------------------------------------------------
 * 在 IdentityModule 中以 APP_GUARD 注册，对本应用所有路由生效，
 * 构成「默认拒绝、显式放行」的鉴权基线：
 *
 *   - 未标注 @Public() 的路由一律要求携带 `Authorization: Bearer <token>`；
 *   - 标注 @Public() 的路由直接放行（如注册、登录、商品浏览、商品结账等）。
 *
 * 校验链路（三步全过才放行）：
 *   1. 解析 Bearer 令牌并用 jwt.accessSecret 验签 + 校验有效期；
 *   2. 回查数据库确认用户仍存在且 status='active'——
 *      这一步很关键：令牌签发后若账号被停用或删除，旧令牌立即失效，
 *      而不是等到令牌自然过期；
 *   3. 将 payload 挂到 req.user，供 @CurrentUser() 装饰器与业务守卫读取。
 *
 * 失败一律抛 401，且不区分「令牌格式错误 / 验签失败 / 已过期 / 账号停用」，
 * 避免向攻击者泄露具体的失败原因。
 * ============================================================================
 */

import { ExecutionContext, Injectable, CanActivate, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { IS_PUBLIC_KEY } from '@/common/decorators/public.decorator';
import { PrismaService } from '@/infrastructure/database/prisma.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    /** Reflector：读取 @Public() 设置的元数据，判断当前路由是否豁免鉴权。 */
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly cfg: ConfigService,
    private readonly db: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    // 同时检查方法级与类级元数据：类上标 @Public() 可使整个控制器豁免。
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const auth = req.headers.authorization || '';
    if (!auth || !auth.startsWith('Bearer ')) throw new UnauthorizedException('Missing token');

    // 去掉 "Bearer " 前缀（7 个字符）后得到裸令牌。
    const token = auth.substring(7);
    try {
      const payload = this.jwt.verify(token, { secret: this.cfg.get('jwt.accessSecret') });
      // 二次查库：确保账号仍然存在且处于启用状态（令牌未因停用/删除而失效）。
      const user = await this.db.user.findUnique({ where: { id: payload.sub } });
      if (!user || user.status !== 'active') throw new UnauthorizedException();
      // 挂载鉴权结果，供 @CurrentUser() 与后续守卫（如 StoreAdminGuard）使用。
      req.user = payload;
      return true;
    } catch (e) {
      // 统一为「令牌无效或已过期」，不暴露具体失败原因（防信息泄露）。
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
