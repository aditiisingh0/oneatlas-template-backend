// packages/templates/src/__tests__/api.test.ts
// ─── API Integration Tests ────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import type { Server } from 'http';

// ─── Mock heavy dependencies before importing server ─────────────────────────
vi.mock('../pipeline.js', () => ({
  runGenerationPipeline: vi.fn().mockResolvedValue({
    spec: { id: 'app-123', appType: 'crud', name: 'Test CRM', entities: [] },
    entities: [{ name: 'Customer', tableName: 'customers' }],
    routes: [{ method: 'GET', path: '/api/customers' }],
    fileCount: 12,
    manifestJson: '{"appId":"app-123"}',
  }),
  runPreviewPipeline: vi.fn().mockResolvedValue({
    spec: { id: 'app-456', appType: 'crud' },
    preview: { previewId: 'prev-789', previewUrl: 'https://preview.example.com/prev-789', expiresAt: new Date(Date.now() + 3600000).toISOString() },
    entities: [],
    manifestJson: '{}',
  }),
  runDeployPipeline: vi.fn().mockResolvedValue({
    spec: { id: 'app-789', appType: 'crud' },
    deployment: { deploymentId: 'dep-abc', deployUrl: 'https://app.example.com', status: 'deploying' },
    entities: [],
  }),
  runIncrementalUpdate: vi.fn().mockResolvedValue({
    result: {
      spec: { id: 'app-123', appType: 'crud' },
      manifestJson: '{"appId":"app-123","version":2}',
      entities: [],
    },
    diff: { addedEntities: ['Order'], removedEntities: [], modifiedEntities: [], addedRoutes: ['/api/orders'] },
  }),
}));

vi.mock('../preview/index.js', () => ({
  previewEngine: {
    getPreview: vi.fn().mockResolvedValue({ previewId: 'prev-789', previewUrl: 'https://preview.example.com/prev-789' }),
    destroyPreview: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../deployment/index.js', () => ({
  deploymentEngine: {
    getDeployment: vi.fn().mockResolvedValue({ deploymentId: 'dep-abc', status: 'deployed', deployUrl: 'https://app.example.com' }),
  },
}));

vi.mock('../workflows/executor.js', () => ({
  workflowExecutor: {
    getRun: vi.fn().mockReturnValue({ runId: 'run-001', status: 'completed', currentStep: 2, stepResults: [] }),
    startRun: vi.fn().mockResolvedValue({ runId: 'run-002', status: 'pending' }),
  },
  setPrismaResolver: vi.fn(),
  evaluateCondition: vi.fn(),
  matchesTrigger: vi.fn(),
}));

vi.mock('../spec-engine/index.js', () => ({
  buildSpecFromEntities: vi.fn().mockReturnValue({
    id: 'spec-001',
    tenantId: 'tenant-abc',
    name: 'Test App',
    appType: 'crud',
    entities: [{ name: 'Customer', tableName: 'customers', fields: [] }],
    pages: [],
    routes: [],
    permissions: { roles: [], entityPermissions: [] },
    slug: 'test-app',
  }),
}));

// ─── Import server after mocks ────────────────────────────────────────────────
import { createApiServer } from '../api/server.js';

// ─── Test helpers ─────────────────────────────────────────────────────────────
let server: Server;
let baseUrl: string;

async function req(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: unknown
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

// ─── Setup ────────────────────────────────────────────────────────────────────
beforeAll(async () => {
  const app = createApiServer();
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address() as { port: number };
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

afterAll(() => {
  server.close();
});

// ─── Health ───────────────────────────────────────────────────────────────────
describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const { status, body } = await req('GET', '/health');
    expect(status).toBe(200);
    expect((body as Record<string, unknown>).status).toBe('ok');
    expect((body as Record<string, unknown>).service).toBe('oneatlas-template-backend');
  });
});

