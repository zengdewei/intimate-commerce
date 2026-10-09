/**
 * ============================================================================
 * 商城模块装配（CommerceModule）
 * ----------------------------------------------------------------------------
 * 负责把商城相关的控制器与提供者注册进 NestJS 依赖注入容器：
 *
 *   controllers：CommerceController（前台 /store）
 *                CommerceAdminController（后台 /store/admin）
 *   providers：  CommerceService    业务主服务（对外导出，供其他模块复用）
 *                CommerceConfig     配置中心
 *                CommercePayments   支付通道适配器
 *                CommerceMail       邮件投递定时任务
 *                StoreAdminGuard    后台管理员守卫
 *                APP_FILTER → CommerceDatabaseFilter  全局 Prisma 异常过滤器
 *
 * 关于 JwtModule：这里以 register({}) 空配置注册，仅提供 JwtService 实例；
 * 密钥在验签时由 CommerceConfig.secret 显式传入，与全局守卫的校验口径保持一致。
 * ============================================================================
 */

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CommerceController, CommerceAdminController, StoreAdminGuard } from './commerce.controller';
import { CommerceService } from './commerce.service';
import { CommerceConfig } from './commerce.config';
import { CommercePayments } from './commerce.payments';
import { CommerceMail } from './commerce.mail';
import { APP_FILTER } from '@nestjs/core';
import { CommerceDatabaseFilter } from './commerce.filter';

@Module({
  imports: [JwtModule.register({})],
  controllers: [CommerceController, CommerceAdminController],
  providers: [CommerceService, CommerceConfig, CommercePayments, CommerceMail, StoreAdminGuard,
    // 以 APP_FILTER 注册，使该过滤器对全应用生效（而不仅限于本模块的控制器）。
    { provide: APP_FILTER, useClass: CommerceDatabaseFilter }],
  // 导出 CommerceService：identity 模块的注册/重置密码流程会直接写入邮件发件箱。
  exports: [CommerceService],
})
export class CommerceModule {}
