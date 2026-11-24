import { Redis } from 'ioredis';
import { env } from '../config/env.ts';

class CacheAdapter {
  private client: Redis | null = null;
  private memory = new Map<string, { value: string; expiresAt: number }>();

  constructor() {
    if (env.redisUrl) {
      try {
        this.client = new Redis(env.redisUrl, {
          maxRetriesPerRequest: 2,
          lazyConnect: true,
        });
        this.client.connect().catch(() => {
          this.client = null;
        });
      } catch {
        this.client = null;
      }
    }
  }

  get isRedisActive() {
    return this.client !== null && this.client.status === 'ready';
  }

  async get(key: string): Promise<string | null> {
    if (this.client && this.isRedisActive) {
      return this.client.get(key);
    }
    const item = this.memory.get(key);
    if (!item) return null;
    if (item.expiresAt > 0 && Date.now() > item.expiresAt) {
      this.memory.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key: string, value: string, ttlSeconds = 300): Promise<void> {
    if (this.client && this.isRedisActive) {
      await this.client.set(key, value, 'EX', ttlSeconds);
      return;
    }
    this.memory.set(key, {
      value,
      expiresAt: ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : 0,
    });
  }

  async incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
    if (this.client && this.isRedisActive) {
      const count = await this.client.incr(key);
      if (count === 1) {
        await this.client.expire(key, ttlSeconds);
      }
      return count;
    }
    const now = Date.now();
    const existing = this.memory.get(key);
    if (!existing || (existing.expiresAt > 0 && now > existing.expiresAt)) {
      this.memory.set(key, { value: '1', expiresAt: now + ttlSeconds * 1000 });
      return 1;
    }
    const next = Number(existing.value) + 1;
    existing.value = String(next);
    return next;
  }

  async del(key: string): Promise<void> {
    if (this.client && this.isRedisActive) {
      await this.client.del(key);
      return;
    }
    this.memory.delete(key);
  }

  async quit(): Promise<void> {
    if (this.client) {
      await this.client.quit().catch(() => {});
    }
  }
}

export const cache = new CacheAdapter();
