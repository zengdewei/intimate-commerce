// ============================================================
// App Module - MVP
// ============================================================
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import configuration from './infrastructure/config/configuration';

// Infrastructure
import { DatabaseModule } from './infrastructure/database/database.module';
import { CacheModule } from './infrastructure/cache/cache.module';
import { QueueModule } from './infrastructure/queue/queue.module';

// Core Modules (MVP 先注册：先框架，具体实现按里程碑填充)
import { IdentityModule } from './core/identity/identity.module';
import { CommerceModule } from './core/commerce/commerce.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env.local', '.env'],
    }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot({ global: true, delimiter: '.' }),

    DatabaseModule,
    CacheModule,
    QueueModule,

    IdentityModule,
    CommerceModule,
  ],
})
export class AppModule {}