// ─── Generate ─────────────────────────────────────────────────────────────────
describe('POST /api/templates/generate', () => {
  it('returns 400 when tenantId is missing', async () => {
    const { status, body } = await req('POST', '/api/templates/generate', {
      userPrompt: 'Build a CRM',
    });
    expect(status).toBe(400);
    expect((body as Record<string, unknown>).error).toContain('tenantId');
  });

  it('returns 400 when neither userPrompt nor entities is provided', async () => {
    const { status, body } = await req('POST', '/api/templates/generate', {
      tenantId: 'tenant-abc',
    });
    expect(status).toBe(400);
    expect((body as Record<string, unknown>).error).toContain('userPrompt or entities');
  });

  it('generates app from userPrompt', async () => {
    const { status, body } = await req('POST', '/api/templates/generate', {
      tenantId: 'tenant-abc',
      userPrompt: 'Build a customer CRM with orders',
      appName: 'My CRM',
      appType: 'crud',
    });
    expect(status).toBe(200);
    const b = body as Record<string, unknown>;
    expect(b.appId).toBe('app-123');
    expect(b.appType).toBe('crud');
    expect(Array.isArray(b.entities)).toBe(true);
    expect(b.fileCount).toBeGreaterThan(0);
    expect(typeof b.manifestJson).toBe('string');
  });

  it('generates app from entities array', async () => {
    const { status, body } = await req('POST', '/api/templates/generate', {
      tenantId: 'tenant-abc',
      entities: [{ name: 'Product', tableName: 'products', fields: [] }],
      appName: 'Product Catalog',
      appType: 'crud',
    });
    expect(status).toBe(200);
    expect((body as Record<string, unknown>).appId).toBeDefined();
  });
});

// ─── Preview ──────────────────────────────────────────────────────────────────
describe('POST /api/templates/preview', () => {
  it('returns 400 when tenantId missing', async () => {
    const { status } = await req('POST', '/api/templates/preview', { userPrompt: 'test' });
    expect(status).toBe(400);
  });

  it('returns previewUrl and previewId', async () => {
    const { status, body } = await req('POST', '/api/templates/preview', {
      tenantId: 'tenant-abc',
      userPrompt: 'Build a dashboard',
      appType: 'dashboard',
    });
    expect(status).toBe(200);
    const b = body as Record<string, unknown>;
    expect(b.previewUrl).toContain('preview');
    expect(b.previewId).toBeDefined();
    expect(b.expiresAt).toBeDefined();
  });

  it('respects custom ttlSeconds', async () => {
    const { status } = await req('POST', '/api/templates/preview', {
      tenantId: 'tenant-abc',
      userPrompt: 'test',
      ttlSeconds: 7200,
    });
    expect(status).toBe(200);
  });
});

// ─── Deploy ───────────────────────────────────────────────────────────────────
describe('POST /api/templates/deploy', () => {
  it('returns 400 when tenantId missing', async () => {
    const { status } = await req('POST', '/api/templates/deploy', { userPrompt: 'test' });
    expect(status).toBe(400);
  });

  it('returns deploymentId and deployUrl', async () => {
    const { status, body } = await req('POST', '/api/templates/deploy', {
      tenantId: 'tenant-abc',
      userPrompt: 'Deploy my CRM',
      appType: 'crud',
      projectName: 'my-crm',
    });
    expect(status).toBe(200);
    const b = body as Record<string, unknown>;
    expect(b.deploymentId).toBeDefined();
    expect(b.deployUrl).toBeDefined();
    expect(b.status).toBe('deploying');
  });
});

// ─── Incremental update ───────────────────────────────────────────────────────
describe('POST /api/templates/update', () => {
  it('returns 400 when fields are missing', async () => {
    const { status, body } = await req('POST', '/api/templates/update', {
      existingSpec: {},
    });
    expect(status).toBe(400);
    expect((body as Record<string, unknown>).error).toContain('required');
  });

  it('returns diff with added entities', async () => {
    const { status, body } = await req('POST', '/api/templates/update', {
      existingSpec: { id: 'app-123', appType: 'crud', entities: [] },
      existingManifestJson: '{"appId":"app-123","version":1}',
      refinementPrompt: 'Add an Orders entity',
    });
    expect(status).toBe(200);
    const b = body as Record<string, unknown>;
    expect(b.appId).toBe('app-123');
    const diff = b.diff as Record<string, unknown>;
    expect(diff.addedEntities).toContain('Order');
    expect(typeof b.manifestJson).toBe('string');
  });
});

