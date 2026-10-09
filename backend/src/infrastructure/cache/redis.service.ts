import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * 简单原则：有 Redis（REDIS_HOST 通）就用 Redis；否则自动降级为内存 Map（单机 MVP 够用）。
 * 同一 API 对上层透明（get/set/del/incr/decr/exists）。
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private mem = new Map<string, { v: string; t?: number }>();
  private useMemory = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const cfg = this.config.get('redis') as any;
    const host = cfg?.host;
    if (!host || host === 'none' || host === '') {
      this.useMemory = true;
      this.logger.warn('⚠️ Redis not configured — using in-memory cache (single-instance safe only)');
      return;
    }
    try {
      this.client = new Redis({
        host: cfg.host, port: cfg.port, password: cfg.password || undefined, lazyConnect: false,
        maxRetriesPerRequest: 3, connectTimeout: 1500, enableOfflineQueue: false,
      });
      this.client.on('connect', () => this.logger.log('✅ Redis connected'));
      this.client.on('error', (e) => {
        if (!this.useMemory) {
          this.logger.warn(`⚠️ Redis unreachable (${e.message}), falling back to in-memory cache`);
          this.useMemory = true;
        }
      });
    } catch (e: any) {
      this.useMemory = true;
      this.logger.warn(`⚠️ Redis init failed (${e.message}) — using in-memory cache`);
    }
  }

  getClient(): Redis | null { return this.client; }

  async onModuleDestroy() { this.client && this.client.disconnect(); }

  // ============ 统一接口 ============
  async get(key: string) {
    this._gc();
    if (this.useMemory) {
      const r = this.mem.get(key);
      if (!r) return null;
      if (r.t && r.t < Date.now()) { this.mem.delete(key); return null; }
      return r.v;
    }
    try { return await this.client!.get(key); } catch { this.useMemory = true; return this.get(key); }
  }

  async set(key: string, value: string, ttlSeconds?: number) {
    if (this.useMemory) {
      this.mem.set(key, { v: value, t: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined });
      return 'OK' as any;
    }
    try {
      return ttlSeconds ? this.client!.set(key, value, 'EX', ttlSeconds) : this.client!.set(key, value);
    } catch { this.useMemory = true; return this.set(key, value, ttlSeconds); }
  }

  async del(key: string) {
    if (this.useMemory) return this.mem.delete(key) ? 1 : 0;
    try { return await this.client!.del(key); } catch { this.useMemory = true; return this.del(key); }
  }

  async incr(key: string) {
    if (this.useMemory) {
      const cur = this.mem.get(key);
      const n = (cur ? parseInt(cur.v, 10) || 0 : 0) + 1;
      this.mem.set(key, { v: String(n), t: cur?.t });
      return n;
    }
    try { return await this.client!.incr(key); } catch { this.useMemory = true; return this.incr(key); }
  }
  async decr(key: string) {
    if (this.useMemory) {
      const cur = this.mem.get(key);
      const n = (cur ? parseInt(cur.v, 10) || 0 : 0) - 1;
      this.mem.set(key, { v: String(n), t: cur?.t });
      return n;
    }
    try { return await this.client!.decr(key); } catch { this.useMemory = true; return this.decr(key); }
  }
  async exists(key: string) {
    this._gc();
    if (this.useMemory) return this.mem.has(key) ? 1 : 0;
    try { return await this.client!.exists(key); } catch { this.useMemory = true; return this.exists(key); }
  }

  private _gc() {
    if (!this.useMemory) return;
    const now = Date.now();
    for (const [k, v] of this.mem) if (v.t && v.t < now) this.mem.delete(k);
  }
}

