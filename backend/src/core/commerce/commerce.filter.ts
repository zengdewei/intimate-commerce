/**
 * ============================================================================
 * Prisma 异常过滤器（CommerceDatabaseFilter）
 * ----------------------------------------------------------------------------
 * 把 Prisma 抛出的底层数据库错误码，翻译成对前端友好的 HTTP 状态码与提示文案。
 *
 * 为什么需要它：
 *   - Prisma 错误默认会以 500 冒出，用户看到的是「服务器错误」，
 *     但实际上大多是并发冲突或唯一键重复这类可重试的业务问题。
 *   - 交易场景下必须把「并发冲突」明确表达为 409，前端才能提示用户刷新重试，
 *     而不是让用户以为系统崩了。
 *
 * 错误码映射：
 *   P2002 → 409  唯一约束冲突（如 SKU / 幂等键重复）
 *   P2025 → 404  目标记录不存在或已被删除
 *   P2034 → 409  事务因并发写冲突被数据库中止，可重试
 *   P2028 → 409  事务超时或未能完成，可重试
 *   其他  → 500  未预期的数据库错误，仅返回通用文案
 *
 * 安全考虑：对外只返回通用友好文案，不泄露表名、字段名等库结构信息；
 * 完整的 code / meta / message 仅打印到服务端日志，供排查使用。
 * ============================================================================
 */

import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Catch(Prisma.PrismaClientKnownRequestError)
export class CommerceDatabaseFilter implements ExceptionFilter {
  catch(error: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    /** 错误码 → [HTTP 状态码, 面向用户的提示文案] 的映射表。 */
    const messages: Record<string, [number, string]> = {
      P2002: [409, 'This identifier already exists. Refresh before trying again.'],
      P2025: [404, 'The requested record no longer exists.'],
      P2034: [409, 'Another operation updated this record. Please retry.'],
      P2028: [409, 'The operation could not finish. Please refresh and retry.'],
    };
    // 未命中映射表时按 500 处理。
    const [status, message] = messages[error.code] || [500, 'The operation could not be completed.'];
    // 服务端保留完整错误细节用于排障（不对外返回）。
    // eslint-disable-next-line no-console
    console.error('[CommerceDatabaseFilter] prisma error', { code: error.code, meta: error.meta, message: error.message });
    host.switchToHttp().getResponse().status(status).json({ statusCode: status, message });
  }
}
