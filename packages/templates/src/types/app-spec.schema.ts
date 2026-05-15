// packages/templates/src/types/app-spec.schema.ts
// ─── Zod validation schemas — validates AI-generated specs before pipeline entry ───

import { z } from 'zod';

export const FieldTypeSchema = z.enum([
  'string', 'text', 'number', 'boolean', 'date', 'datetime',
  'email', 'url', 'enum', 'relation', 'file', 'json',
]);

export const FieldDefSchema = z.object({
  name: z.string().min(1).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Must be valid identifier'),
  type: FieldTypeSchema,
  label: z.string().min(1),
  required: z.boolean(),
  unique: z.boolean().optional(),
  default: z.unknown().optional(),
  enumValues: z.array(z.string()).optional(),
  relation: z.object({
    targetEntity: z.string(),
    type: z.enum(['one-to-one', 'one-to-many', 'many-to-many']),
    foreignKey: z.string().optional(),
  }).optional(),
  validation: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    pattern: z.string().optional(),
    message: z.string().optional(),
  }).optional(),
  ui: z.object({
    placeholder: z.string().optional(),
    helpText: z.string().optional(),
    hidden: z.boolean().optional(),
    readOnly: z.boolean().optional(),
    order: z.number().optional(),
  }).optional(),
});

export const EntityDefSchema = z.object({
  name: z.string().min(1).regex(/^[A-Z][a-zA-Z0-9]*$/, 'Must be PascalCase'),
  pluralName: z.string().min(1),
  tableName: z.string().min(1).regex(/^[a-z][a-z0-9_]*$/, 'Must be snake_case'),
  fields: z.array(FieldDefSchema).min(1),
  softDelete: z.boolean().optional(),
  timestamps: z.boolean().optional(),
  tenantScoped: z.boolean().optional(),
});

export const PageDefSchema = z.object({
  id: z.string().uuid(),
  path: z.string().startsWith('/'),
  component: z.string().min(1),
  pageType: z.enum(['list', 'detail', 'form', 'dashboard', 'custom']),
  entityName: z.string().optional(),
  title: z.string().min(1),
  icon: z.string().optional(),
  permissions: z.array(z.string()).optional(),
  slots: z.record(z.unknown()).optional(),
});

export const RouteDefSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  path: z.string().startsWith('/'),
  handler: z.string().min(1),
  entityName: z.string().optional(),
  middlewares: z.array(z.string()).optional(),
  rateLimit: z.object({
    requests: z.number().positive(),
    windowMs: z.number().positive(),
  }).optional(),
});

export const RBACPolicySchema = z.object({
  roles: z.array(z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    inherits: z.array(z.string()).optional(),
  })),
  entityPermissions: z.array(z.object({
    entityName: z.string().min(1),
    role: z.string().min(1),
    actions: z.array(z.enum(['create', 'read', 'update', 'delete', 'list'])),
  })),
});

export const AppSpecSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1),
  appType: z.enum(['crud', 'dashboard', 'workflow', 'admin-panel']),
  name: z.string().min(1).max(100),
  slug: z.string().regex(/^[a-z0-9-]+$/, 'Must be URL-safe slug'),
  description: z.string().optional(),
  entities: z.array(EntityDefSchema).min(1),
  pages: z.array(PageDefSchema).min(1),
  routes: z.array(RouteDefSchema).min(1),
  permissions: RBACPolicySchema,
  workflows: z.array(z.any()).optional(),
  integrations: z.array(z.any()).optional(),
  theme: z.object({
    primaryColor: z.string().optional(),
    fontFamily: z.string().optional(),
    darkMode: z.boolean().optional(),
  }).optional(),
  meta: z.object({
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    version: z.number().int().positive(),
    generatedBy: z.enum(['ai', 'user', 'template']),
    templateId: z.string().optional(),
  }),
});

export type AppSpecInput = z.input<typeof AppSpecSchema>;
export type AppSpecOutput = z.output<typeof AppSpecSchema>;
