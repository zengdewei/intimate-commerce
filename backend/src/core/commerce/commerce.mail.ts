/**
 * ============================================================================
 * 邮件投递服务（CommerceMail）
 * ----------------------------------------------------------------------------
 * 采用「发件箱 + 定时投递」的异步模式，而不是在业务请求里同步发信：
 *
 *   业务侧（CommerceService.mail / AuthService）只把邮件写入 StoreMail 表；
 *   本服务每 30 秒扫描一次发件箱，把待投递邮件真正发送出去。
 *
 * 这样做的收益：
 *   - 下单/重置密码等主流程不被 SMTP 延迟或失败拖累。
 *   - 发信失败可自动退避重试，不会丢信（最多重试 8 次）。
 *   - 本地预览默认不外发，邮件留在库里，避免误发给真实用户。
 *
 * 两种投递渠道（二选一，RESEND_API_KEY 优先）：
 *   - Resend HTTP API：带 Idempotency-Key，天然防重复投递。
 *   - 自定义 SMTP（如本地 MailHog）：由 DEV_SMTP_HOST / DEV_SMTP_PORT 配置。
 * 若两者都未配置，则邮件静默留在发件箱，仅在存在积压时输出一条 verbose 日志。
 *
 * 并发安全：投递前用条件更新「抢占」邮件（status + nextAt 双条件），
 * 只有抢占成功的实例才发送，避免多实例或重入导致重复发送。
 * ============================================================================
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@/infrastructure/database/prisma.service';
import axios from 'axios';
import * as nodemailer from 'nodemailer';
import { CommerceConfig } from './commerce.config';

@Injectable()
export class CommerceMail implements OnModuleInit {
  private readonly logger = new Logger(CommerceMail.name);
  /** SMTP 传输器；未配置 devSmtp 时为 undefined（此时依赖 Resend 或落库不出站）。 */
  private smtp?: ReturnType<typeof nodemailer.createTransport>;

  constructor(private readonly db: PrismaService, private readonly cfg: ConfigService, private readonly settings: CommerceConfig) {}

  /**
   * 启动时按配置初始化 SMTP 传输器。
   * 仅在 host 与 port 都配置时才创建；初始化失败只告警不阻断启动——
   * 邮件是旁路能力，不应因为它配置错误导致整个服务起不来。
   */
  onModuleInit() {
    const s = this.cfg.get('devSmtp') as any;
    if (s?.host && s?.port) {
      try {
        this.smtp = nodemailer.createTransport({
          // secure: false 表示使用 STARTTLS（本地 MailHog 为明文 SMTP），生产请用 Resend。
          host: s.host, port: s.port, secure: false,
          auth: s.user ? { user: s.user, pass: s.pass } : undefined,
        });
        this.logger.log(`📧 CommerceMail drainer: DEV SMTP configured at ${s.host}:${s.port}`);
      } catch (e: any) {
        this.logger.warn(`CommerceMail drainer: DEV SMTP init failed: ${e.message}`);
      }
    }
  }

  /** 发件人地址：优先 MAIL_FROM，其次 resend.from，最后落到本地占位地址。 */
  private from() {
    return this.cfg.get<string>('MAIL_FROM') || this.cfg.get<string>('resend.from') || 'no-reply@local.dev';
  }

  /**
   * 定时投递任务：每 30 秒执行一次。
   *
   * 处理逻辑：
   *   1. 未配置任何渠道时，仅统计积压并记日志后返回（预览环境刻意不外发，
   *      避免误将演示邮件发给真实邮箱）。
   *   2. 取最多 10 封「待发送/发送中、重试次数 < 8、到达下次投递时间」的邮件。
   *   3. 逐封「抢占」：条件更新为 sending 并把 nextAt 推迟 2 分钟、attempts 加 1，
   *      抢占成功（count === 1）才继续发送，防止并发重复投递。
   *   4. 发送成功后标记 sent，并把正文替换为 [delivered] 以防私密链接长期留存于库中。
   *   5. 发送失败则退回 pending，并按指数退避（2^attempts 分钟）安排下次重试。
   *
   * 重试上限：attempts >= 8 后不再被查询命中，等同「死信」，
   * 可在后台通过 health 接口的 failedEmails 指标发现。
   */
  @Cron('*/30 * * * * *')
  async deliver() {
    const resendKey = this.cfg.get<string>('RESEND_API_KEY');

    // 无任何投递渠道：仅在有积压时提示一次，刻意不外发。
    if (!resendKey && !this.smtp) {
      // Preview emails intentionally stay in the local outbox to avoid accidental disclosure.
      // Log once per boot would be ideal; here we log silently so logs stay clean.
      const pending = await this.db.storeMail.count({ where: { status: 'pending' } });
      if (pending > 0) this.logger.verbose(`CommerceMail: ${pending} message(s) in outbox. Configure RESEND_API_KEY or DEV_SMTP_HOST/PORT to deliver them.`);
      return;
    }

    // 每轮最多取 10 封，避免单次任务耗时过长；nextAt 控制退避节奏。
    const messages = await this.db.storeMail.findMany({
      where: { status: { in: ['pending', 'sending'] }, attempts: { lt: 8 }, nextAt: { lte: new Date() } }, take: 10,
    });

    for (const mail of messages) {
      // 抢占：以原 status + nextAt 为条件，保证只有一个执行流能拿到这封邮件。
      const claim = await this.db.storeMail.updateMany({
        where: { id: mail.id, status: mail.status, nextAt: mail.nextAt },
        data: { status: 'sending', nextAt: new Date(Date.now() + 120000), attempts: { increment: 1 } },
      });
      if (!claim.count) continue; // 已被其他执行流抢占，跳过

      try {
        if (resendKey) {
          // Resend HTTP API：用邮件 ID 作为幂等键，杜绝重试导致重复投递。
          await axios.post('https://api.resend.com/emails', {
            from: this.from(), to: mail.recipient, subject: mail.subject, text: mail.text,
          }, { headers: { Authorization: `Bearer ${resendKey}`, 'Idempotency-Key': mail.id }, timeout: 15000 });
        } else if (this.smtp) {
          await this.smtp.sendMail({ from: this.from(), to: mail.recipient, subject: mail.subject, text: mail.text });
        }
        // 发送成功：清空正文（其中含订单私密链接/验证码），只保留投递状态。
        await this.db.storeMail.update({ where: { id: mail.id }, data: { status: 'sent', text: '[delivered]' } });
      } catch (e: any) {
        // 失败退回 pending，指数退避：2^attempts 分钟（1、2、4、8…），避免打爆邮件服务商。
        await this.db.storeMail.update({
          where: { id: mail.id }, data: { status: 'pending', nextAt: new Date(Date.now() + 60000 * 2 ** mail.attempts) },
        });
        this.logger.warn(`Email delivery retry scheduled: ${mail.id} (${e.message})`);
      }
    }
  }
}
