/**
 * ============================================================================
 * 认证服务（AuthService）
 * ----------------------------------------------------------------------------
 * 负责三个认证场景，全部围绕「防暴力破解」与「防账号枚举」两大安全目标设计：
 *
 *   1. 登录（login）
 *      以 `login_fail:{ip}:{邮箱}` 为键在 Redis 计数，连续失败 5 次锁定 10 分钟。
 *      账号不存在、被禁用、密码错误一律返回同一个 401 文案「Invalid credentials」，
 *      攻击者无法通过响应差异判断某邮箱是否已注册。
 *
 *   2. 找回密码——发送验证码（requestResetPassword）
 *      相同邮箱 60 秒内只发一次（节流）。
 *      无论邮箱是否存在都返回完全相同的成功响应（静默成功），杜绝枚举。
 *      验证码为 6 位随机数，仅以 SHA-256 摘要入库，明文只出现在邮件正文里。
 *      发出新码前会把该邮箱同用途的旧码全部标记为已用，保证同一时刻只有一个有效码。
 *
 *   3. 重置密码（resetPassword）
 *      校验码需同时满足：邮箱、用途、未使用、摘要匹配、未过期。
 *      尝试次数以 `reset_attempts:{邮箱}` 计数，超过 5 次锁 15 分钟，防止爆破验证码。
 *      消费验证码采用条件更新（usedAt 为空时才置为已用），
 *      保证同一验证码在有并发时也只能成功使用一次。
 *
 * 注意：验证码邮件同样通过 StoreMail 发件箱异步投递，与订单邮件共用一套投递链路。
 * ============================================================================
 */

