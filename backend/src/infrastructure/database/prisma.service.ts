import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Database connected successfully');
    } catch (e: any) {
      this.logger.error('Database connection failed:', e.message);
      throw e;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
