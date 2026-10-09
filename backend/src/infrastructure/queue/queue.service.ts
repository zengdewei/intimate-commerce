import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * MVP 简单队列封装（EventEmitter 代替，后期换 BullMQ 不影响调用方）
 */
@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);
  constructor(private readonly event: EventEmitter2) {}

  /**
   * 发异步任务（MVP当前进程内做；后期 add 直接走 EventEmitter）
   * 用法： queue.add('send.email', { userId, template, vars})
   */
  add<T>(name: string, data: T, opts?: { delayMs?: number }): void {
    if (opts?.delayMs && opts.delayMs > 0) {
      setTimeout(() => this.event.emit(name, data), opts.delayMs);
    } else {
      setImmediate(() => this.event.emit(name, data));
    }
    this.logger.debug(`📬 Queued job: ${name}`);
  }
}
