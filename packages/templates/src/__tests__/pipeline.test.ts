// packages/templates/src/__tests__/pipeline.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSpecFromEntities } from '../spec-engine/index.js';
import { loadTemplate } from '../loader/index.js';
import { composeBundle } from '../composer/composer.js';
import { resolveTemplate } from '../registry/index.js';
import { generateFullPrismaSchema, generateZodSchema, computeSlotValues } from '../loader/code-generator.js';
import { patchSlots, sha256 } from '../loader/ast-patcher.js';
import { evaluateCondition } from '../workflows/executor.js';
import type { EntityDef } from '../types/app-spec.js';

// ─── Fixtures ──────────────────────────────────────────────────────────────────
const customerEntity: EntityDef = {
  name: 'Customer',
  pluralName: 'Customers',
  tableName: 'customers',
  tenantScoped: true,
  timestamps: true,
  fields: [
    { name: 'name', type: 'string', label: 'Name', required: true },
    { name: 'email', type: 'email', label: 'Email', required: true, unique: true },
    { name: 'phone', type: 'string', label: 'Phone', required: false },
    { name: 'status', type: 'enum', label: 'Status', required: true, enumValues: ['active', 'inactive'] },
    { name: 'notes', type: 'text', label: 'Notes', required: false },
  ],
};

const orderEntity: EntityDef = {
  name: 'Order',
  pluralName: 'Orders',
  tableName: 'orders',
  tenantScoped: true,
  timestamps: true,
  fields: [
    { name: 'customerId', type: 'relation', label: 'Customer', required: true, relation: { targetEntity: 'Customer', type: 'many-to-many' } },
    { name: 'total', type: 'number', label: 'Total', required: true, validation: { min: 0 } },
    { name: 'status', type: 'enum', label: 'Status', required: true, enumValues: ['pending', 'processing', 'shipped', 'delivered'] },
  ],
};

// ─── Spec Engine tests ────────────────────────────────────────────────────────
describe('buildSpecFromEntities', () => {
  it('generates valid spec for single entity', () => {
    const spec = buildSpecFromEntities('tenant-123', 'Customer CRM', 'crud', [customerEntity]);
    expect(spec.tenantId).toBe('tenant-123');
    expect(spec.entities).toHaveLength(1);
    expect(spec.pages.length).toBeGreaterThanOrEqual(3); // list + detail + form
    expect(spec.routes.length).toBeGreaterThanOrEqual(5); // 5 REST routes
    expect(spec.permissions.roles).toHaveLength(3);
  });

  it('generates slug from name', () => {
    const spec = buildSpecFromEntities('t1', 'My Cool App!', 'crud', [customerEntity]);
    expect(spec.slug).toBe('my-cool-app');
  });

  it('generates correct route methods', () => {
    const spec = buildSpecFromEntities('t1', 'Test', 'crud', [customerEntity]);
    const methods = spec.routes.map((r) => r.method);
    expect(methods).toContain('GET');
    expect(methods).toContain('POST');
    expect(methods).toContain('PUT');
    expect(methods).toContain('DELETE');
  });

  it('generates RBAC permissions for all entities', () => {
    const spec = buildSpecFromEntities('t1', 'Test', 'crud', [customerEntity, orderEntity]);
    const entityNames = spec.permissions.entityPermissions.map((ep) => ep.entityName);
    expect(entityNames).toContain('Customer');
    expect(entityNames).toContain('Order');
  });
});

// ─── Registry tests ───────────────────────────────────────────────────────────
describe('resolveTemplate', () => {
  it('resolves crud template for crud apps', () => {
    const template = resolveTemplate('crud', 1);
    expect(template.id).toBe('crud-basic');
  });

  it('resolves dashboard template', () => {
    const template = resolveTemplate('dashboard', 2);
    expect(template.id).toBe('dashboard-analytics');
  });

  it('resolves workflow template', () => {
    const template = resolveTemplate('workflow', 1);
    expect(template.id).toBe('workflow-automation');
  });

  it('resolves admin-panel template', () => {
    const template = resolveTemplate('admin-panel', 5);
    expect(template.id).toBe('admin-panel-full');
  });

  it('throws for unknown appType', () => {
    expect(() => resolveTemplate('crud', 100)).toThrow(); // 100 entities > max
  });
});

// ─── Code Generator tests ─────────────────────────────────────────────────────
describe('generateFullPrismaSchema', () => {
  it('generates valid schema for customer entity', () => {
    const schema = generateFullPrismaSchema([customerEntity]);
    expect(schema).toContain('model Customer');
    expect(schema).toContain('tenantId');
    expect(schema).toContain('createdAt');
    expect(schema).toContain('updatedAt');
    expect(schema).toContain('email');
    expect(schema).toContain('@unique');
  });

  it('generates multi-entity schema', () => {
    const schema = generateFullPrismaSchema([customerEntity, orderEntity]);
    expect(schema).toContain('model Customer');
    expect(schema).toContain('model Order');
  });
});

describe('generateZodSchema', () => {
  it('generates zod schema with email validation', () => {
    const schema = generateZodSchema(customerEntity);
    expect(schema).toContain('z.string().email()');
    expect(schema).toContain("z.enum(['active', 'inactive'])");
  });

  it('exports correct TypeScript types', () => {
    const schema = generateZodSchema(customerEntity);
    expect(schema).toContain('export type CustomerInput');
    expect(schema).toContain('export type CustomerPartial');
  });
});

