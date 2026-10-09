import { Global, Module } from '@nestjs/common';
import { QueueService } from './queue.service';

/**
 * MVP 阶段不引入 BullMQ（太重），用 EventEmitter + 简单内存 QueueService 做个壳
 * 后期并发高再迁 BullMQ，接口保留不变
 */
@Global()
@Module({ providers: [QueueService], exports: [QueueService] })
export class QueueModule {}