import { Injectable, Logger, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { UsersService } from './users.service';
import { PrismaService } from '@/infrastructure/database/prisma.service';
import { RedisService } from '@/infrastructure/cache/redis.service';
import { QueueService } from '@/infrastructure/queue/queue.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersService,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    /** Redis：承载登录失败计数、节流标记、验证码尝试次数等短生命周期状态。 */
    private readonly redis: RedisService,
    private readonly queue: QueueService,
  ) {}

  // ===== 登录（防暴破） =====
  /**
   * 邮箱 + 密码登录。
   *
   * @param input.email    登录邮箱（内部统一转小写，保证大小写不敏感）
   * @param input.password 明文密码，与库中 bcrypt 摘要比对
   * @param input.ip       客户端 IP，与邮箱共同构成失败计数维度
   * @returns accessToken（JWT）与用户基本信息
   * @throws UnauthorizedException 已达失败上限 / 凭据无效 / 账号被禁用
   */
  async login(input: { email: string; password: string; ip: string }) {
    const email = input.email.toLowerCase();

    // 前置闸门：同一 IP + 邮箱连续失败 5 次即锁定 10 分钟，已锁定则直接拒绝，
    // 连密码都不用比对，降低被爆破的算力消耗。
    const failKey = `login_fail:${input.ip}:${email}`;
    const failCount = parseInt((await this.redis.get(failKey)) || '0', 10);
    if (failCount >= 5) throw new UnauthorizedException('Too many failed attempts. Try again in 10 minutes.');

    // 账号不存在或被禁用也计入失败次数，防止攻击者借此探测有效账号。
    const user = await this.users.findByEmail(email);
    if (!user || user.status !== 'active') {
      await this.redis.set(failKey, String(failCount + 1), 10 * 60);
      throw new UnauthorizedException('Invalid credentials');
    }

    // bcrypt 比对为恒定耗时设计，避免通过响应时间推断密码正确性。
    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) {
      await this.redis.set(failKey, String(failCount + 1), 10 * 60);
      throw new UnauthorizedException('Invalid credentials');
    }
    await this.users.updateLastLogin(user.id);
    // 登录成功即清零失败计数，避免正常用户因偶发输错而被锁。
    await this.redis.del(failKey);

    // 签发 JWT：sub 为用户 ID，同时冗余 email 与 isAdmin 便于前端渲染（权限仍以库为准）。
    const accessToken = this.jwt.sign({ sub: user.id, email: user.email, isAdmin: user.isAdmin });
    return {
      accessToken,
      user: {
        id: user.id, email: user.email, isAdmin: user.isAdmin,
        status: user.status, locale: user.locale,
      }
    };
  }

  // ===== 找回密码：发送6位码 =====
  /**
   * 请求发送密码重置验证码。
   *
   * 节流：同一邮箱 60 秒内只允许触发一次，超频时直接返回同样的成功响应
   * （不报错、不发送），既防刷又不泄露状态。
   *
   * 静默成功：邮箱不存在时同样返回统一文案，攻击者无法区分邮箱是否注册。
   *
   * 事务内完成三件事，保证一致性：
   *   1. 作废该邮箱此前所有未使用的重置验证码；
   *   2. 写入新验证码（仅存 SHA-256 摘要，15 分钟有效）；
   *   3. 把验证码邮件写入发件箱（eventKey 含验证码记录 ID，天然防重）。
   *
   * @returns 恒定文案，不随邮箱是否存在而变化
   */
  async requestResetPassword(email: string) {
    const e = email.toLowerCase();

    // 节流：60 秒内重复请求直接短路返回（响应与正常路径一致，避免暴露节流逻辑）。
    const throttle = `reset_request:${e}`;
    if (await this.redis.get(throttle)) return { ok: true, message: 'If the email exists, a reset code has been sent.' };
    await this.redis.set(throttle, '1', 60);

    const user = await this.users.findByEmail(e);
    // 无论邮箱存在与否都静默成功（反爬 / 防账号枚举）
    if (user) {
      // 6 位数字验证码（100000~999999），明文只随邮件下发。
      const code = crypto.randomInt(100000, 1000000).toString();
      const hash = crypto.createHash('sha256').update(code).digest('hex');
      await this.prisma.$transaction(async tx => {
        // 作废旧码：同一邮箱同用途且未使用的记录统一置为已用，保证单码有效。
        await tx.verificationCode.updateMany({ where: { email: e, purpose: 'reset_password', usedAt: null }, data: { usedAt: new Date() } });
        const verification = await tx.verificationCode.create({
          data: { email: e, codeHash: hash, purpose: 'reset_password', expiresAt: new Date(Date.now() + 15 * 60 * 1000) },
        });
        // 写入发件箱，由 CommerceMail 定时投递；验证码摘要在库、明文仅在邮件中。
        await tx.storeMail.create({ data: { eventKey: `reset:${verification.id}`, recipient: e, subject: 'Reset your password',
          text: `Your password reset code is ${code}. It expires in 15 minutes. Ignore this email if you did not request it.` } });
      });
    }
    return { ok: true, message: 'If the email exists, a reset code has been sent.' };
  }

  /**
   * 使用验证码重置密码。
   *
   * 校验顺序（尽早失败，减少无效计算）：
   *   1. 新密码长度 ≥ 8；
   *   2. 该邮箱的验证码尝试次数 < 5（防止遍历 6 位码），每次请求递增并以 15 分钟过期；
   *   3. 找到匹配的验证码记录：邮箱 + 用途 + 未使用 + 摘要一致 + 未过期，取最新一条；
   *   4. 用户存在；
   *   5. 事务内条件更新消费验证码（usedAt 为空才置为已用），保证并发下只用一次，
   *      同时更新密码摘要（bcrypt cost=12）。
   * 成功后清除尝试计数。
   */
  async resetPassword(email: string, code: string, newPassword: string) {
    if (!newPassword || newPassword.length < 8) throw new BadRequestException('Password too short');
    const e = email.toLowerCase();

    // 验证码尝试限流：防止攻击者枚举 6 位数字验证码。
    const attemptKey = `reset_attempts:${e}`;
    const attempts = Number(await this.redis.get(attemptKey) || 0);
    if (attempts >= 5) throw new BadRequestException('Too many reset attempts. Try again in 15 minutes.');
    await this.redis.set(attemptKey, String(attempts + 1), 15 * 60);

    // 以摘要比对验证码（库中不存明文），并限定用途与有效期。
    const hash = crypto.createHash('sha256').update(code).digest('hex');
    const vc = await this.prisma.verificationCode.findFirst({
      where: {
        email: e, purpose: 'reset_password', usedAt: null, codeHash: hash,
        expiresAt: { gt: new Date() }
      },
      orderBy: { createdAt: 'desc' }
    });
    if (!vc) throw new BadRequestException('Invalid or expired reset code');

    const user = await this.users.findByEmail(e);
    if (!user) throw new BadRequestException('User not found');

    // 密码哈希 cost=12（高于注册时的 10），因为重置属于更高风险的凭据变更。
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.$transaction(async tx => {
      // 条件消费验证码：只有仍未被使用（usedAt 为空）才能抢占成功。
      const claimed = await tx.verificationCode.updateMany({ where: { id: vc.id, usedAt: null }, data: { usedAt: new Date() } });
      if (!claimed.count) throw new BadRequestException('Reset code was already used');
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
    });

    await this.redis.del(attemptKey);
    return { ok: true };
  }
}
