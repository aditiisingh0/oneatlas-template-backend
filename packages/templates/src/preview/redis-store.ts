// packages/templates/src/preview/redis-store.ts
// Redis-backed preview store — production replacement for InMemoryPreviewStore

import { Redis } from '@upstash/redis';
import type { PreviewStore, PreviewSession } from './index.js';

const TENANT_INDEX_PREFIX = 'preview:tenant:';
const SESSION_PREFIX = 'preview:session:';

export class RedisPreviewStore implements PreviewStore {
  private redis: Redis;

  constructor(options?: { url?: string; token?: string }) {
    this.redis = new Redis({
      url: options?.url ?? process.env['UPSTASH_REDIS_URL'] ?? '',
      token: options?.token ?? process.env['UPSTASH_REDIS_TOKEN'] ?? '',
    });
  }

  async get(previewId: string): Promise<PreviewSession | null> {
    const key = SESSION_PREFIX + previewId;
    const data = await this.redis.get<PreviewSession>(key);
    return data ?? null;
  }

  async set(previewId: string, session: PreviewSession, ttlSeconds: number): Promise<void> {
    const sessionKey = SESSION_PREFIX + previewId;
    const indexKey = TENANT_INDEX_PREFIX + session.tenantId;

    // Store the session with TTL
    await this.redis.set(sessionKey, session, { ex: ttlSeconds });

    // Add previewId to the tenant's index set, also with TTL
    await this.redis.sadd(indexKey, previewId);
    await this.redis.expire(indexKey, ttlSeconds);
  }

  async delete(previewId: string): Promise<void> {
    // Get session first to find tenantId for index cleanup
    const session = await this.get(previewId);
    if (session) {
      const indexKey = TENANT_INDEX_PREFIX + session.tenantId;
      await this.redis.srem(indexKey, previewId);
    }
    await this.redis.del(SESSION_PREFIX + previewId);
  }

  async list(tenantId: string): Promise<string[]> {
    const indexKey = TENANT_INDEX_PREFIX + tenantId;
    const members = await this.redis.smembers(indexKey);

    // Filter out any that have already expired
    const alive: string[] = [];
    for (const id of members) {
      const exists = await this.redis.exists(SESSION_PREFIX + id);
      if (exists) {
        alive.push(id);
      } else {
        // Clean up stale index entry
        await this.redis.srem(indexKey, id);
      }
    }
    return alive;
  }
}
