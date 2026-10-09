/**
 * ============================================================================
 * 用户数据服务（UsersService）
 * ----------------------------------------------------------------------------
 * 只负责「用户账号」这一实体的数据存取与密码摘要处理，不含任何 HTTP 与
 * 认证策略逻辑（那些属于 UsersController / AuthService）。
 *
 * 约定：
 *   - 邮箱一律转小写后存储与查询，保证邮箱唯一性判定大小写不敏感。
 *   - 本服务只处理 bcrypt 摘要，任何方法都不接收或返回明文密码以外的持久数据。
 *   - 注册时的密码强度下限（≥8 位）在此处再校验一次，作为 DTO 之外的第二道防线。
 * ============================================================================
 */

import { Injectable, BadRequestException, UnauthorizedException, ConflictException } from '@nestjs/common';
import { PrismaService } from '@/infrastructure/database/prisma.service';
import { User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** 按主键查询用户，不存在返回 null。 */
  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /** 按邮箱查询用户；入参统一转小写以匹配存储约定。 */
  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  }

  /**
   * 注册新用户。
   *
   * @param input.email    邮箱（转小写后查重与存储）
   * @param input.password 明文密码，仅用于生成摘要，不落库
   * @param input.fullName 可选昵称
   * @param input.locale   界面语言，默认 'en'
   * @throws ConflictException    邮箱已被注册
   * @throws BadRequestException  密码少于 8 位
   * @returns 新建的用户记录（含 passwordHash，调用方需注意不要外泄该字段）
   */
  async register(input: { email: string; password: string; fullName?: string; locale?: string }): Promise<User> {
    const email = input.email.toLowerCase();
    const exists = await this.findByEmail(email);
    if (exists) throw new ConflictException('Email already registered');

    // MVP: 8位以上密码，不强求特殊字符
    if (!input.password || input.password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters long');
    }

    // bcrypt cost=10（注册场景；密码重置使用更高成本 12）。
    const passwordHash = await bcrypt.hash(input.password, 10);
    return this.prisma.user.create({
      data: {
        email,
        fullName: input.fullName,
        passwordHash,
        locale: input.locale || 'en',
        status: 'active',
      }
    });
  }

  /**
   * 校验明文密码是否与库中摘要匹配。
   * 用户不存在时返回 false（而非抛错），交由调用方决定对外文案。
   */
  async verifyPassword(userId: string, oldPwd: string): Promise<boolean> {
    const u = await this.findById(userId);
    if (!u) return false;
    return bcrypt.compare(oldPwd, u.passwordHash);
  }

  /** 更新密码摘要（cost=10）。调用方应先用 verifyPassword 校验旧密码。 */
  async updatePassword(userId: string, newPwd: string): Promise<void> {
    const hash = await bcrypt.hash(newPwd, 10);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: hash } });
  }

  /** 记录最近一次登录时间（用于运营侧观察活跃度，不参与鉴权）。 */
  async updateLastLogin(userId: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  }

  /**
   * 更新个人资料（仅昵称与时区）。
   * 使用「字段存在则更新」的部分更新策略：未传的字段保持原值不变，
   * 因此可以只改昵称而不影响时区。
   */
  async updateProfile(userId: string, input: { fullName?: string; timezone?: string }): Promise<User> {
    const data: any = {};
    if (typeof input.fullName === 'string') data.fullName = input.fullName;
    if (typeof input.timezone === 'string') data.timezone = input.timezone;
    return this.prisma.user.update({ where: { id: userId }, data });
  }
}
