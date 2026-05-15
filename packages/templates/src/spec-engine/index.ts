// packages/templates/src/spec-engine/index.ts
// ─── Spec Engine — converts AI JSON output into a validated, normalized AppSpec ───

import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuid } from 'uuid';
import { AppSpecSchema } from '../types/app-spec.schema.js';
import type { AppSpec, EntityDef, PageDef, RouteDef } from '../types/app-spec.js';

const client = new Anthropic();

// ─── Prompt builder ───────────────────────────────────────────────────────────
function buildSpecPrompt(userPrompt: string, tenantId: string): string {
  const now = new Date().toISOString();
  return `You are a backend spec generator for an internal tools platform (like Retool / Base44).

Given the user's description, produce a valid JSON AppSpec. Return ONLY raw JSON — no markdown, no explanation.

User description: "${userPrompt}"

Requirements:
- tenantId: "${tenantId}"
- id: "${uuid()}"
- appType: one of "crud" | "dashboard" | "workflow" | "admin-panel"
- name: short readable name
- slug: url-safe lowercase slug
- entities: array of EntityDef (min 1). Each entity needs id, name, createdAt, updatedAt fields minimum.
- pages: one list page + one detail page + one form page per entity minimum
- routes: REST routes for each entity (GET list, GET one, POST, PUT, DELETE)
- permissions: basic roles (admin, editor, viewer) with entityPermissions for each entity
- meta.createdAt: "${now}"
- meta.updatedAt: "${now}"
- meta.version: 1
- meta.generatedBy: "ai"

Field types allowed: string | text | number | boolean | date | datetime | email | url | enum | relation | file | json
Entity names must be PascalCase. Table names must be snake_case.

Return only the JSON object.`;
}

// ─── Core generation function ─────────────────────────────────────────────────
export async function generateAppSpec(
  userPrompt: string,
  tenantId: string,
  options?: {
    model?: 'claude-haiku-4-5-20251001' | 'claude-sonnet-4-6';
    maxRetries?: number;
  }
): Promise<AppSpec> {
  const model = options?.model ?? 'claude-haiku-4-5-20251001'; // cheap by default
  const maxRetries = options?.maxRetries ?? 2;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const message = await client.messages.create({
        model,
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: buildSpecPrompt(userPrompt, tenantId),
          },
        ],
      });

      const raw = message.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as { type: 'text'; text: string }).text)
        .join('');

      // Strip any accidental markdown fences
      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned) as unknown;

      const result = AppSpecSchema.safeParse(parsed);
      if (!result.success) {
        // On validation failure with retries remaining, escalate to Sonnet
        if (attempt < maxRetries) {
          options = { ...options, model: 'claude-sonnet-4-6' };
          lastError = new Error(`Validation failed: ${result.error.message}`);
          continue;
        }
        throw new Error(`AppSpec validation failed after ${maxRetries} retries: ${result.error.message}`);
      }

      return result.data as AppSpec;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) continue;
    }
  }

  throw lastError ?? new Error('Unknown spec generation error');
}

