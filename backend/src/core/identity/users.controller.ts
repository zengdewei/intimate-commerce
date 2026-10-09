/**
 * ============================================================================
 * 认证与用户接口层（UsersController，路由前缀 /auth）
 * ----------------------------------------------------------------------------
 * 对外提供注册、登录、找回密码、个人资料与改密接口。
 *
 * 鉴权模型：
 *   - 全局 JwtAuthGuard（在 IdentityModule 注册为 APP_GUARD）默认拦截所有路由；
 *     标注 @Public() 的路由才会被放行，因此「注册/登录/找回密码」四个接口
 *     无需令牌，其余接口（me / password）必须携带有效 JWT。
 *
 * 响应结构约定：
 *   - 管理类接口统一返回 { ok: true, data: {...} }；
 *   - AuthService 直接产出的结果（登录、找回密码等）按服务层结构返回。
 *
 * 安全约定：
 *   - 任何响应都不得包含 passwordHash 等敏感字段（本控制器显式挑选字段返回）。
 *   - 注册成功后自动登录（MVP 简化体验），直接下发令牌。
 * ============================================================================
 */

import { Controller, Post, Body, HttpCode, Get, Patch, BadRequestException, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { AuthService } from './auth.service';
import { Public } from '@/common/decorators/public.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { RegisterDto, LoginDto, RequestResetDto, ResetPasswordDto, UpdateProfileDto, UpdatePasswordDto } from './dto';

@ApiTags('Auth & Users')
@Controller('auth')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly auth: AuthService,
  ) {}

  /**
   * 注册新用户（公开）。
   * 注册成功后立即调用登录逻辑下发令牌，用户无需再手动登录一次。
   * 返回的 user 字段由控制器逐个挑选，不含密码摘要。
   */
  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @HttpCode(201)
  async register(@Body() dto: RegisterDto, @Req() req: any) {
    const created = await this.users.register({ email: dto.email, password: dto.password, fullName: dto.fullName, locale: dto.locale });
    // MVP：注册后自动登录
    const r = await this.auth.login({ email: dto.email, password: dto.password, ip: req.ip });
    return {
      ok: true,
      data: {
        token: r.accessToken,
        user: {
          id: created.id,
          email: created.email,
          fullName: created.fullName,
          timezone: created.timezone,
          isAdmin: created.isAdmin,
          locale: created.locale,
          status: created.status,
          createdAt: created.createdAt,
        },
      },
    };
  }

  /**
   * 登录（公开）。
   * 传入 req.ip 供 AuthService 按「IP + 邮箱」维度统计失败次数以实施防暴破锁定。
   * 登录成功后重新查库返回完整资料；若查询异常缺失则回退使用登录结果中的基础信息。
   */
  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Login with email + password' })
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: any) {
    const r = await this.auth.login({ email: dto.email, password: dto.password, ip: req.ip });
    const u = await this.users.findById(r.user.id);
    return {
      ok: true,
      data: {
        token: r.accessToken,
        user: u ? {
          id: u.id,
          email: u.email,
          fullName: u.fullName,
          timezone: u.timezone,
          isAdmin: u.isAdmin,
          locale: u.locale,
          status: u.status,
          createdAt: u.createdAt,
        } : r.user,
      },
    };
  }

  /**
   * 请求发送密码重置验证码（公开）。
   * 无论邮箱是否存在都返回相同的成功响应，避免账号枚举。
   */
  @Public()
  @Post('request-reset')
  @ApiOperation({ summary: 'Request password reset email (silent success)' })
  @HttpCode(200)
  async requestReset(@Body() dto: RequestResetDto) {
    return this.auth.requestResetPassword(dto.email);
  }

  /**
   * 使用邮箱验证码重置密码（公开）。
   * 校验码有效性、尝试次数限流与消费幂等均由 AuthService 负责。
   */
  @Public()
  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password with verification code' })
  @HttpCode(200)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.email, dto.code, dto.newPassword);
  }

  /** 获取当前登录用户资料（需 JWT）；用户不存在时返回 { ok: false }。 */
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  async me(@CurrentUser() u: any) {
    const user = await this.users.findById(u.sub);
    if (!user) return { ok: false };
    return {
      ok: true,
      data: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        timezone: user.timezone,
        isAdmin: user.isAdmin,
        locale: user.locale,
        status: user.status,
        createdAt: user.createdAt,
      }
    };
  }

  /** 更新个人资料（昵称 / 时区），需 JWT。 */
  @Patch('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update profile (fullName, timezone)' })
  @HttpCode(200)
  async updateMe(@CurrentUser() u: any, @Body() dto: UpdateProfileDto) {
    const updated = await this.users.updateProfile(u.sub, { fullName: dto.fullName, timezone: dto.timezone });
    return {
      ok: true,
      data: {
        id: updated.id,
        fullName: updated.fullName,
        timezone: updated.timezone,
      }
    };
  }

  /**
   * 修改密码（需 JWT）。
   * 必须先校验当前密码正确才允许更新，防止令牌被盗后被直接改密夺号。
   * 密码强度由 DTO（≥8 位）把关。
   */
  @Patch('password')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change password (currentPassword + newPassword)' })
  @HttpCode(200)
  async updatePassword(@CurrentUser() u: any, @Body() dto: UpdatePasswordDto) {
    const ok = await this.users.verifyPassword(u.sub, dto.currentPassword);
    if (!ok) throw new BadRequestException('Current password is incorrect');
    await this.users.updatePassword(u.sub, dto.newPassword);
    return { ok: true };
  }
}
