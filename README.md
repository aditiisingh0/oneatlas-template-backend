# @oneatlas/templates — Template Backend

> T4 Templates & App Engine Backend  
> Spec Engine → Registry → Loader → Composer → Preview → Deployment

---

## Architecture

```
User Prompt / Entity List
         │
         ▼
┌─────────────────────┐
│    Spec Engine       │  prompt → AppSpec (via Claude Haiku / Sonnet)
│  spec-engine/        │  validates with Zod before entering pipeline
└────────┬────────────┘
         │ AppSpec
         ▼
┌─────────────────────┐
│  Template Registry   │  lookup: appType + entityCount → TemplateManifest
│  registry/           │  pure static catalog, no AI calls
└────────┬────────────┘
         │ TemplateManifest + AppSpec
         ▼
┌─────────────────────┐
│  Template Loader     │  hydrates slot values, patches ASTs
│  loader/             │  preserves user-locked files (no overwrite)
└────────┬────────────┘
         │ RenderManifest (GeneratedFile[])
         ▼
┌─────────────────────┐
│  Composer            │  assembles bundle: pages + API + prisma + CF worker
│  composer/           │  produces BundleResult
└────────┬────────────┘
         │ BundleResult
    ┌────┴────┐
    ▼         ▼
Preview    Deploy
(ephemeral) (CF Pages)
```

---

## Module Map

| Module | File | Responsibility |
|--------|------|----------------|
| Types | `src/types/` | AppSpec, TemplateManifest, RenderManifest, Zod schemas |
| Spec Engine | `src/spec-engine/index.ts` | prompt → AppSpec (AI + manual) |
| Registry | `src/registry/index.ts` | Template catalog lookup |
| Code Generator | `src/loader/code-generator.ts` | Entity → Prisma/Zod/TSX code strings |
| AST Patcher | `src/loader/ast-patcher.ts` | Slot injection, smart-patch, diff |
| Loader | `src/loader/index.ts` | Template load orchestrator |
| Composer | `src/composer/composer.ts` | Bundle assembly |
| Preview | `src/preview/index.ts` | Ephemeral sandbox manager |
| Deployment | `src/deployment/index.ts` | CF Pages deploy + versioning |
| Workflows | `src/workflows/executor.ts` | Step chain executor |
| Pipeline | `src/pipeline.ts` | Main entrypoints |

---

## Usage

### 1. Generate from AI prompt

```typescript
import { runGenerationPipeline } from '@oneatlas/templates';

const result = await runGenerationPipeline({
  userPrompt: 'A CRM app for managing customers and sales orders',
  tenantId: 'org_abc123',
});

console.log(result.spec.entities);     // ['Customer', 'Order']
console.log(result.fileCount);          // 18
console.log(result.routes);             // ['GET /api/customers', ...]
```

### 2. Generate from entities (no AI)

```typescript
import { runGenerationPipeline } from '@oneatlas/templates';
import type { EntityDef } from '@oneatlas/templates';

const entities: EntityDef[] = [
  {
    name: 'Customer',
    pluralName: 'Customers',
    tableName: 'customers',
    tenantScoped: true,
    timestamps: true,
    fields: [
      { name: 'name', type: 'string', label: 'Name', required: true },
      { name: 'email', type: 'email', label: 'Email', required: true, unique: true },
    ],
  },
];

const result = await runGenerationPipeline({
  tenantId: 'org_abc123',
  appName: 'Customer CRM',
  appType: 'crud',
  entities,
});
```

### 3. Preview (ephemeral sandbox)

```typescript
import { runPreviewPipeline } from '@oneatlas/templates';

const result = await runPreviewPipeline({
  userPrompt: 'Invoice management system',
  tenantId: 'org_abc123',
  ttlSeconds: 3600,
});

console.log(result.preview?.previewUrl);  // https://preview-abc123.preview.oneatlas.app
```

### 4. Deploy to Cloudflare Pages

```typescript
import { runDeployPipeline } from '@oneatlas/templates';

const { deployment } = await runDeployPipeline({
  userPrompt: 'Inventory management',
  tenantId: 'org_abc123',
  slug: 'my-inventory-app',
  cfAccountId: process.env.CF_ACCOUNT_ID!,
  cfApiToken: process.env.CF_API_TOKEN!,
});

console.log(deployment.url);   // https://my-inventory-app.oneatlas.app
console.log(deployment.status); // 'queued' → 'building' → 'live'
```

### 5. Incremental update (refine existing app)

```typescript
import { runIncrementalUpdate } from '@oneatlas/templates';

const { result, diff } = await runIncrementalUpdate(
  existingSpec,
  existingManifestJson,
  'Add a Products entity with name, price, and stock fields'
);

console.log(diff.addedEntities);   // ['Product']
console.log(diff.addedRoutes);     // ['GET /api/products', 'POST /api/products', ...]
```

---

## Template Registry

Templates are in `src/registry/templates/`:

| ID | AppType | Description |
|----|---------|-------------|
| `crud-basic` | crud | List + Detail + Form pages per entity |
| `dashboard-analytics` | dashboard | KPI cards + charts + data tables |
| `workflow-automation` | workflow | Trigger → action chains |
| `admin-panel-full` | admin-panel | Full admin with RBAC + audit log |

### Adding a custom template

```typescript
import { registerTemplate } from '@oneatlas/templates';

registerTemplate({
  id: 'my-custom-template',
  name: 'My Template',
  appType: 'crud',
  version: '1.0.0',
  // ... full TemplateManifest
});
```

---

## Key Design Decisions

**Slot-based patching, not full regen**  
Files are generated once via slot injection (`{{SLOT_ID}}`). On subsequent spec changes, only changed slots are re-patched. User-modified files are `lockedFromRegen: true` and never overwritten.

**Cheap model first, expensive model on retry**  
`generateAppSpec` uses Claude Haiku by default. If Zod validation fails, it retries with Claude Sonnet. This keeps costs low for well-formed prompts.

**Schema-per-tenant isolation**  
The generated `lib/db/tenant.ts` sets `search_path = tenant_{tenantId}` on every Prisma query, providing full row-level isolation without separate DB instances.

**Stateless pipeline, serializable manifests**  
`RenderManifest` is fully serializable to JSON. Store it in Neon between runs and pass it back as `existingManifestJson` for incremental updates.

---

## Environment Variables (generated app)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | Neon PostgreSQL connection string |
| `CLERK_SECRET_KEY` | ✅ | Clerk backend auth key |
| `CLERK_PUBLISHABLE_KEY` | ✅ | Clerk frontend key |
| `ANTHROPIC_API_KEY` | For workflow AI steps | Claude API key |
| `UPSTASH_REDIS_URL` | For workflow/preview | Upstash Redis URL |
| `UPSTASH_REDIS_TOKEN` | For workflow/preview | Upstash Redis token |