describe('computeSlotValues', () => {
  it('computes all required slots', () => {
    const slots = computeSlotValues(customerEntity);
    expect(slots['ENTITY_NAME']).toBe('Customer');
    expect(slots['ENTITY_NAME_PLURAL']).toBe('Customers');
    expect(slots['TABLE_NAME']).toBe('customers');
    expect(slots['ROUTE_PATH']).toBe('/api/customers');
    expect(slots['FIELD_LIST']).toContain('name');
    expect(slots['FIELD_LIST']).toContain('email');
  });
});

// ─── AST Patcher tests ────────────────────────────────────────────────────────
describe('patchSlots', () => {
  it('replaces inline slots', () => {
    const result = patchSlots('Hello {{ENTITY_NAME}}!', { ENTITY_NAME: 'Customer' });
    expect(result).toBe('Hello Customer!');
  });

  it('replaces multiple slots', () => {
    const result = patchSlots('{{ENTITY_NAME}} at /api/{{TABLE_NAME}}', {
      ENTITY_NAME: 'Customer',
      TABLE_NAME: 'customers',
    });
    expect(result).toBe('Customer at /api/customers');
  });

  it('leaves unresolved slots unchanged', () => {
    const result = patchSlots('Hello {{MISSING}}!', {});
    expect(result).toBe('Hello {{MISSING}}!');
  });

  it('replaces block slots', () => {
    const template = 'before\n{{BLOCK:START}}\nold content\n{{BLOCK:END}}\nafter';
    const result = patchSlots(template, { BLOCK: 'new content' });
    expect(result).toContain('new content');
    expect(result).not.toContain('old content');
  });
});

describe('sha256', () => {
  it('produces consistent hash', () => {
    const h1 = sha256('hello');
    const h2 = sha256('hello');
    expect(h1).toBe(h2);
  });

  it('produces different hashes for different inputs', () => {
    expect(sha256('hello')).not.toBe(sha256('world'));
  });
});

// ─── Template Loader tests ────────────────────────────────────────────────────
describe('loadTemplate', () => {
  it('loads crud template and produces render manifest', async () => {
    const spec = buildSpecFromEntities('t1', 'Test CRM', 'crud', [customerEntity]);
    const manifest = await loadTemplate(spec);

    expect(manifest.appId).toBe(spec.id);
    expect(manifest.tenantId).toBe('t1');
    expect(manifest.files.length).toBeGreaterThan(0);
    expect(manifest.prismaSchema).toContain('model Customer');
    expect(manifest.files.some((f) => f.relativePath === 'prisma/schema.prisma')).toBe(true);
    expect(manifest.files.some((f) => f.relativePath === 'lib/db/tenant.ts')).toBe(true);
    expect(manifest.files.some((f) => f.relativePath === 'middleware.ts')).toBe(true);
  });

  it('increments version on re-load', async () => {
    const spec = buildSpecFromEntities('t1', 'Test', 'crud', [customerEntity]);
    const manifest1 = await loadTemplate(spec);
    const manifest2 = await loadTemplate(spec, manifest1);
    expect(manifest2.version).toBeGreaterThan(manifest1.version);
  });

  it('preserves locked files', async () => {
    const spec = buildSpecFromEntities('t1', 'Test', 'crud', [customerEntity]);
    const manifest1 = await loadTemplate(spec);

    // Lock the prisma schema
    const withLocked = {
      ...manifest1,
      files: manifest1.files.map((f) =>
        f.relativePath === 'prisma/schema.prisma'
          ? { ...f, lockedFromRegen: true, content: 'CUSTOM CONTENT' }
          : f
      ),
    };

    const manifest2 = await loadTemplate(spec, withLocked);
    const prismaFile = manifest2.files.find((f) => f.relativePath === 'prisma/schema.prisma');
    expect(prismaFile?.content).toBe('CUSTOM CONTENT');
  });
});

// ─── Composer tests ───────────────────────────────────────────────────────────
describe('composeBundle', () => {
  it('produces bundle with all required files', async () => {
    const spec = buildSpecFromEntities('t1', 'Test CRM', 'crud', [customerEntity]);
    const manifest = await loadTemplate(spec);
    const bundle = composeBundle(spec, manifest);

    const paths = bundle.files.map((f) => f.path);
    expect(paths).toContain('next.config.js');
    expect(paths).toContain('package.json');
    expect(paths).toContain('.env.example');
    expect(paths).toContain('app/layout.tsx');
    expect(paths).toContain('lib/nav.ts');
    expect(paths).toContain('worker/index.ts');
  });

  it('includes correct app name in package.json', async () => {
    const spec = buildSpecFromEntities('t1', 'My CRM', 'crud', [customerEntity]);
    const manifest = await loadTemplate(spec);
    const bundle = composeBundle(spec, manifest);
    const pkg = bundle.files.find((f) => f.path === 'package.json');
    expect(pkg?.content).toContain(spec.slug);
  });

  it('produces stable bundle hash for same input', async () => {
    const spec = buildSpecFromEntities('t1', 'Test', 'crud', [customerEntity]);
    const m1 = await loadTemplate(spec);
    const m2 = await loadTemplate(spec);
    const b1 = composeBundle(spec, m1);
    const b2 = composeBundle(spec, m2);
    // Same content should produce same hash
    expect(b1.bundleHash).toBe(b2.bundleHash);
  });
});

// ─── Workflow tests ───────────────────────────────────────────────────────────
describe('evaluateCondition', () => {
  it('evaluates simple equality', () => {
    expect(evaluateCondition("'active' === 'active'", {})).toBe(true);
    expect(evaluateCondition("'active' === 'inactive'", {})).toBe(false);
  });

  it('handles invalid expressions safely', () => {
    expect(evaluateCondition('this is not valid!!!', {})).toBe(false);
  });
});