// ─── Team 3 integration ───────────────────────────────────────────────────────
describe('POST /api/templates/from-understanding', () => {
  it('returns 400 when understanding is missing', async () => {
    const { status } = await req('POST', '/api/templates/from-understanding', {
      tenantId: 'tenant-abc',
    });
    expect(status).toBe(400);
  });

  it('adapts AppUnderstanding to AppSpec and generates', async () => {
    const { status, body } = await req('POST', '/api/templates/from-understanding', {
      tenantId: 'tenant-abc',
      understanding: {
        appName: 'My SaaS',
        appType: 'crud',
        features: ['create', 'list', 'delete'],
        pages: ['customers', 'orders'],
        entities: [
          {
            name: 'Customer',
            tableName: 'customers',
            fields: [{ name: 'name', type: 'string', label: 'Name', required: true }],
          },
        ],
      },
    });
    expect(status).toBe(200);
    const b = body as Record<string, unknown>;
    expect(b.appId).toBeDefined();
    const adapted = b.adapted as Record<string, unknown>;
    expect(adapted.appType).toBe('crud');
    expect(adapted.entityCount).toBe(1);
  });

  it('handles unknown appType by falling back to crud', async () => {
    const { status, body } = await req('POST', '/api/templates/from-understanding', {
      tenantId: 'tenant-abc',
      understanding: {
        appName: 'Test',
        appType: 'unknown-type',
        features: [],
        pages: ['items'],
        entities: [],
      },
    });
    expect(status).toBe(200);
    const adapted = (body as Record<string, unknown>).adapted as Record<string, unknown>;
    expect(adapted.appType).toBe('crud');
  });

  it('synthesises entity from pages when entities is empty', async () => {
    const { status, body } = await req('POST', '/api/templates/from-understanding', {
      tenantId: 'tenant-abc',
      understanding: {
        appName: 'Blog',
        appType: 'crud',
        features: [],
        pages: ['blog-posts'],
        entities: [],
      },
    });
    expect(status).toBe(200);
    const adapted = (body as Record<string, unknown>).adapted as Record<string, unknown>;
    expect(adapted.entityCount).toBe(1);
  });
});

// ─── Preview management ───────────────────────────────────────────────────────
describe('GET /api/previews/:previewId', () => {
  it('returns preview details', async () => {
    const { status, body } = await req('GET', '/api/previews/prev-789');
    expect(status).toBe(200);
    const b = body as Record<string, unknown>;
    expect((b.preview as Record<string, unknown>).previewId).toBe('prev-789');
  });
});

describe('DELETE /api/previews/:previewId', () => {
  it('returns 204 on destroy', async () => {
    const { status } = await req('DELETE', '/api/previews/prev-789');
    expect(status).toBe(204);
  });
});

// ─── Deployment status ────────────────────────────────────────────────────────
describe('GET /api/deployments/:deploymentId', () => {
  it('returns deployment details', async () => {
    const { status, body } = await req('GET', '/api/deployments/dep-abc');
    expect(status).toBe(200);
    const b = body as Record<string, unknown>;
    expect((b.deployment as Record<string, unknown>).deploymentId).toBe('dep-abc');
    expect((b.deployment as Record<string, unknown>).status).toBe('deployed');
  });
});

// ─── Workflow runs ────────────────────────────────────────────────────────────
describe('GET /api/workflows/runs/:runId', () => {
  it('returns run details', async () => {
    const { status, body } = await req('GET', '/api/workflows/runs/run-001');
    expect(status).toBe(200);
    const b = body as Record<string, unknown>;
    expect((b.run as Record<string, unknown>).runId).toBe('run-001');
    expect((b.run as Record<string, unknown>).status).toBe('completed');
  });

  it('returns 404 for unknown run', async () => {
    const { workflowExecutor } = await import('../workflows/executor.js');
    vi.mocked(workflowExecutor.getRun).mockReturnValueOnce(undefined as never);
    const { status } = await req('GET', '/api/workflows/runs/non-existent');
    expect(status).toBe(404);
  });
});

// ─── Method not allowed ───────────────────────────────────────────────────────
describe('Method not allowed', () => {
  it('GET /api/templates/generate returns 404 or 405', async () => {
    const { status } = await req('GET', '/api/templates/generate');
    expect([404, 405]).toContain(status);
  });
});
