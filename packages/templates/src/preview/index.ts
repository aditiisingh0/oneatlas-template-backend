// packages/templates/src/preview/index.ts
// ─── Sandbox Preview Backend — spins up ephemeral preview environments ───

import type { BundleResult } from '../composer/composer.js';

export interface PreviewRequest {
  appId: string;
  tenantId: string;
  bundle: BundleResult;
  ttlSeconds?: number;
}

export interface PreviewResponse {
  previewId: string;
  previewUrl: string;
  ttlSeconds: number;
  expiresAt: string;
  mockDataSeeded: boolean;
}

export interface PreviewStore {
  get(previewId: string): Promise<PreviewSession | null>;
  set(previewId: string, session: PreviewSession, ttlSeconds: number): Promise<void>;
  delete(previewId: string): Promise<void>;
  list(tenantId: string): Promise<string[]>;
}

export interface PreviewSession {
  previewId: string;
  appId: string;
  tenantId: string;
  previewUrl: string;
  createdAt: string;
  expiresAt: string;
  mockState: Record<string, unknown[]>; // entity → mock rows
  status: 'provisioning' | 'ready' | 'expired';
}

// ─── In-memory preview store (swap with Redis for production) ─────────────────
class InMemoryPreviewStore implements PreviewStore {
  private store = new Map<string, { session: PreviewSession; expiresAt: number }>();

  async get(previewId: string): Promise<PreviewSession | null> {
    const entry = this.store.get(previewId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(previewId);
      return null;
    }
    return entry.session;
  }

  async set(previewId: string, session: PreviewSession, ttlSeconds: number): Promise<void> {
    this.store.set(previewId, {
      session,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async delete(previewId: string): Promise<void> {
    this.store.delete(previewId);
  }

  async list(tenantId: string): Promise<string[]> {
    return [...this.store.entries()]
      .filter(([, v]) => v.session.tenantId === tenantId)
      .map(([k]) => k);
  }
}

// ─── Preview Engine ───────────────────────────────────────────────────────────
export class PreviewEngine {
  private store: PreviewStore;
  private basePreviewDomain: string;

  constructor(options?: { store?: PreviewStore; basePreviewDomain?: string }) {
    this.store = options?.store ?? new InMemoryPreviewStore();
    this.basePreviewDomain = options?.basePreviewDomain ?? 'preview.oneatlas.app';
  }

  async createPreview(req: PreviewRequest): Promise<PreviewResponse> {
    const previewId = generatePreviewId();
    const ttl = req.ttlSeconds ?? 3600;
    const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
    const previewUrl = `https://${previewId}.${this.basePreviewDomain}`;

    // Generate mock data for all entities in the bundle
    const mockState = generateMockState(req.bundle);

    const session: PreviewSession = {
      previewId,
      appId: req.appId,
      tenantId: req.tenantId,
      previewUrl,
      createdAt: new Date().toISOString(),
      expiresAt,
      mockState,
      status: 'ready',
    };

    await this.store.set(previewId, session, ttl);

    return {
      previewId,
      previewUrl,
      ttlSeconds: ttl,
      expiresAt,
      mockDataSeeded: Object.keys(mockState).length > 0,
    };
  }

  async getPreview(previewId: string): Promise<PreviewSession | null> {
    return this.store.get(previewId);
  }

  async destroyPreview(previewId: string): Promise<void> {
    await this.store.delete(previewId);
  }

  async extendPreview(previewId: string, additionalSeconds: number): Promise<void> {
    const session = await this.store.get(previewId);
    if (!session) throw new Error(`Preview not found: ${previewId}`);

    const newExpiry = new Date(
      new Date(session.expiresAt).getTime() + additionalSeconds * 1000
    ).toISOString();

    await this.store.set(
      previewId,
      { ...session, expiresAt: newExpiry },
      additionalSeconds
    );
  }

  // Handle a mock API request from the preview Worker
  async handleMockRequest(
    previewId: string,
    method: string,
    path: string,
    body?: unknown
  ): Promise<{ status: number; data: unknown }> {
    const session = await this.store.get(previewId);
    if (!session) return { status: 404, data: { error: 'Preview not found' } };

    // Route: GET /api/{entity} → list
    const listMatch = path.match(/^\/api\/([a-z_]+)$/);
    if (listMatch && method === 'GET') {
      const entityKey = listMatch[1]!;
      const items = session.mockState[entityKey] ?? [];
      return { status: 200, data: { data: items, meta: { total: items.length } } };
    }

    // Route: GET /api/{entity}/{id} → get one
    const detailMatch = path.match(/^\/api\/([a-z_]+)\/([^/]+)$/);
    if (detailMatch && method === 'GET') {
      const entityKey = detailMatch[1]!;
      const id = detailMatch[2]!;
      const items = session.mockState[entityKey] ?? [];
      const item = (items as Record<string, unknown>[]).find((i) => i['id'] === id);
      if (!item) return { status: 404, data: { error: 'Not found' } };
      return { status: 200, data: { data: item } };
    }

    // Route: POST /api/{entity} → create mock
    if (listMatch && method === 'POST') {
      const entityKey = listMatch[1]!;
      const newItem = { id: crypto.randomUUID(), ...(body as Record<string, unknown>), createdAt: new Date().toISOString() };
      session.mockState[entityKey] = [...(session.mockState[entityKey] ?? []), newItem];
      await this.store.set(previewId, session, 3600);
      return { status: 201, data: { data: newItem } };
    }

    return { status: 404, data: { error: 'Route not found in preview' } };
  }
}

// ─── Mock data generation ──────────────────────────────────────────────────────
function generateMockState(bundle: BundleResult): Record<string, unknown[]> {
  // Extract entity names from route patterns
  const entityRoutes = bundle.files
    .filter((f) => f.path.startsWith('pages/api/') && !f.path.includes('[id]'))
    .map((f) => {
      const match = f.path.match(/pages\/api\/([^/]+)\//);
      return match?.[1] ?? null;
    })
    .filter(Boolean) as string[];

  const state: Record<string, unknown[]> = {};
  for (const entityKey of entityRoutes) {
    state[entityKey] = generateMockRows(entityKey, 5);
  }
  return state;
}

function generateMockRows(entityKey: string, count: number): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, i) => ({
    id: crypto.randomUUID(),
    name: `Sample ${entityKey} ${i + 1}`,
    createdAt: new Date(Date.now() - i * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
    status: ['active', 'inactive', 'pending'][i % 3],
  }));
}

function generatePreviewId(): string {
  return 'preview-' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}

// ─── Singleton preview engine ─────────────────────────────────────────────────
// Uses RedisPreviewStore when UPSTASH_REDIS_URL is set, otherwise falls back
// to InMemoryPreviewStore for local development and tests.
import { RedisPreviewStore } from './redis-store.js';

function buildPreviewStore(): PreviewStore {
  if (process.env['UPSTASH_REDIS_URL'] && process.env['UPSTASH_REDIS_TOKEN']) {
    return new RedisPreviewStore();
  }
  return new InMemoryPreviewStore();
}

export const previewEngine = new PreviewEngine({ store: buildPreviewStore() });
