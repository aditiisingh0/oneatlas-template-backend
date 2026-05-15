// packages/templates/src/preview/worker.ts
// Cloudflare Worker — serves all *.preview.oneatlas.app requests.
// Deployed once as a wildcard worker. Reads previewId from subdomain,
// loads session from Redis, then routes to HTML renderer or mock API.

import { RedisPreviewStore } from './redis-store.js';
import { renderPreviewPage } from './html-renderer.js';
import type { PreviewSession } from './index.js';

export interface WorkerEnv {
  UPSTASH_REDIS_URL: string;
  UPSTASH_REDIS_TOKEN: string;
  BASE_PREVIEW_DOMAIN: string; // e.g. preview.oneatlas.app
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);

    // Extract previewId from subdomain: preview-abc123.preview.oneatlas.app
    const subdomain = url.hostname.split('.')[0] ?? '';
    if (!subdomain.startsWith('preview-')) {
      return errorResponse(400, 'Invalid preview URL');
    }
    const previewId = subdomain;

    // Load session from Redis
    const store = new RedisPreviewStore({
      url: env.UPSTASH_REDIS_URL,
      token: env.UPSTASH_REDIS_TOKEN,
    });

    const session = await store.get(previewId);
    if (!session) {
      return expiredResponse(previewId);
    }

    // Route: mock API calls (from page JS or curl)
    if (url.pathname.startsWith('/api/')) {
      return handleMockApiRequest(request, url, session, store);
    }

    // Route: HTML page
    const basePreviewUrl = `https://${previewId}.${env.BASE_PREVIEW_DOMAIN}`;
    const rendered = renderPreviewPage(session, url.pathname, basePreviewUrl);

    return new Response(rendered.html, {
      status: rendered.statusCode,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Preview-Id': previewId,
        'X-Preview-Expires': session.expiresAt,
      },
    });
  },
};

// Handle mock API requests
async function handleMockApiRequest(
  request: Request,
  url: URL,
  session: PreviewSession,
  store: RedisPreviewStore
): Promise<Response> {
  const method = request.method;
  let body: unknown = undefined;

  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    try {
      body = await request.json();
    } catch {
      body = undefined;
    }
  }

  const result = await handleMockRequest(session, store, method, url.pathname, body);

  return new Response(JSON.stringify(result.data), {
    status: result.status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

// Core mock request handler — reads/writes mockState in Redis
async function handleMockRequest(
  session: PreviewSession,
  store: RedisPreviewStore,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; data: unknown }> {
  // GET /api/{entity}
  const listMatch = path.match(/^\/api\/([a-z_]+)$/);
  if (listMatch && method === 'GET') {
    const key = listMatch[1]!;
    const items = session.mockState[key] ?? [];
    return { status: 200, data: { data: items, meta: { total: items.length } } };
  }

  // GET /api/{entity}/{id}
  const detailMatch = path.match(/^\/api\/([a-z_]+)\/([^/]+)$/);
  if (detailMatch && method === 'GET') {
    const [, key, id] = detailMatch;
    const items = (session.mockState[key!] ?? []) as Record<string, unknown>[];
    const item = items.find((i) => i['id'] === id);
    if (!item) return { status: 404, data: { error: 'Not found' } };
    return { status: 200, data: { data: item } };
  }

  // POST /api/{entity} — create a new mock row and persist back to Redis
  if (listMatch && method === 'POST') {
    const key = listMatch[1]!;
    const newItem = {
      id: crypto.randomUUID(),
      ...(body as Record<string, unknown>),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updated: PreviewSession = {
      ...session,
      mockState: {
        ...session.mockState,
        [key]: [...(session.mockState[key] ?? []), newItem],
      },
    };

    const ttlRemaining = Math.max(
      1,
      Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000)
    );
    await store.set(session.previewId, updated, ttlRemaining);

    return { status: 201, data: { data: newItem } };
  }

  // DELETE /api/{entity}/{id}
  if (detailMatch && method === 'DELETE') {
    const [, key, id] = detailMatch;
    const items = (session.mockState[key!] ?? []) as Record<string, unknown>[];
    const filtered = items.filter((i) => i['id'] !== id);

    const updated: PreviewSession = {
      ...session,
      mockState: { ...session.mockState, [key!]: filtered },
    };

    const ttlRemaining = Math.max(
      1,
      Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000)
    );
    await store.set(session.previewId, updated, ttlRemaining);

    return { status: 200, data: { data: { deleted: true, id } } };
  }

  return { status: 404, data: { error: 'Route not found' } };
}

// HTML response for expired sessions
function expiredResponse(previewId: string): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Preview Expired — OneAtlas</title>
  <style>
    body { font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #f5f5f5; }
    .card { background: #fff; border: 1px solid #e4e4e7; border-radius: 12px; padding: 40px; text-align: center; max-width: 400px; }
    h1 { font-size: 20px; font-weight: 700; color: #18181b; margin-bottom: 8px; }
    p { font-size: 14px; color: #71717a; }
    code { display: block; margin-top: 16px; font-size: 12px; font-family: monospace; color: #a1a1aa; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Preview Expired</h1>
    <p>This preview session has expired or does not exist.</p>
    <code>${previewId}</code>
  </div>
</body>
</html>`;

  return new Response(html, {
    status: 410,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function errorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
