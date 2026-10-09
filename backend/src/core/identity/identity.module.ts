/**
 * ============================================================================
 * 身份模块装配（IdentityModule）
 * ----------------------------------------------------------------------------
 * 负责认证体系的依赖装配，是全局鉴权链路的起点：
 *
 *   controllers：UsersController（/auth 下的注册、登录、找回密码、资料、改密）
 *   providers：  UsersService    用户数据存取
 *                AuthService     登录/验证码/重置密码等认证逻辑
 *                APP_GUARD → JwtAuthGuard  全局 JWT 守卫（对所有路由生效）
 *   exports：    UsersService、AuthService（供 commerce 等模块复用）
 *
 * JwtModule 采用 registerAsync 异步装配：从 ConfigService 读取密钥与有效期，
 * 这样密钥来源统一收敛在配置层（支持 .env / 环境变量），代码里不出现硬编码。
 *
 * 关于 APP_GUARD：以该令牌注册的守卫是「全局守卫」，会应用到整个应用，
 * 结合 @Public() 装饰器实现「默认需要登录、公开接口显式声明」的安全默认值——
 * 新加接口时若忘记标注，默认是被保护的，这是刻意的设计取向。
 * ============================================================================
 */

import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { AuthService } from './auth.service';
import { UsersService } from './users.service';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      // 签名与验签共用同一密钥与有效期配置，保证与 JwtAuthGuard、
      // CommerceConfig.secret 三处口径一致（订单访问令牌也复用该密钥）。
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.get<string>('jwt.accessSecret'),
        signOptions: { expiresIn: cfg.get<string>('jwt.accessExpiresIn') },
      })
    })
  ],
  controllers: [UsersController],
  providers: [
    UsersService,
    AuthService,
    // 注册为全局守卫：默认所有路由都需要 JWT，@Public() 标记的除外。
    { provide: APP_GUARD, useClass: JwtAuthGuard }
  ],
  exports: [UsersService, AuthService],
})
export class IdentityModule {}