// ─── Refine existing spec ─────────────────────────────────────────────────────
export async function refineAppSpec(
  existingSpec: AppSpec,
  refinementPrompt: string
): Promise<AppSpec> {
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: `You are refining an existing AppSpec based on new instructions.

Current spec:
${JSON.stringify(existingSpec, null, 2)}

Refinement instruction: "${refinementPrompt}"

Return the COMPLETE updated AppSpec as raw JSON only. Preserve the id, tenantId, and createdAt. Increment meta.version by 1. Update meta.updatedAt to "${new Date().toISOString()}".`,
      },
    ],
  });

  const raw = message.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('');

  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const parsed = JSON.parse(cleaned) as unknown;

  const result = AppSpecSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Refined spec validation failed: ${result.error.message}`);
  }

  return result.data as AppSpec;
}

// ─── Spec diff utility ────────────────────────────────────────────────────────
export function diffSpecs(
  prev: AppSpec,
  next: AppSpec
): {
  addedEntities: string[];
  removedEntities: string[];
  modifiedEntities: string[];
  addedPages: string[];
  removedPages: string[];
  addedRoutes: string[];
  removedRoutes: string[];
} {
  const prevEntityNames = new Set(prev.entities.map((e) => e.name));
  const nextEntityNames = new Set(next.entities.map((e) => e.name));

  const addedEntities = [...nextEntityNames].filter((n) => !prevEntityNames.has(n));
  const removedEntities = [...prevEntityNames].filter((n) => !nextEntityNames.has(n));
  const modifiedEntities = [...nextEntityNames].filter((n) => {
    if (!prevEntityNames.has(n)) return false;
    const prevE = prev.entities.find((e) => e.name === n);
    const nextE = next.entities.find((e) => e.name === n);
    return JSON.stringify(prevE) !== JSON.stringify(nextE);
  });

  const prevPagePaths = new Set(prev.pages.map((p) => p.path));
  const nextPagePaths = new Set(next.pages.map((p) => p.path));
  const addedPages = [...nextPagePaths].filter((p) => !prevPagePaths.has(p));
  const removedPages = [...prevPagePaths].filter((p) => !nextPagePaths.has(p));

  const prevRouteSigs = new Set(prev.routes.map((r) => `${r.method}:${r.path}`));
  const nextRouteSigs = new Set(next.routes.map((r) => `${r.method}:${r.path}`));
  const addedRoutes = [...nextRouteSigs].filter((r) => !prevRouteSigs.has(r));
  const removedRoutes = [...prevRouteSigs].filter((r) => !nextRouteSigs.has(r));

  return { addedEntities, removedEntities, modifiedEntities, addedPages, removedPages, addedRoutes, removedRoutes };
}

// ─── Build spec manually (without AI) ────────────────────────────────────────
export function buildSpecFromEntities(
  tenantId: string,
  appName: string,
  appType: AppSpec['appType'],
  entities: EntityDef[]
): AppSpec {
  const now = new Date().toISOString();
  const slug = appName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  const pages: PageDef[] = entities.flatMap((entity) => [
    {
      id: uuid(),
      path: `/${entity.tableName}`,
      component: `${entity.name}List`,
      pageType: 'list' as const,
      entityName: entity.name,
      title: entity.pluralName,
    },
    {
      id: uuid(),
      path: `/${entity.tableName}/:id`,
      component: `${entity.name}Detail`,
      pageType: 'detail' as const,
      entityName: entity.name,
      title: entity.name,
    },
    {
      id: uuid(),
      path: `/${entity.tableName}/new`,
      component: `${entity.name}Form`,
      pageType: 'form' as const,
      entityName: entity.name,
      title: `New ${entity.name}`,
    },
  ]);

  const routes: RouteDef[] = entities.flatMap((entity) => [
    { method: 'GET' as const, path: `/api/${entity.tableName}`, handler: `list${entity.pluralName}`, entityName: entity.name, middlewares: ['auth'] },
    { method: 'GET' as const, path: `/api/${entity.tableName}/:id`, handler: `get${entity.name}`, entityName: entity.name, middlewares: ['auth'] },
    { method: 'POST' as const, path: `/api/${entity.tableName}`, handler: `create${entity.name}`, entityName: entity.name, middlewares: ['auth', 'rbac:editor'] },
    { method: 'PUT' as const, path: `/api/${entity.tableName}/:id`, handler: `update${entity.name}`, entityName: entity.name, middlewares: ['auth', 'rbac:editor'] },
    { method: 'DELETE' as const, path: `/api/${entity.tableName}/:id`, handler: `delete${entity.name}`, entityName: entity.name, middlewares: ['auth', 'rbac:admin'] },
  ]);

  return {
    id: uuid(),
    tenantId,
    appType,
    name: appName,
    slug,
    entities,
    pages,
    routes,
    permissions: {
      roles: [
        { name: 'admin', description: 'Full access' },
        { name: 'editor', description: 'Create and edit' },
        { name: 'viewer', description: 'Read only' },
      ],
      entityPermissions: entities.flatMap((entity) => [
        { entityName: entity.name, role: 'admin', actions: ['create', 'read', 'update', 'delete', 'list'] },
        { entityName: entity.name, role: 'editor', actions: ['create', 'read', 'update', 'list'] },
        { entityName: entity.name, role: 'viewer', actions: ['read', 'list'] },
      ]),
    },
    meta: {
      createdAt: now,
      updatedAt: now,
      version: 1,
      generatedBy: 'user',
    },
  };
}
