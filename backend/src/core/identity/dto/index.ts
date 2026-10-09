/**
 * ============================================================================
 * 认证相关 DTO（入参校验）
 * ----------------------------------------------------------------------------
 * 所有认证接口的请求体都经此校验，非法入参在进入 Service 前即被拦截。
 *
 * 通用约定：
 *   - 密码长度下限统一为 8 位（本文件多处 @MinLength(8)），
 *     Service 层还会再次校验，形成双重防线。
 *   - 密码上限 72 位，源于 bcrypt 只取前 72 字节，超长部分会被静默忽略，
 *     因此显式限制以免用户误以为超长密码更安全。
 *   - 同时使用 @ApiProperty 输出 Swagger 文档，便于调试与联调。
 * ============================================================================
 */

import { IsEmail, IsString, MinLength, IsOptional, IsIn, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** 注册入参：邮箱 + 密码，可选昵称与界面语言。 */
export class RegisterDto {
  @ApiProperty({ example: 'you@example.com' })
  @IsEmail() email: string;

  @ApiProperty({ example: 'MyPassword123' })
  @IsString() @MinLength(8) @MaxLength(72) password: string;

  @ApiProperty({ example: 'John Doe', required: false })
  @IsOptional() @IsString() @MaxLength(100) fullName?: string;

  @ApiProperty({ example: 'en', required: false })
  @IsOptional() @IsIn(['en', 'zh']) locale?: string;
}

/**
 * 登录入参。
 * 注意 password 这里只要求非空（@MinLength(1)）而不要求 8 位——
 * 避免因历史账号或密码规则变更，把「密码格式不对」错误地暴露成校验失败，
 * 登录失败统一由 AuthService 返回「凭据无效」。
 */
export class LoginDto {
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(72) password: string;
}

/** 请求发送重置验证码的入参：仅需邮箱。 */
export class RequestResetDto {
  @ApiProperty() @IsEmail() email: string;
}

/** 重置密码入参：邮箱 + 邮件中的 6 位验证码 + 新密码。 */
export class ResetPasswordDto {
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty({ description: '6-digit code from email' })
  @IsString() code: string;
  @ApiProperty() @IsString() @MinLength(8) @MaxLength(72) newPassword: string;
}

/** 更新个人资料入参：昵称与时区均可选，缺省表示不修改该项。 */
export class UpdateProfileDto {
  @ApiProperty({ example: 'John Doe', required: false })
  @IsOptional() @IsString() @MaxLength(100) fullName?: string;

  @ApiProperty({ example: 'UTC', required: false })
  @IsOptional() @IsString() @MaxLength(50) timezone?: string;
}

/**
 * 修改密码入参。
 * currentPassword 不做长度下限校验——旧密码可能是历史规则下的短密码，
 * 正确性由 Service 的 bcrypt 比对判定；新密码则要求 ≥8 位。
 */
export class UpdatePasswordDto {
  @ApiProperty({ example: 'OldPassword123' })
  @IsString() @MinLength(1) currentPassword: string;

  @ApiProperty({ example: 'NewPassword456' })
  @IsString() @MinLength(8) @MaxLength(72) newPassword: string;
}
