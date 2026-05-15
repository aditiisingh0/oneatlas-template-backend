// src/types/app-spec.schema.ts
import { z } from "zod";
var FieldTypeSchema = z.enum([
  "string",
  "text",
  "number",
  "boolean",
  "date",
  "datetime",
  "email",
  "url",
  "enum",
  "relation",
  "file",
  "json"
]);
var FieldDefSchema = z.object({
  name: z.string().min(1).regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, "Must be valid identifier"),
  type: FieldTypeSchema,
  label: z.string().min(1),
  required: z.boolean(),
  unique: z.boolean().optional(),
  default: z.unknown().optional(),
  enumValues: z.array(z.string()).optional(),
  relation: z.object({
    targetEntity: z.string(),
    type: z.enum(["one-to-one", "one-to-many", "many-to-many"]),
    foreignKey: z.string().optional()
  }).optional(),
  validation: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    pattern: z.string().optional(),
    message: z.string().optional()
  }).optional(),
  ui: z.object({
    placeholder: z.string().optional(),
    helpText: z.string().optional(),
    hidden: z.boolean().optional(),
    readOnly: z.boolean().optional(),
    order: z.number().optional()
  }).optional()
});
var EntityDefSchema = z.object({
  name: z.string().min(1).regex(/^[A-Z][a-zA-Z0-9]*$/, "Must be PascalCase"),
  pluralName: z.string().min(1),
  tableName: z.string().min(1).regex(/^[a-z][a-z0-9_]*$/, "Must be snake_case"),
  fields: z.array(FieldDefSchema).min(1),
  softDelete: z.boolean().optional(),
  timestamps: z.boolean().optional(),
  tenantScoped: z.boolean().optional()
});
var PageDefSchema = z.object({
  id: z.string().uuid(),
  path: z.string().startsWith("/"),
  component: z.string().min(1),
  pageType: z.enum(["list", "detail", "form", "dashboard", "custom"]),
  entityName: z.string().optional(),
  title: z.string().min(1),
  icon: z.string().optional(),
  permissions: z.array(z.string()).optional(),
  slots: z.record(z.unknown()).optional()
});
var RouteDefSchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  path: z.string().startsWith("/"),
  handler: z.string().min(1),
  entityName: z.string().optional(),
  middlewares: z.array(z.string()).optional(),
  rateLimit: z.object({
    requests: z.number().positive(),
    windowMs: z.number().positive()
  }).optional()
});
var RBACPolicySchema = z.object({
  roles: z.array(z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    inherits: z.array(z.string()).optional()
  })),
  entityPermissions: z.array(z.object({
    entityName: z.string().min(1),
    role: z.string().min(1),
    actions: z.array(z.enum(["create", "read", "update", "delete", "list"]))
  }))
});
var AppSpecSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().min(1),
  appType: z.enum(["crud", "dashboard", "workflow", "admin-panel"]),
  name: z.string().min(1).max(100),
  slug: z.string().regex(/^[a-z0-9-]+$/, "Must be URL-safe slug"),
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
    darkMode: z.boolean().optional()
  }).optional(),
  meta: z.object({
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    version: z.number().int().positive(),
    generatedBy: z.enum(["ai", "user", "template"]),
    templateId: z.string().optional()
  })
});

// src/spec-engine/index.ts
import Anthropic from "@anthropic-ai/sdk";
import { v4 as uuid } from "uuid";
var client = new Anthropic();
function buildSpecPrompt(userPrompt, tenantId) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return `You are a backend spec generator for an internal tools platform (like Retool / Base44).

Given the user's description, produce a valid JSON AppSpec. Return ONLY raw JSON \u2014 no markdown, no explanation.

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
async function generateAppSpec(userPrompt, tenantId, options) {
  const model = options?.model ?? "claude-haiku-4-5-20251001";
  const maxRetries = options?.maxRetries ?? 2;
  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const message = await client.messages.create({
        model,
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: buildSpecPrompt(userPrompt, tenantId)
          }
        ]
      });
      const raw = message.content.filter((b) => b.type === "text").map((b) => b.text).join("");
      const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const parsed = JSON.parse(cleaned);
      const result = AppSpecSchema.safeParse(parsed);
      if (!result.success) {
        if (attempt < maxRetries) {
          options = { ...options, model: "claude-sonnet-4-6" };
          lastError = new Error(`Validation failed: ${result.error.message}`);
          continue;
        }
        throw new Error(`AppSpec validation failed after ${maxRetries} retries: ${result.error.message}`);
      }
      return result.data;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) continue;
    }
  }
  throw lastError ?? new Error("Unknown spec generation error");
}
async function refineAppSpec(existingSpec, refinementPrompt) {
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `You are refining an existing AppSpec based on new instructions.

Current spec:
${JSON.stringify(existingSpec, null, 2)}

Refinement instruction: "${refinementPrompt}"

Return the COMPLETE updated AppSpec as raw JSON only. Preserve the id, tenantId, and createdAt. Increment meta.version by 1. Update meta.updatedAt to "${(/* @__PURE__ */ new Date()).toISOString()}".`
      }
    ]
  });
  const raw = message.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const parsed = JSON.parse(cleaned);
  const result = AppSpecSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Refined spec validation failed: ${result.error.message}`);
  }
  return result.data;
}
function diffSpecs(prev, next) {
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
function buildSpecFromEntities(tenantId, appName, appType, entities) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const slug = appName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const pages = entities.flatMap((entity) => [
    {
      id: uuid(),
      path: `/${entity.tableName}`,
      component: `${entity.name}List`,
      pageType: "list",
      entityName: entity.name,
      title: entity.pluralName
    },
    {
      id: uuid(),
      path: `/${entity.tableName}/:id`,
      component: `${entity.name}Detail`,
      pageType: "detail",
      entityName: entity.name,
      title: entity.name
    },
    {
      id: uuid(),
      path: `/${entity.tableName}/new`,
      component: `${entity.name}Form`,
      pageType: "form",
      entityName: entity.name,
      title: `New ${entity.name}`
    }
  ]);
  const routes = entities.flatMap((entity) => [
    { method: "GET", path: `/api/${entity.tableName}`, handler: `list${entity.pluralName}`, entityName: entity.name, middlewares: ["auth"] },
    { method: "GET", path: `/api/${entity.tableName}/:id`, handler: `get${entity.name}`, entityName: entity.name, middlewares: ["auth"] },
    { method: "POST", path: `/api/${entity.tableName}`, handler: `create${entity.name}`, entityName: entity.name, middlewares: ["auth", "rbac:editor"] },
    { method: "PUT", path: `/api/${entity.tableName}/:id`, handler: `update${entity.name}`, entityName: entity.name, middlewares: ["auth", "rbac:editor"] },
    { method: "DELETE", path: `/api/${entity.tableName}/:id`, handler: `delete${entity.name}`, entityName: entity.name, middlewares: ["auth", "rbac:admin"] }
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
        { name: "admin", description: "Full access" },
        { name: "editor", description: "Create and edit" },
        { name: "viewer", description: "Read only" }
      ],
      entityPermissions: entities.flatMap((entity) => [
        { entityName: entity.name, role: "admin", actions: ["create", "read", "update", "delete", "list"] },
        { entityName: entity.name, role: "editor", actions: ["create", "read", "update", "list"] },
        { entityName: entity.name, role: "viewer", actions: ["read", "list"] }
      ])
    },
    meta: {
      createdAt: now,
      updatedAt: now,
      version: 1,
      generatedBy: "user"
    }
  };
}

// src/registry/templates/crud/manifest.ts
var crudTemplate = {
  id: "crud-basic",
  name: "Basic CRUD",
  description: "A fully functional CRUD app with list, detail, and form pages for each entity.",
  appType: "crud",
  version: "1.0.0",
  supportedFieldTypes: ["string", "text", "number", "boolean", "date", "datetime", "email", "url", "enum", "relation", "file"],
  requiredEntityCount: { min: 1, max: 20 },
  tags: ["crud", "internal-tool", "data-management"],
  previewImageUrl: "/previews/crud-basic.png",
  envVars: ["DATABASE_URL", "CLERK_SECRET_KEY", "CLERK_PUBLISHABLE_KEY"],
  dependencies: [
    "@prisma/client",
    "next",
    "react",
    "react-dom",
    "@clerk/nextjs",
    "zod",
    "react-hook-form",
    "@hookform/resolvers"
  ],
  devDependencies: ["prisma", "typescript", "@types/react", "@types/node"],
  slots: [
    { id: "ENTITY_NAME", description: "PascalCase entity name", required: true, accepts: ["entity_name"] },
    { id: "ENTITY_NAME_PLURAL", description: "Plural entity name", required: true, accepts: ["entity_name"] },
    { id: "TABLE_NAME", description: "snake_case DB table name", required: true, accepts: ["entity_name"] },
    { id: "FIELD_LIST", description: "Comma-separated field names", required: true, accepts: ["field_list"] },
    { id: "PRISMA_FIELDS", description: "Prisma schema field definitions", required: true, accepts: ["field_list"] },
    { id: "ZOD_SCHEMA", description: "Zod validation schema body", required: true, accepts: ["field_list"] },
    { id: "FORM_FIELDS", description: "Form field JSX block", required: true, accepts: ["field_list"] },
    { id: "TABLE_COLUMNS", description: "Table column definitions", required: true, accepts: ["field_list"] },
    { id: "ROUTE_PATH", description: "API route path", required: true, accepts: ["route_path"] }
  ],
  files: [
    {
      relativePath: "pages/{{TABLE_NAME}}/index.tsx",
      category: "page",
      slots: ["ENTITY_NAME", "ENTITY_NAME_PLURAL", "TABLE_NAME", "TABLE_COLUMNS"],
      isUserEditable: true,
      templateSource: "crud/pages/list"
    },
    {
      relativePath: "pages/{{TABLE_NAME}}/[id].tsx",
      category: "page",
      slots: ["ENTITY_NAME", "TABLE_NAME", "FIELD_LIST"],
      isUserEditable: true,
      templateSource: "crud/pages/detail"
    },
    {
      relativePath: "pages/{{TABLE_NAME}}/new.tsx",
      category: "page",
      slots: ["ENTITY_NAME", "TABLE_NAME", "FORM_FIELDS", "ZOD_SCHEMA"],
      isUserEditable: true,
      templateSource: "crud/pages/form"
    },
    {
      relativePath: "pages/api/{{TABLE_NAME}}/index.ts",
      category: "api",
      slots: ["ENTITY_NAME", "ENTITY_NAME_PLURAL", "TABLE_NAME"],
      isUserEditable: false,
      templateSource: "crud/api/list-create"
    },
    {
      relativePath: "pages/api/{{TABLE_NAME}}/[id].ts",
      category: "api",
      slots: ["ENTITY_NAME", "TABLE_NAME"],
      isUserEditable: false,
      templateSource: "crud/api/get-update-delete"
    }
  ]
};

// src/registry/templates/dashboard/manifest.ts
var dashboardTemplate = {
  id: "dashboard-analytics",
  name: "Analytics Dashboard",
  description: "A real-time analytics dashboard with charts, KPI cards, and data tables.",
  appType: "dashboard",
  version: "1.0.0",
  supportedFieldTypes: ["string", "number", "date", "datetime", "boolean", "enum"],
  requiredEntityCount: { min: 1, max: 10 },
  tags: ["dashboard", "analytics", "charts", "kpi"],
  previewImageUrl: "/previews/dashboard-analytics.png",
  envVars: ["DATABASE_URL", "CLERK_SECRET_KEY", "CLERK_PUBLISHABLE_KEY"],
  dependencies: ["@prisma/client", "next", "react", "react-dom", "@clerk/nextjs", "recharts"],
  devDependencies: ["prisma", "typescript", "@types/react", "@types/node"],
  slots: [
    { id: "ENTITY_NAME", description: "PascalCase entity name", required: true, accepts: ["entity_name"] },
    { id: "KPI_FIELDS", description: "Fields to use as KPI metrics", required: true, accepts: ["field_list"] },
    { id: "CHART_FIELDS", description: "Fields to use in charts", required: true, accepts: ["field_list"] },
    { id: "TIME_FIELD", description: "Date field for time-series", required: false, accepts: ["field_list"] }
  ],
  files: [
    {
      relativePath: "pages/dashboard/index.tsx",
      category: "page",
      slots: ["ENTITY_NAME", "KPI_FIELDS", "CHART_FIELDS"],
      isUserEditable: true,
      templateSource: "dashboard/pages/main"
    },
    {
      relativePath: "pages/api/dashboard/stats.ts",
      category: "api",
      slots: ["ENTITY_NAME", "KPI_FIELDS", "TIME_FIELD"],
      isUserEditable: false,
      templateSource: "dashboard/api/stats"
    }
  ]
};

// src/registry/templates/workflow/manifest.ts
var workflowTemplate = {
  id: "workflow-automation",
  name: "Workflow Automation",
  description: "Trigger-based workflow engine with multi-step action chains and conditionals.",
  appType: "workflow",
  version: "1.0.0",
  supportedFieldTypes: ["string", "text", "number", "boolean", "date", "datetime", "json", "enum"],
  requiredEntityCount: { min: 1, max: 5 },
  tags: ["workflow", "automation", "triggers", "actions"],
  previewImageUrl: "/previews/workflow-automation.png",
  envVars: ["DATABASE_URL", "CLERK_SECRET_KEY", "CLERK_PUBLISHABLE_KEY", "UPSTASH_REDIS_URL", "UPSTASH_REDIS_TOKEN"],
  dependencies: [
    "@prisma/client",
    "next",
    "react",
    "react-dom",
    "@clerk/nextjs",
    "@upstash/redis",
    "zod"
  ],
  devDependencies: ["prisma", "typescript", "@types/react", "@types/node"],
  slots: [
    { id: "WORKFLOW_NAME", description: "Workflow identifier", required: true, accepts: ["entity_name"] },
    { id: "TRIGGER_TYPE", description: "Trigger type: webhook|schedule|db_event|form_submit", required: true, accepts: ["custom_string"] },
    { id: "ACTION_STEPS", description: "Serialized action step configs", required: true, accepts: ["custom_string"] }
  ],
  files: [
    {
      relativePath: "pages/workflows/index.tsx",
      category: "page",
      slots: ["WORKFLOW_NAME"],
      isUserEditable: true,
      templateSource: "workflow/pages/list"
    },
    {
      relativePath: "pages/api/workflows/trigger.ts",
      category: "api",
      slots: ["WORKFLOW_NAME", "TRIGGER_TYPE"],
      isUserEditable: false,
      templateSource: "workflow/api/trigger"
    },
    {
      relativePath: "pages/api/workflows/execute.ts",
      category: "api",
      slots: ["ACTION_STEPS"],
      isUserEditable: false,
      templateSource: "workflow/api/execute"
    }
  ]
};

// src/registry/templates/admin-panel/manifest.ts
var adminPanelTemplate = {
  id: "admin-panel-full",
  name: "Admin Panel",
  description: "Full admin panel with user management, role-based access, and audit logs.",
  appType: "admin-panel",
  version: "1.0.0",
  supportedFieldTypes: ["string", "text", "number", "boolean", "date", "datetime", "email", "url", "enum", "relation", "file", "json"],
  requiredEntityCount: { min: 1, max: 30 },
  tags: ["admin", "management", "rbac", "audit"],
  previewImageUrl: "/previews/admin-panel.png",
  envVars: ["DATABASE_URL", "CLERK_SECRET_KEY", "CLERK_PUBLISHABLE_KEY"],
  dependencies: [
    "@prisma/client",
    "next",
    "react",
    "react-dom",
    "@clerk/nextjs",
    "zod",
    "react-hook-form",
    "@hookform/resolvers"
  ],
  devDependencies: ["prisma", "typescript", "@types/react", "@types/node"],
  slots: [
    { id: "ENTITY_NAME", description: "PascalCase entity name", required: true, accepts: ["entity_name"] },
    { id: "ENTITY_NAME_PLURAL", description: "Plural entity name", required: true, accepts: ["entity_name"] },
    { id: "TABLE_NAME", description: "snake_case DB table name", required: true, accepts: ["entity_name"] },
    { id: "FIELD_LIST", description: "Field definitions", required: true, accepts: ["field_list"] },
    { id: "ROLES", description: "Role list", required: true, accepts: ["permission_list"] }
  ],
  files: [
    {
      relativePath: "pages/admin/{{TABLE_NAME}}/index.tsx",
      category: "page",
      slots: ["ENTITY_NAME", "ENTITY_NAME_PLURAL", "TABLE_NAME", "FIELD_LIST"],
      isUserEditable: true,
      templateSource: "admin-panel/pages/list"
    },
    {
      relativePath: "pages/admin/users/index.tsx",
      category: "page",
      slots: ["ROLES"],
      isUserEditable: true,
      templateSource: "admin-panel/pages/users"
    },
    {
      relativePath: "pages/api/admin/{{TABLE_NAME}}/index.ts",
      category: "api",
      slots: ["ENTITY_NAME", "TABLE_NAME", "ROLES"],
      isUserEditable: false,
      templateSource: "admin-panel/api/crud"
    },
    {
      relativePath: "pages/api/admin/audit-log.ts",
      category: "api",
      slots: [],
      isUserEditable: false,
      templateSource: "admin-panel/api/audit-log"
    }
  ]
};

// src/registry/index.ts
var REGISTRY = /* @__PURE__ */ new Map([
  [crudTemplate.id, crudTemplate],
  [dashboardTemplate.id, dashboardTemplate],
  [workflowTemplate.id, workflowTemplate],
  [adminPanelTemplate.id, adminPanelTemplate]
]);
function getTemplate(id) {
  const t = REGISTRY.get(id);
  if (!t) throw new Error(`Template not found: ${id}`);
  return t;
}
function listTemplates(filter) {
  let templates = [...REGISTRY.values()];
  if (filter?.appType) {
    templates = templates.filter((t) => t.appType === filter.appType);
  }
  if (filter?.tags?.length) {
    templates = templates.filter((t) => filter.tags.some((tag) => t.tags.includes(tag)));
  }
  return templates;
}
function resolveTemplate(appType, entityCount) {
  const candidates = listTemplates({ appType }).filter(
    (t) => entityCount >= t.requiredEntityCount.min && entityCount <= t.requiredEntityCount.max
  );
  if (!candidates.length) {
    throw new Error(`No template found for appType="${appType}" with ${entityCount} entities`);
  }
  return candidates.sort((a, b) => b.requiredEntityCount.min - a.requiredEntityCount.min)[0];
}
function registerTemplate(manifest) {
  REGISTRY.set(manifest.id, manifest);
}

// src/loader/code-generator.ts
function generatePrismaModel(entity) {
  const lines = [`model ${entity.name} {`];
  lines.push(`  id        String   @id @default(cuid())`);
  if (entity.tenantScoped) {
    lines.push(`  tenantId  String`);
  }
  for (const field of entity.fields) {
    if (field.name === "id") continue;
    lines.push(`  ${formatPrismaField(field)}`);
  }
  if (entity.timestamps !== false) {
    lines.push(`  createdAt DateTime @default(now())`);
    lines.push(`  updatedAt DateTime @updatedAt`);
  }
  if (entity.softDelete) {
    lines.push(`  deletedAt DateTime?`);
  }
  if (entity.tenantScoped) {
    lines.push(``);
    lines.push(`  @@index([tenantId])`);
  }
  lines.push(`}`);
  return lines.join("\n");
}
function formatPrismaField(field) {
  const prismaType = fieldTypeToPrisma(field.type);
  const optional = field.required ? "" : "?";
  const modifiers = [];
  if (field.unique) modifiers.push("@unique");
  if (field.default !== void 0) {
    modifiers.push(`@default(${formatPrismaDefault(field.default, field.type)})`);
  }
  if (field.type === "enum") {
    modifiers.push(`// enum: ${field.enumValues?.join(" | ")}`);
  }
  const modifier = modifiers.length ? "  " + modifiers.join(" ") : "";
  return `  ${field.name.padEnd(20)} ${(prismaType + optional).padEnd(16)}${modifier}`;
}
function fieldTypeToPrisma(type) {
  const map = {
    string: "String",
    text: "String",
    number: "Float",
    boolean: "Boolean",
    date: "DateTime",
    datetime: "DateTime",
    email: "String",
    url: "String",
    enum: "String",
    relation: "String",
    // FK — relation lines handled separately
    file: "String",
    // stored as URL/key
    json: "Json"
  };
  return map[type] ?? "String";
}
function formatPrismaDefault(value, type) {
  if (type === "boolean") return String(value);
  if (type === "number") return String(value);
  if (typeof value === "string") return `"${value}"`;
  return String(value);
}
function generateFullPrismaSchema(entities, tenantId) {
  const header = `// Auto-generated by OneAtlas Template Engine
// DO NOT EDIT \u2014 changes will be overwritten on next generation

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
`;
  const models = entities.map(generatePrismaModel).join("\n\n");
  return `${header}
${models}
`;
}
function generateZodSchema(entity) {
  const fields = entity.fields.filter((f) => f.name !== "id").map((f) => `  ${f.name}: ${fieldTypeToZod(f)},`).join("\n");
  return `import { z } from 'zod';

export const ${entity.name}Schema = z.object({
${fields}
});

export type ${entity.name}Input = z.infer<typeof ${entity.name}Schema>;
export type ${entity.name}Partial = Partial<${entity.name}Input>;
`;
}
function fieldTypeToZod(field) {
  let base = "";
  switch (field.type) {
    case "string":
    case "text":
      base = "z.string()";
      if (field.validation?.min) base += `.min(${field.validation.min})`;
      if (field.validation?.max) base += `.max(${field.validation.max})`;
      if (field.validation?.pattern) base += `.regex(/${field.validation.pattern}/)`;
      break;
    case "email":
      base = "z.string().email()";
      break;
    case "url":
      base = "z.string().url()";
      break;
    case "number":
      base = "z.number()";
      if (field.validation?.min) base += `.min(${field.validation.min})`;
      if (field.validation?.max) base += `.max(${field.validation.max})`;
      break;
    case "boolean":
      base = "z.boolean()";
      break;
    case "date":
    case "datetime":
      base = "z.string().datetime()";
      break;
    case "enum":
      if (field.enumValues?.length) {
        const vals = field.enumValues.map((v) => `'${v}'`).join(", ");
        base = `z.enum([${vals}])`;
      } else {
        base = "z.string()";
      }
      break;
    case "json":
      base = "z.record(z.unknown())";
      break;
    case "file":
    case "relation":
      base = "z.string()";
      break;
    default:
      base = "z.string()";
  }
  if (!field.required) base += ".optional()";
  if (field.default !== void 0) {
    const defaultVal = typeof field.default === "string" ? `'${field.default}'` : String(field.default);
    base += `.default(${defaultVal})`;
  }
  return base;
}
function generateTypeScriptInterface(entity) {
  const fields = entity.fields.map((f) => {
    const tsType = fieldTypeToTypeScript(f.type);
    const optional = f.required ? "" : "?";
    return `  ${f.name}${optional}: ${tsType};`;
  }).join("\n");
  const systemFields = [
    `  id: string;`,
    entity.tenantScoped ? `  tenantId: string;` : null,
    entity.timestamps !== false ? `  createdAt: Date;` : null,
    entity.timestamps !== false ? `  updatedAt: Date;` : null,
    entity.softDelete ? `  deletedAt?: Date | null;` : null
  ].filter(Boolean).join("\n");
  return `export interface ${entity.name} {
${systemFields}
${fields}
}
`;
}
function fieldTypeToTypeScript(type) {
  const map = {
    string: "string",
    text: "string",
    number: "number",
    boolean: "boolean",
    date: "Date",
    datetime: "Date",
    email: "string",
    url: "string",
    enum: "string",
    relation: "string",
    file: "string",
    json: "Record<string, unknown>"
  };
  return map[type] ?? "string";
}
function computeSlotValues(entity) {
  return {
    ENTITY_NAME: entity.name,
    ENTITY_NAME_PLURAL: entity.pluralName,
    TABLE_NAME: entity.tableName,
    FIELD_LIST: entity.fields.map((f) => f.name).join(", "),
    PRISMA_FIELDS: entity.fields.map(formatPrismaField).join("\n"),
    ZOD_SCHEMA: generateZodSchema(entity),
    TABLE_COLUMNS: generateTableColumns(entity),
    FORM_FIELDS: generateFormFields(entity),
    ROUTE_PATH: `/api/${entity.tableName}`
  };
}
function generateTableColumns(entity) {
  return entity.fields.filter((f) => !f.ui?.hidden).slice(0, 6).map(
    (f) => `  { key: '${f.name}', label: '${f.label}', sortable: true }`
  ).join(",\n");
}
function generateFormFields(entity) {
  return entity.fields.filter((f) => !f.ui?.hidden && !f.ui?.readOnly && f.name !== "id").map((f) => {
    const inputType = fieldTypeToInputType(f.type);
    return `  <FormField name="${f.name}" label="${f.label}" type="${inputType}" required={${f.required}} />`;
  }).join("\n");
}
function fieldTypeToInputType(type) {
  const map = {
    string: "text",
    text: "textarea",
    number: "number",
    boolean: "checkbox",
    date: "date",
    datetime: "datetime-local",
    email: "email",
    url: "url",
    enum: "select",
    relation: "select",
    file: "file",
    json: "textarea"
  };
  return map[type] ?? "text";
}

// src/loader/ast-patcher.ts
import { createHash } from "crypto";
var SLOT_SINGLE_RE = /\{\{([A-Z_]+)\}\}/g;
var SLOT_BLOCK_START_RE = /\{\{([A-Z_]+):START\}\}/g;
var SLOT_BLOCK_END = (id) => `{{${id}:END}}`;
function patchSlots(templateSource, slotValues) {
  let result = replaceBlockSlots(templateSource, slotValues);
  result = result.replace(SLOT_SINGLE_RE, (_match, slotId) => {
    return slotValues[slotId] ?? _match;
  });
  return result;
}
function replaceBlockSlots(source, values) {
  let result = source;
  let match;
  const re = new RegExp(SLOT_BLOCK_START_RE.source, "g");
  while ((match = re.exec(source)) !== null) {
    const slotId = match[1];
    const startMarker = `{{${slotId}:START}}`;
    const endMarker = SLOT_BLOCK_END(slotId);
    const startIdx = result.indexOf(startMarker);
    const endIdx = result.indexOf(endMarker);
    if (startIdx === -1 || endIdx === -1) continue;
    const newContent = values[slotId] ?? "";
    result = result.slice(0, startIdx) + newContent + result.slice(endIdx + endMarker.length);
  }
  return result;
}
function smartPatch(existingFile, newSlotValues, templateSource) {
  if (existingFile.lockedFromRegen) {
    return existingFile;
  }
  const changedSlots = Object.entries(newSlotValues).filter(
    ([key, val]) => existingFile.slotValues?.[key] !== val
  );
  if (changedSlots.length === 0) {
    return existingFile;
  }
  const mergedSlots = { ...existingFile.slotValues, ...newSlotValues };
  const newContent = patchSlots(templateSource, mergedSlots);
  const newHash = sha256(newContent);
  return {
    ...existingFile,
    content: newContent,
    slotValues: mergedSlots,
    hash: newHash,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    origin: "template"
  };
}
function resolveFilePath(templatePath, slotValues) {
  return templatePath.replace(/\{\{([A-Z_]+)\}\}/g, (_match, slotId) => {
    return slotValues[slotId] ?? _match;
  });
}
function diffFileSets(existing, incoming) {
  const existingByPath = new Map(existing.map((f) => [f.relativePath, f]));
  const incomingByPath = new Map(incoming.map((f) => [f.relativePath, f]));
  const toAdd = incoming.filter((f) => !existingByPath.has(f.relativePath));
  const toDelete = existing.filter((f) => !incomingByPath.has(f.relativePath) && !f.lockedFromRegen);
  const toUpdate = incoming.filter((f) => {
    const ex = existingByPath.get(f.relativePath);
    if (!ex) return false;
    if (ex.lockedFromRegen) return false;
    return ex.content !== f.content;
  });
  const unchanged = existing.filter((f) => {
    const inc = incomingByPath.get(f.relativePath);
    return inc && f.content === inc.content;
  });
  return { toAdd, toUpdate, toDelete, unchanged };
}
function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}
function generateFileFromTemplate(templateSource, slotValues, relativePath, templateId) {
  const resolvedPath = resolveFilePath(relativePath, slotValues);
  const content = patchSlots(templateSource, slotValues);
  return {
    relativePath: resolvedPath,
    content,
    origin: "template",
    templateId,
    slotValues,
    hash: sha256(content),
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    lockedFromRegen: false
  };
}

// src/registry/templates/crud/api/handlers.ts
var listCreateTemplate = `
import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { getTenantPrisma } from '@/lib/db/tenant';
import { {{ENTITY_NAME}}Schema } from '@/lib/schemas/{{TABLE_NAME}}';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { userId, orgId } = getAuth(req);
  if (!userId || !orgId) return res.status(401).json({ error: 'Unauthorized' });

  const prisma = getTenantPrisma(orgId);

  if (req.method === 'GET') {
    try {
      const page = parseInt(req.query['page'] as string ?? '1', 10);
      const limit = parseInt(req.query['limit'] as string ?? '20', 10);
      const search = req.query['search'] as string | undefined;

      const where = search
        ? {
            OR: [
              // {{SEARCH_FIELDS}} \u2014 injected by AST patcher
            ],
          }
        : {};

      const [items, total] = await prisma.$transaction([
        prisma.{{TABLE_NAME}}.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.{{TABLE_NAME}}.count({ where }),
      ]);

      return res.status(200).json({
        data: items,
        meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    } catch (error) {
      console.error('GET /{{TABLE_NAME}} error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  if (req.method === 'POST') {
    try {
      const validated = {{ENTITY_NAME}}Schema.parse(req.body);
      const item = await prisma.{{TABLE_NAME}}.create({
        data: { ...validated, tenantId: orgId },
      });
      return res.status(201).json({ data: item });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(422).json({ error: 'Validation failed', details: error.errors });
      }
      console.error('POST /{{TABLE_NAME}} error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
`;
var getUpdateDeleteTemplate = `
import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { getTenantPrisma } from '@/lib/db/tenant';
import { {{ENTITY_NAME}}Schema } from '@/lib/schemas/{{TABLE_NAME}}';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { userId, orgId } = getAuth(req);
  if (!userId || !orgId) return res.status(401).json({ error: 'Unauthorized' });

  const id = req.query['id'] as string;
  if (!id) return res.status(400).json({ error: 'Missing id' });

  const prisma = getTenantPrisma(orgId);

  // Ownership check \u2014 ensure record belongs to this tenant
  const existing = await prisma.{{TABLE_NAME}}.findFirst({
    where: { id, tenantId: orgId },
  });
  if (!existing) return res.status(404).json({ error: '{{ENTITY_NAME}} not found' });

  if (req.method === 'GET') {
    return res.status(200).json({ data: existing });
  }

  if (req.method === 'PUT' || req.method === 'PATCH') {
    try {
      const schema = req.method === 'PATCH'
        ? {{ENTITY_NAME}}Schema.partial()
        : {{ENTITY_NAME}}Schema;
      const validated = schema.parse(req.body);
      const updated = await prisma.{{TABLE_NAME}}.update({
        where: { id },
        data: { ...validated, updatedAt: new Date() },
      });
      return res.status(200).json({ data: updated });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(422).json({ error: 'Validation failed', details: error.errors });
      }
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  if (req.method === 'DELETE') {
    await prisma.{{TABLE_NAME}}.delete({ where: { id } });
    return res.status(204).end();
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
`;

// src/loader/hydration.ts
function generateHydrationManifest(spec) {
  return {
    appId: spec.id,
    appName: spec.name,
    appType: spec.appType,
    tenantId: spec.tenantId,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    entities: spec.entities.map(buildEntityEntry),
    routes: spec.routes.map((r) => ({ method: r.method, path: r.path })),
    roles: spec.permissions.roles.map((r) => r.name)
  };
}
function serializeHydrationManifest(manifest) {
  return JSON.stringify(manifest, null, 2);
}
function generateHydrationModule(manifest) {
  const json = JSON.stringify(manifest);
  return `// Auto-generated by OneAtlas Template Engine \u2014 do not edit
// This file is re-generated on every spec change.

import type { HydrationManifest } from '@oneatlas/templates/loader';

export const APP_MANIFEST: HydrationManifest = ${json} as const;

export function getEntity(name: string) {
  return APP_MANIFEST.entities.find((e) => e.name === name) ?? null;
}

export function getEntityByTable(tableName: string) {
  return APP_MANIFEST.entities.find((e) => e.tableName === tableName) ?? null;
}

export function getTableFields(entityName: string) {
  const entity = getEntity(entityName);
  return entity?.fields.filter((f) => f.showInTable) ?? [];
}

export function getFormFields(entityName: string) {
  const entity = getEntity(entityName);
  return entity?.fields.filter((f) => f.showInForm) ?? [];
}
`;
}
function buildEntityEntry(entity) {
  return {
    name: entity.name,
    pluralName: entity.pluralName,
    tableName: entity.tableName,
    apiPath: `/api/${entity.tableName}`,
    pages: {
      list: `/${entity.tableName}`,
      detail: `/${entity.tableName}/[id]`,
      form: `/${entity.tableName}/new`
    },
    fields: entity.fields.map(buildFieldEntry),
    tenantScoped: entity.tenantScoped ?? false,
    softDelete: entity.softDelete ?? false
  };
}
function buildFieldEntry(field) {
  const entry = {
    name: field.name,
    label: field.label,
    type: field.type,
    required: field.required ?? false,
    unique: field.unique ?? false,
    inputType: fieldTypeToInputType2(field.type),
    showInTable: !(field.ui?.hidden ?? false),
    showInForm: !(field.ui?.hidden ?? false) && !(field.ui?.readOnly ?? false) && field.name !== "id"
  };
  if (field.enumValues !== void 0) {
    entry.enumValues = field.enumValues;
  }
  return entry;
}
function fieldTypeToInputType2(type) {
  const map = {
    string: "text",
    text: "textarea",
    number: "number",
    boolean: "checkbox",
    date: "date",
    datetime: "datetime-local",
    email: "email",
    url: "url",
    enum: "select",
    relation: "select",
    file: "file",
    json: "textarea"
  };
  return map[type] ?? "text";
}

// src/loader/component-registry.ts
function generateComponentRegistryModule(spec) {
  const entries = spec.entities.map(buildRegistryEntry);
  const lazyImports = entries.map(({ entityName, components }) => {
    return `  ${entityName}: {
    ListPage: React.lazy(() => import('../pages/${entityName.toLowerCase()}/index')),
    DetailPage: React.lazy(() => import('../pages/${entityName.toLowerCase()}/[id]')),
    FormPage: React.lazy(() => import('../pages/${entityName.toLowerCase()}/new')),
  },`;
  }).join("\n");
  const apiPaths = entries.map(({ entityName, apiPath }) => `  ${entityName}: '${apiPath}',`).join("\n");
  const tableNames = entries.map(({ entityName, tableName }) => `  ${entityName}: '${tableName}',`).join("\n");
  return `// Auto-generated by OneAtlas Template Engine \u2014 do not edit
import React from 'react';

// Component type shared across all entity pages
export interface EntityPageProps {
  entityName: string;
  params?: Record<string, string>;
}

// Lazy-loaded page components, keyed by entity name
export const ENTITY_COMPONENTS: Record<
  string,
  {
    ListPage: React.LazyExoticComponent<React.ComponentType<EntityPageProps>>;
    DetailPage: React.LazyExoticComponent<React.ComponentType<EntityPageProps>>;
    FormPage: React.LazyExoticComponent<React.ComponentType<EntityPageProps>>;
  }
> = {
${lazyImports}
};

// API base paths per entity
export const ENTITY_API_PATHS: Record<string, string> = {
${apiPaths}
};

// Table names per entity (for display and URL routing)
export const ENTITY_TABLE_NAMES: Record<string, string> = {
${tableNames}
};

// All registered entity names
export const ENTITY_NAMES = ${JSON.stringify(entries.map((e) => e.entityName))} as const;
export type EntityName = typeof ENTITY_NAMES[number];

// Resolve entity name from URL table name
export function resolveEntityFromTable(tableName: string): EntityName | null {
  const entry = ENTITY_NAMES.find((name) => ENTITY_TABLE_NAMES[name] === tableName);
  return entry ?? null;
}

// Get components for an entity \u2014 throws if entity not registered
export function getEntityComponents(entityName: string) {
  const components = ENTITY_COMPONENTS[entityName];
  if (!components) throw new Error(\`Entity not registered: \${entityName}\`);
  return components;
}
`;
}
function generateDynamicListPageShell() {
  return `// Auto-generated by OneAtlas Template Engine \u2014 do not edit
import React, { Suspense } from 'react';
import { useRouter } from 'next/router';
import { resolveEntityFromTable, getEntityComponents } from '../../lib/registry';

export default function DynamicListPage() {
  const router = useRouter();
  const tableName = router.query['entity'] as string | undefined;

  if (!tableName) return null;

  const entityName = resolveEntityFromTable(tableName);
  if (!entityName) return <div>Unknown entity: {tableName}</div>;

  const { ListPage } = getEntityComponents(entityName);

  return (
    <Suspense fallback={<div>Loading\u2026</div>}>
      <ListPage entityName={entityName} />
    </Suspense>
  );
}
`;
}
function generateDynamicDetailPageShell() {
  return `// Auto-generated by OneAtlas Template Engine \u2014 do not edit
import React, { Suspense } from 'react';
import { useRouter } from 'next/router';
import { resolveEntityFromTable, getEntityComponents } from '../../lib/registry';

export default function DynamicDetailPage() {
  const router = useRouter();
  const tableName = router.query['entity'] as string | undefined;
  const id = router.query['id'] as string | undefined;

  if (!tableName || !id) return null;

  const entityName = resolveEntityFromTable(tableName);
  if (!entityName) return <div>Unknown entity: {tableName}</div>;

  const { DetailPage } = getEntityComponents(entityName);

  return (
    <Suspense fallback={<div>Loading\u2026</div>}>
      <DetailPage entityName={entityName} params={{ id }} />
    </Suspense>
  );
}
`;
}
function generateDynamicFormPageShell() {
  return `// Auto-generated by OneAtlas Template Engine \u2014 do not edit
import React, { Suspense } from 'react';
import { useRouter } from 'next/router';
import { resolveEntityFromTable, getEntityComponents } from '../../lib/registry';

export default function DynamicFormPage() {
  const router = useRouter();
  const tableName = router.query['entity'] as string | undefined;

  if (!tableName) return null;

  const entityName = resolveEntityFromTable(tableName);
  if (!entityName) return <div>Unknown entity: {tableName}</div>;

  const { FormPage } = getEntityComponents(entityName);

  return (
    <Suspense fallback={<div>Loading\u2026</div>}>
      <FormPage entityName={entityName} />
    </Suspense>
  );
}
`;
}
function buildRegistryEntry(entity) {
  const name = entity.name;
  const table = entity.tableName;
  return {
    entityName: name,
    tableName: table,
    components: {
      ListPage: `../pages/${name.toLowerCase()}/index`,
      DetailPage: `../pages/${name.toLowerCase()}/[id]`,
      FormPage: `../pages/${name.toLowerCase()}/new`
    },
    apiPath: `/api/${table}`
  };
}

// src/loader/index.ts
var TEMPLATE_SOURCES = {
  "crud/api/list-create": listCreateTemplate,
  "crud/api/get-update-delete": getUpdateDeleteTemplate
  // Add more as templates expand
};
function getTemplateSource(key) {
  const src = TEMPLATE_SOURCES[key];
  if (!src) throw new Error(`Template source not found: ${key}`);
  return src;
}
async function loadTemplate(spec, existingManifest) {
  const template = resolveTemplate(spec.appType, spec.entities.length);
  const allFiles = [];
  for (const entity of spec.entities) {
    const slotValues = computeSlotValues(entity);
    for (const templateFile of template.files) {
      const templateSource = getTemplateSource(templateFile.templateSource);
      const resolvedPath = resolveFilePath(templateFile.relativePath, slotValues);
      const existing = existingManifest?.files.find((f) => f.relativePath === resolvedPath);
      if (existing) {
        const patched = smartPatch(existing, slotValues, templateSource);
        allFiles.push(patched);
      } else {
        const generated = generateFileFromTemplate(
          templateSource,
          slotValues,
          templateFile.relativePath,
          template.id
        );
        allFiles.push(generated);
      }
    }
  }
  const prismaSchema = generateFullPrismaSchema(spec.entities);
  allFiles.push({
    relativePath: "prisma/schema.prisma",
    content: prismaSchema,
    origin: "composed",
    templateId: template.id,
    hash: sha256(prismaSchema),
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    lockedFromRegen: false
  });
  allFiles.push({
    relativePath: "lib/db/tenant.ts",
    content: generateTenantPrismaUtil(),
    origin: "composed",
    templateId: template.id,
    hash: sha256(generateTenantPrismaUtil()),
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    lockedFromRegen: false
  });
  allFiles.push({
    relativePath: "middleware.ts",
    content: generateRBACMiddleware(spec),
    origin: "composed",
    templateId: template.id,
    hash: sha256(generateRBACMiddleware(spec)),
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    lockedFromRegen: false
  });
  const manifest = {
    appId: spec.id,
    tenantId: spec.tenantId,
    templateId: template.id,
    version: (existingManifest?.version ?? 0) + 1,
    files: allFiles,
    prismaSchema,
    envVarKeys: template.envVars,
    routes: spec.routes.map((r) => ({
      method: r.method,
      path: r.path,
      handlerFile: `pages/api${r.path.replace(/^\/api/, "")}.ts`
    })),
    pages: spec.pages.map((p) => ({
      path: p.path,
      componentFile: `pages${p.path}/index.tsx`
    })),
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    bundleReady: false
  };
  return manifest;
}
function generateTenantPrismaUtil() {
  return `// Auto-generated by OneAtlas Template Engine
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prismaClients: Map<string, PrismaClient> };
if (!globalForPrisma.prismaClients) {
  globalForPrisma.prismaClients = new Map();
}

export function getTenantPrisma(tenantId: string): PrismaClient {
  const cached = globalForPrisma.prismaClients.get(tenantId);
  if (cached) return cached;

  const client = new PrismaClient({
    datasources: { db: { url: process.env['DATABASE_URL'] } },
  });

  // Set search_path for schema-per-tenant isolation
  const tenantClient = client.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          await client.$executeRawUnsafe(\`SET search_path = "tenant_\${tenantId}"\`);
          return query(args);
        },
      },
    },
  }) as unknown as PrismaClient;

  globalForPrisma.prismaClients.set(tenantId, tenantClient);
  return tenantClient;
}
`;
}
function generateRBACMiddleware(spec) {
  const roleList = spec.permissions.roles.map((r) => r.name);
  return `// Auto-generated by OneAtlas Template Engine
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const isPublicRoute = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)']);
const isApiRoute = createRouteMatcher(['/api(.*)']);

const ROLES = ${JSON.stringify(roleList)} as const;
type Role = typeof ROLES[number];

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return NextResponse.next();

  const { userId, orgId, orgRole } = await auth();

  if (!userId) return NextResponse.redirect(new URL('/sign-in', req.url));
  if (isApiRoute(req) && !orgId) {
    return NextResponse.json({ error: 'Organization required' }, { status: 403 });
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)'],
};
`;
}
function generateAppShellFiles(spec, templateId) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const hydrationManifest = generateHydrationManifest(spec);
  const hydrationModule = generateHydrationModule(hydrationManifest);
  const registryModule = generateComponentRegistryModule(spec);
  const make = (relativePath, content) => ({
    relativePath,
    content,
    origin: "composed",
    templateId,
    hash: sha256(content),
    generatedAt: now,
    lockedFromRegen: false
  });
  return [
    make("lib/hydration-manifest.json", JSON.stringify(hydrationManifest, null, 2)),
    make("lib/manifest.ts", hydrationModule),
    make("lib/registry.ts", registryModule),
    make("pages/[entity]/index.tsx", generateDynamicListPageShell()),
    make("pages/[entity]/[id].tsx", generateDynamicDetailPageShell()),
    make("pages/[entity]/new.tsx", generateDynamicFormPageShell())
  ];
}

// src/composer/composer.ts
import { createHash as createHash2 } from "crypto";
function composeBundle(spec, manifest) {
  const files = [];
  for (const file of manifest.files) {
    files.push({ path: file.relativePath, content: file.content });
  }
  files.push({ path: "next.config.js", content: generateNextConfig(spec) });
  const packageJson = generateAppPackageJson(spec);
  files.push({ path: "package.json", content: packageJson });
  files.push({
    path: ".env.example",
    content: manifest.envVarKeys.map((k) => `${k}=`).join("\n") + "\n"
  });
  files.push({ path: "app/layout.tsx", content: generateAppLayout(spec) });
  files.push({ path: "lib/nav.ts", content: generateNavConfig(spec) });
  files.push({ path: "worker/index.ts", content: generateCFWorker(spec) });
  const bundleHash = createHash2("sha256").update(files.map((f) => f.content).join("")).digest("hex").slice(0, 16);
  return {
    appId: spec.id,
    tenantId: spec.tenantId,
    files,
    prismaSchema: manifest.prismaSchema,
    packageJson,
    envVarKeys: manifest.envVarKeys,
    bundleHash,
    composedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function generateNextConfig(spec) {
  return `/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client'],
  },
  env: {
    APP_NAME: '${spec.name}',
    APP_SLUG: '${spec.slug}',
    TENANT_ID: '${spec.tenantId}',
  },
};

module.exports = nextConfig;
`;
}
function generateAppPackageJson(spec) {
  const pkg = {
    name: spec.slug,
    version: "1.0.0",
    private: true,
    scripts: {
      dev: "next dev",
      build: "prisma generate && next build",
      start: "next start",
      "db:push": "prisma db push",
      "db:migrate": "prisma migrate deploy"
    },
    dependencies: {
      next: "^14.2.0",
      react: "^18.3.0",
      "react-dom": "^18.3.0",
      "@prisma/client": "^5.14.0",
      "@clerk/nextjs": "^5.1.0",
      zod: "^3.23.0",
      "react-hook-form": "^7.51.0",
      "@hookform/resolvers": "^3.4.0"
    },
    devDependencies: {
      prisma: "^5.14.0",
      typescript: "^5.4.0",
      "@types/react": "^18.3.0",
      "@types/node": "^20.0.0"
    }
  };
  return JSON.stringify(pkg, null, 2);
}
function generateAppLayout(spec) {
  return `import { ClerkProvider } from '@clerk/nextjs';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '${spec.name}',
  description: '${spec.description ?? spec.name} \u2014 powered by OneAtlas',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
`;
}
function generateNavConfig(spec) {
  const navItems = spec.pages.filter((p) => p.pageType === "list" || p.pageType === "dashboard").map((p) => `  { label: '${p.title}', href: '${p.path}', icon: '${p.icon ?? "grid"}' }`).join(",\n");
  return `export const NAV_ITEMS = [
${navItems}
] as const;

export type NavItem = typeof NAV_ITEMS[number];
`;
}
function generateCFWorker(spec) {
  return `// Auto-generated Cloudflare Worker entry for ${spec.name}
// Handles edge routing, tenant resolution, and RBAC

export interface Env {
  DATABASE_URL: string;
  CLERK_SECRET_KEY: string;
  UPSTASH_REDIS_URL?: string;
  UPSTASH_REDIS_TOKEN?: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Extract tenant from subdomain: {slug}.oneatlas.app
    const subdomain = url.hostname.split('.')[0];
    const tenantSlug = subdomain ?? '${spec.slug}';

    // Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ ok: true, app: '${spec.name}', tenant: tenantSlug }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Forward to Next.js pages function (set by CF Pages)
    return new Response('Not Found', { status: 404 });
  },
};
`;
}
function serializeManifest(manifest) {
  return JSON.stringify(manifest, null, 2);
}
function deserializeManifest(json) {
  return JSON.parse(json);
}

// src/preview/redis-store.ts
import { Redis } from "@upstash/redis";
var TENANT_INDEX_PREFIX = "preview:tenant:";
var SESSION_PREFIX = "preview:session:";
var RedisPreviewStore = class {
  redis;
  constructor(options) {
    this.redis = new Redis({
      url: options?.url ?? process.env["UPSTASH_REDIS_URL"] ?? "",
      token: options?.token ?? process.env["UPSTASH_REDIS_TOKEN"] ?? ""
    });
  }
  async get(previewId) {
    const key = SESSION_PREFIX + previewId;
    const data = await this.redis.get(key);
    return data ?? null;
  }
  async set(previewId, session, ttlSeconds) {
    const sessionKey = SESSION_PREFIX + previewId;
    const indexKey = TENANT_INDEX_PREFIX + session.tenantId;
    await this.redis.set(sessionKey, session, { ex: ttlSeconds });
    await this.redis.sadd(indexKey, previewId);
    await this.redis.expire(indexKey, ttlSeconds);
  }
  async delete(previewId) {
    const session = await this.get(previewId);
    if (session) {
      const indexKey = TENANT_INDEX_PREFIX + session.tenantId;
      await this.redis.srem(indexKey, previewId);
    }
    await this.redis.del(SESSION_PREFIX + previewId);
  }
  async list(tenantId) {
    const indexKey = TENANT_INDEX_PREFIX + tenantId;
    const members = await this.redis.smembers(indexKey);
    const alive = [];
    for (const id of members) {
      const exists = await this.redis.exists(SESSION_PREFIX + id);
      if (exists) {
        alive.push(id);
      } else {
        await this.redis.srem(indexKey, id);
      }
    }
    return alive;
  }
};

// src/preview/index.ts
var InMemoryPreviewStore = class {
  store = /* @__PURE__ */ new Map();
  async get(previewId) {
    const entry = this.store.get(previewId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(previewId);
      return null;
    }
    return entry.session;
  }
  async set(previewId, session, ttlSeconds) {
    this.store.set(previewId, {
      session,
      expiresAt: Date.now() + ttlSeconds * 1e3
    });
  }
  async delete(previewId) {
    this.store.delete(previewId);
  }
  async list(tenantId) {
    return [...this.store.entries()].filter(([, v]) => v.session.tenantId === tenantId).map(([k]) => k);
  }
};
var PreviewEngine = class {
  store;
  basePreviewDomain;
  constructor(options) {
    this.store = options?.store ?? new InMemoryPreviewStore();
    this.basePreviewDomain = options?.basePreviewDomain ?? "preview.oneatlas.app";
  }
  async createPreview(req) {
    const previewId = generatePreviewId();
    const ttl = req.ttlSeconds ?? 3600;
    const expiresAt = new Date(Date.now() + ttl * 1e3).toISOString();
    const previewUrl = `https://${previewId}.${this.basePreviewDomain}`;
    const mockState = generateMockState(req.bundle);
    const session = {
      previewId,
      appId: req.appId,
      tenantId: req.tenantId,
      previewUrl,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      expiresAt,
      mockState,
      status: "ready"
    };
    await this.store.set(previewId, session, ttl);
    return {
      previewId,
      previewUrl,
      ttlSeconds: ttl,
      expiresAt,
      mockDataSeeded: Object.keys(mockState).length > 0
    };
  }
  async getPreview(previewId) {
    return this.store.get(previewId);
  }
  async destroyPreview(previewId) {
    await this.store.delete(previewId);
  }
  async extendPreview(previewId, additionalSeconds) {
    const session = await this.store.get(previewId);
    if (!session) throw new Error(`Preview not found: ${previewId}`);
    const newExpiry = new Date(
      new Date(session.expiresAt).getTime() + additionalSeconds * 1e3
    ).toISOString();
    await this.store.set(
      previewId,
      { ...session, expiresAt: newExpiry },
      additionalSeconds
    );
  }
  // Handle a mock API request from the preview Worker
  async handleMockRequest(previewId, method, path, body) {
    const session = await this.store.get(previewId);
    if (!session) return { status: 404, data: { error: "Preview not found" } };
    const listMatch = path.match(/^\/api\/([a-z_]+)$/);
    if (listMatch && method === "GET") {
      const entityKey = listMatch[1];
      const items = session.mockState[entityKey] ?? [];
      return { status: 200, data: { data: items, meta: { total: items.length } } };
    }
    const detailMatch = path.match(/^\/api\/([a-z_]+)\/([^/]+)$/);
    if (detailMatch && method === "GET") {
      const entityKey = detailMatch[1];
      const id = detailMatch[2];
      const items = session.mockState[entityKey] ?? [];
      const item = items.find((i) => i["id"] === id);
      if (!item) return { status: 404, data: { error: "Not found" } };
      return { status: 200, data: { data: item } };
    }
    if (listMatch && method === "POST") {
      const entityKey = listMatch[1];
      const newItem = { id: crypto.randomUUID(), ...body, createdAt: (/* @__PURE__ */ new Date()).toISOString() };
      session.mockState[entityKey] = [...session.mockState[entityKey] ?? [], newItem];
      await this.store.set(previewId, session, 3600);
      return { status: 201, data: { data: newItem } };
    }
    return { status: 404, data: { error: "Route not found in preview" } };
  }
};
function generateMockState(bundle) {
  const entityRoutes = bundle.files.filter((f) => f.path.startsWith("pages/api/") && !f.path.includes("[id]")).map((f) => {
    const match = f.path.match(/pages\/api\/([^/]+)\//);
    return match?.[1] ?? null;
  }).filter(Boolean);
  const state = {};
  for (const entityKey of entityRoutes) {
    state[entityKey] = generateMockRows(entityKey, 5);
  }
  return state;
}
function generateMockRows(entityKey, count) {
  return Array.from({ length: count }, (_, i) => ({
    id: crypto.randomUUID(),
    name: `Sample ${entityKey} ${i + 1}`,
    createdAt: new Date(Date.now() - i * 864e5).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    status: ["active", "inactive", "pending"][i % 3]
  }));
}
function generatePreviewId() {
  return "preview-" + crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}
function buildPreviewStore() {
  if (process.env["UPSTASH_REDIS_URL"] && process.env["UPSTASH_REDIS_TOKEN"]) {
    return new RedisPreviewStore();
  }
  return new InMemoryPreviewStore();
}
var previewEngine = new PreviewEngine({ store: buildPreviewStore() });

// src/preview/html-renderer.ts
function renderPreviewPage(session, urlPath, basePreviewUrl) {
  const path = urlPath.split("?")[0] ?? "/";
  if (path === "/" || path === "") {
    const firstEntity = Object.keys(session.mockState)[0];
    if (firstEntity) {
      return redirect(`/${firstEntity}`);
    }
    return renderEmptyState(session);
  }
  const detailMatch = path.match(/^\/([a-z_]+)\/([^/]+)$/);
  if (detailMatch) {
    const [, entityKey, id] = detailMatch;
    return renderDetailPage(session, entityKey, id, basePreviewUrl);
  }
  const listMatch = path.match(/^\/([a-z_]+)$/);
  if (listMatch) {
    const [, entityKey] = listMatch;
    return renderListPage(session, entityKey, basePreviewUrl);
  }
  return render404();
}
function renderListPage(session, entityKey, basePreviewUrl) {
  const rows = session.mockState[entityKey];
  if (!rows) return render404();
  const entityLabel = toLabel(entityKey);
  const entityLinks = buildEntityNav(session, basePreviewUrl, entityKey);
  const columns = rows.length > 0 ? Object.keys(rows[0]) : ["id", "name", "createdAt"];
  const tableHeaders = columns.map((col) => `<th>${toLabel(col)}</th>`).join("");
  const tableRows = rows.map((row) => {
    const cells = columns.map((col) => {
      const val = row[col];
      const display = val instanceof Date ? val.toLocaleString() : String(val ?? "");
      if (col === "id") {
        return `<td><a href="${basePreviewUrl}/${entityKey}/${display}" class="id-link">${display.slice(0, 8)}\u2026</a></td>`;
      }
      return `<td>${display}</td>`;
    }).join("");
    return `<tr>${cells}</tr>`;
  }).join("");
  const html = pageShell({
    title: entityLabel,
    entityLinks,
    body: `
      <div class="page-header">
        <h1>${entityLabel}</h1>
        <span class="badge">${rows.length} records</span>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr>${tableHeaders}</tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    `,
    previewId: session.previewId,
    basePreviewUrl
  });
  return { html, statusCode: 200 };
}
function renderDetailPage(session, entityKey, id, basePreviewUrl) {
  const rows = session.mockState[entityKey];
  if (!rows) return render404();
  const row = rows.find((r) => r["id"] === id);
  if (!row) return render404();
  const entityLabel = toLabel(entityKey);
  const entityLinks = buildEntityNav(session, basePreviewUrl, entityKey);
  const fields = Object.entries(row).map(([key, val]) => {
    const display = val instanceof Date ? val.toLocaleString() : String(val ?? "");
    return `
        <div class="field-row">
          <label>${toLabel(key)}</label>
          <span>${display}</span>
        </div>`;
  }).join("");
  const html = pageShell({
    title: `${entityLabel} Detail`,
    entityLinks,
    body: `
      <div class="page-header">
        <a href="${basePreviewUrl}/${entityKey}" class="back-link">\u2190 Back to ${entityLabel}</a>
        <h1>${entityLabel} <span class="id-badge">${id.slice(0, 8)}\u2026</span></h1>
      </div>
      <div class="detail-card">
        ${fields}
      </div>
    `,
    previewId: session.previewId,
    basePreviewUrl
  });
  return { html, statusCode: 200 };
}
function renderEmptyState(session) {
  const html = pageShell({
    title: "Preview",
    entityLinks: "",
    body: `
      <div class="empty-state">
        <p>No entities found in this preview session.</p>
        <code>${session.previewId}</code>
      </div>
    `,
    previewId: session.previewId,
    basePreviewUrl: ""
  });
  return { html, statusCode: 200 };
}
function render404() {
  return {
    html: `<!DOCTYPE html><html><body><h1>404 \u2014 Page not found</h1></body></html>`,
    statusCode: 404
  };
}
function redirect(location) {
  return {
    html: `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0;url=${location}"></head><body>Redirecting\u2026</body></html>`,
    statusCode: 302
  };
}
function pageShell(opts) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${opts.title} \u2014 OneAtlas Preview</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; color: #111; display: flex; min-height: 100vh; }
    nav { width: 220px; background: #18181b; color: #fff; padding: 24px 16px; flex-shrink: 0; }
    nav .logo { font-size: 13px; font-weight: 700; letter-spacing: 0.08em; color: #a1a1aa; text-transform: uppercase; margin-bottom: 24px; }
    nav a { display: block; padding: 8px 12px; border-radius: 6px; color: #e4e4e7; text-decoration: none; font-size: 14px; margin-bottom: 4px; }
    nav a:hover, nav a.active { background: #27272a; color: #fff; }
    main { flex: 1; padding: 32px; overflow: auto; }
    .page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
    .page-header h1 { font-size: 22px; font-weight: 700; }
    .badge { background: #e4e4e7; border-radius: 999px; padding: 2px 10px; font-size: 12px; color: #52525b; }
    .table-wrap { background: #fff; border-radius: 10px; border: 1px solid #e4e4e7; overflow: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    thead th { text-align: left; padding: 12px 16px; font-size: 12px; font-weight: 600; color: #71717a; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #e4e4e7; background: #fafafa; }
    tbody tr:hover { background: #f9f9fb; }
    tbody td { padding: 12px 16px; border-bottom: 1px solid #f4f4f5; }
    tbody tr:last-child td { border-bottom: none; }
    a.id-link { color: #6366f1; text-decoration: none; font-family: monospace; font-size: 13px; }
    a.id-link:hover { text-decoration: underline; }
    .detail-card { background: #fff; border: 1px solid #e4e4e7; border-radius: 10px; padding: 24px; max-width: 640px; }
    .field-row { display: flex; gap: 16px; padding: 10px 0; border-bottom: 1px solid #f4f4f5; align-items: baseline; }
    .field-row:last-child { border-bottom: none; }
    .field-row label { width: 160px; flex-shrink: 0; font-size: 12px; font-weight: 600; color: #71717a; text-transform: uppercase; letter-spacing: 0.05em; }
    .field-row span { font-size: 14px; color: #18181b; word-break: break-all; }
    .back-link { font-size: 13px; color: #6366f1; text-decoration: none; }
    .back-link:hover { text-decoration: underline; }
    .id-badge { font-family: monospace; font-size: 14px; color: #6366f1; }
    .empty-state { text-align: center; padding: 80px 24px; color: #71717a; }
    .empty-state code { display: block; margin-top: 12px; font-family: monospace; font-size: 12px; }
    .preview-bar { position: fixed; bottom: 0; left: 0; right: 0; background: #6366f1; color: #fff; font-size: 12px; padding: 6px 16px; display: flex; align-items: center; gap: 8px; z-index: 999; }
    .preview-bar code { font-family: monospace; opacity: 0.85; }
  </style>
</head>
<body>
  <nav>
    <div class="logo">OneAtlas Preview</div>
    ${opts.entityLinks}
  </nav>
  <main>
    ${opts.body}
  </main>
  <div class="preview-bar">
    <span>Preview mode</span>
    <code>${opts.previewId}</code>
  </div>
</body>
</html>`;
}
function buildEntityNav(session, basePreviewUrl, activeEntity) {
  return Object.keys(session.mockState).map((key) => {
    const active = key === activeEntity ? ' class="active"' : "";
    return `<a href="${basePreviewUrl}/${key}"${active}>${toLabel(key)}</a>`;
  }).join("");
}
function toLabel(key) {
  return key.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\b\w/g, (c) => c.toUpperCase());
}

// src/deployment/index.ts
var DeploymentEngine = class {
  deployments = /* @__PURE__ */ new Map();
  baseDomain;
  constructor(options) {
    this.baseDomain = options?.baseDomain ?? "oneatlas.app";
  }
  async deploy(req) {
    const deploymentId = `deploy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const url = `https://${req.slug}.${this.baseDomain}`;
    const version = this.getNextVersion(req.appId);
    const record = {
      deploymentId,
      appId: req.appId,
      tenantId: req.tenantId,
      slug: req.slug,
      url,
      status: "queued",
      bundleHash: req.bundle.bundleHash,
      version,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.deployments.set(deploymentId, record);
    this.runDeploymentPipeline(deploymentId, req).catch((err) => {
      this.updateStatus(deploymentId, "failed", String(err));
    });
    return { deploymentId, url, status: "queued" };
  }
  async runDeploymentPipeline(deploymentId, req) {
    try {
      this.updateStatus(deploymentId, "building");
      const buildOutput = await this.buildBundle(req.bundle);
      this.updateStatus(deploymentId, "deploying");
      const cfResult = await this.deployToCloudflare({
        projectName: `oneatlas-${req.slug}`,
        accountId: req.cfAccountId,
        apiToken: req.cfApiToken,
        files: buildOutput.files
      });
      const record = this.deployments.get(deploymentId);
      this.deployments.set(deploymentId, {
        ...record,
        status: "live",
        cfDeploymentId: cfResult.id,
        cfProjectName: cfResult.projectName,
        completedAt: (/* @__PURE__ */ new Date()).toISOString(),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    } catch (err) {
      this.updateStatus(deploymentId, "failed", String(err));
    }
  }
  async buildBundle(bundle) {
    return { files: bundle.files };
  }
  async deployToCloudflare(params) {
    const formData = new FormData();
    const manifest = {};
    for (const file of params.files) {
      const hash = await sha256Hex(file.content);
      manifest[`/${file.path}`] = hash;
      formData.append(hash, new Blob([file.content]), file.path);
    }
    formData.append("manifest", JSON.stringify(manifest));
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${params.accountId}/pages/projects/${params.projectName}/deployments`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${params.apiToken}` },
        body: formData
      }
    );
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`CF deployment failed: ${response.status} ${errorBody}`);
    }
    const result = await response.json();
    return {
      id: result.result.id,
      projectName: params.projectName,
      url: `https://${params.projectName}.pages.dev`
    };
  }
  async getDeployment(deploymentId) {
    return this.deployments.get(deploymentId) ?? null;
  }
  async listDeployments(appId) {
    return [...this.deployments.values()].filter((d) => d.appId === appId).sort((a, b) => b.version - a.version);
  }
  async rollback(appId, targetVersion) {
    const deployments = await this.listDeployments(appId);
    const target = deployments.find((d) => d.version === targetVersion && d.status === "live");
    if (!target) return null;
    const current = deployments.find((d) => d.status === "live" && d.version > targetVersion);
    if (current) this.updateStatus(current.deploymentId, "rolled_back");
    return { deploymentId: target.deploymentId, url: target.url, status: "live" };
  }
  updateStatus(deploymentId, status, error) {
    const record = this.deployments.get(deploymentId);
    if (!record) return;
    const updated = { ...record, status, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
    if (error !== void 0) {
      updated.error = error;
    }
    this.deployments.set(deploymentId, updated);
  }
  getNextVersion(appId) {
    const existing = [...this.deployments.values()].filter((d) => d.appId === appId);
    return existing.length === 0 ? 1 : Math.max(...existing.map((d) => d.version)) + 1;
  }
};
async function sha256Hex(content) {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
var deploymentEngine = new DeploymentEngine();

// src/workflows/executor.ts
var STEP_EXECUTORS = {
  async ai(step, context) {
    if (step.type !== "ai") throw new Error("Wrong step type");
    const prompt = interpolate(step.prompt, context);
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env["ANTHROPIC_API_KEY"] ?? "",
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: step.model,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }]
      })
    });
    if (!response.ok) throw new Error(`AI step failed: ${response.statusText}`);
    const data = await response.json();
    const text = data.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    return { output: text, outputVar: step.outputVar };
  },
  async http(step, context) {
    if (step.type !== "http") throw new Error("Wrong step type");
    const url = interpolate(step.url, context);
    const body = step.body ? JSON.stringify(interpolateObject(step.body, context)) : void 0;
    const fetchInit = {
      method: step.method,
      headers: { "Content-Type": "application/json", ...step.headers }
    };
    if (body !== void 0) fetchInit.body = body;
    const response = await fetch(url, fetchInit);
    const responseData = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`HTTP step failed: ${response.status}`);
    return { output: responseData, outputVar: step.outputVar };
  },
  async notify(step, _context) {
    if (step.type !== "notify") throw new Error("Wrong step type");
    console.log(`[Workflow] Notify via ${step.channel} to ${step.recipients.join(", ")}`);
    return { output: { sent: true } };
  },
  async condition(step, context) {
    if (step.type !== "condition") throw new Error("Wrong step type");
    const result = evaluateCondition(step.expression, context);
    return { output: { branch: result ? "true" : "false", steps: result ? step.trueBranch : step.falseBranch } };
  }
};
var WorkflowExecutor = class {
  runs = /* @__PURE__ */ new Map();
  async startRun(workflow, appId, tenantId, triggerPayload) {
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const run = {
      runId,
      workflowId: workflow.id,
      appId,
      tenantId,
      triggerPayload,
      status: "pending",
      currentStep: 0,
      stepResults: [],
      context: { trigger: triggerPayload },
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      retryCount: 0
    };
    this.runs.set(runId, run);
    this.executeRun(run, workflow).catch(console.error);
    return run;
  }
  async executeRun(run, workflow) {
    run.status = "running";
    this.runs.set(run.runId, { ...run });
    for (let i = 0; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];
      run.currentStep = i;
      const startTime = Date.now();
      try {
        const executor = STEP_EXECUTORS[step.type];
        if (!executor) throw new Error(`No executor for step type: ${step.type}`);
        const { output, outputVar } = await executor(step, run.context, run);
        if (outputVar) {
          run.context[outputVar] = output;
        }
        const successResult = {
          stepIndex: i,
          type: step.type,
          status: "success",
          durationMs: Date.now() - startTime,
          executedAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        if (outputVar !== void 0) successResult.outputVar = outputVar;
        if (output !== void 0) successResult.output = output;
        run.stepResults.push(successResult);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const failedResult = {
          stepIndex: i,
          type: step.type,
          status: "failed",
          error: errorMsg,
          durationMs: Date.now() - startTime,
          executedAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        run.stepResults.push(failedResult);
        if (workflow.onError === "stop" || !workflow.onError) {
          run.status = "failed";
          run.error = errorMsg;
          run.completedAt = (/* @__PURE__ */ new Date()).toISOString();
          this.runs.set(run.runId, { ...run });
          return;
        }
      }
      this.runs.set(run.runId, { ...run });
    }
    run.status = "completed";
    run.completedAt = (/* @__PURE__ */ new Date()).toISOString();
    this.runs.set(run.runId, { ...run });
  }
  getRun(runId) {
    return this.runs.get(runId) ?? null;
  }
  listRuns(workflowId) {
    return [...this.runs.values()].filter((r) => r.workflowId === workflowId);
  }
};
function evaluateCondition(expression, context) {
  try {
    const interpolated = interpolate(expression, context);
    const safe = interpolated.replace(/[^a-zA-Z0-9\s.><=!&|()'"]+/g, "");
    return Boolean(Function(`"use strict"; return (${safe})`)());
  } catch {
    return false;
  }
}
function interpolate(template, context) {
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, key) => {
    const val = getNestedValue(context, key.trim());
    return val !== void 0 ? String(val) : _match;
  });
}
function interpolateObject(obj, context) {
  if (typeof obj === "string") return interpolate(obj, context);
  if (Array.isArray(obj)) return obj.map((item) => interpolateObject(item, context));
  if (obj && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, interpolateObject(v, context)])
    );
  }
  return obj;
}
function getNestedValue(obj, path) {
  return path.split(".").reduce((acc, key) => {
    if (acc && typeof acc === "object") return acc[key];
    return void 0;
  }, obj);
}
function matchesTrigger(trigger, requestMethod, requestPath) {
  if (trigger.type === "webhook") {
    return trigger.method === requestMethod && trigger.path === requestPath;
  }
  return false;
}
var workflowExecutor = new WorkflowExecutor();

// src/pipeline.ts
async function runGenerationPipeline(opts) {
  let spec;
  if (opts.existingSpec && opts.userPrompt) {
    spec = await refineAppSpec(opts.existingSpec, opts.userPrompt);
  } else if (opts.userPrompt) {
    spec = await generateAppSpec(opts.userPrompt, opts.tenantId);
  } else if (opts.entities && opts.appName && opts.appType) {
    spec = buildSpecFromEntities(opts.tenantId, opts.appName, opts.appType, opts.entities);
  } else {
    throw new Error("Must provide userPrompt or (entities + appName + appType)");
  }
  const existingManifest = opts.existingManifestJson ? deserializeManifest(opts.existingManifestJson) : void 0;
  const manifest = await loadTemplate(spec, existingManifest);
  const bundle = composeBundle(spec, manifest);
  const shellFiles = generateAppShellFiles(spec, manifest.templateId);
  bundle.files.push(...shellFiles.map((f) => ({ path: f.relativePath, content: f.content })));
  const finalManifest = { ...manifest, bundleReady: true };
  return {
    spec,
    manifest: finalManifest,
    manifestJson: serializeManifest(finalManifest),
    fileCount: bundle.files.length,
    entities: spec.entities.map((e) => e.name),
    routes: spec.routes.map((r) => `${r.method} ${r.path}`)
  };
}
async function runPreviewPipeline(opts) {
  const result = await runGenerationPipeline(opts);
  const bundle = composeBundle(result.spec, result.manifest);
  const previewReq = {
    appId: result.spec.id,
    tenantId: result.spec.tenantId,
    bundle,
    ...opts.ttlSeconds !== void 0 ? { ttlSeconds: opts.ttlSeconds } : {}
  };
  const preview = await previewEngine.createPreview(previewReq);
  return { ...result, preview };
}
async function runDeployPipeline(opts) {
  const pipelineResult = await runGenerationPipeline(opts);
  const bundle = composeBundle(pipelineResult.spec, pipelineResult.manifest);
  const deployment = await deploymentEngine.deploy({
    appId: pipelineResult.spec.id,
    tenantId: pipelineResult.spec.tenantId,
    slug: opts.slug,
    bundle,
    cfAccountId: opts.cfAccountId,
    cfApiToken: opts.cfApiToken
  });
  return { pipelineResult, deployment };
}
async function runIncrementalUpdate(existingSpec, existingManifestJson, refinementPrompt) {
  const newSpec = await refineAppSpec(existingSpec, refinementPrompt);
  const diff = diffSpecs(existingSpec, newSpec);
  const result = await runGenerationPipeline({
    tenantId: existingSpec.tenantId,
    existingSpec: newSpec,
    existingManifestJson
  });
  return { result, diff };
}
export {
  AppSpecSchema,
  DeploymentEngine,
  EntityDefSchema,
  FieldDefSchema,
  FieldTypeSchema,
  PageDefSchema,
  PreviewEngine,
  RBACPolicySchema,
  REGISTRY,
  RedisPreviewStore,
  RouteDefSchema,
  WorkflowExecutor,
  buildSpecFromEntities,
  composeBundle,
  computeSlotValues,
  deploymentEngine,
  deserializeManifest,
  diffFileSets,
  diffSpecs,
  evaluateCondition,
  generateAppShellFiles,
  generateAppSpec,
  generateComponentRegistryModule,
  generateDynamicDetailPageShell,
  generateDynamicFormPageShell,
  generateDynamicListPageShell,
  generateFileFromTemplate,
  generateFullPrismaSchema,
  generateHydrationManifest,
  generateHydrationModule,
  generateTypeScriptInterface,
  generateZodSchema,
  getTemplate,
  listTemplates,
  loadTemplate,
  matchesTrigger,
  patchSlots,
  previewEngine,
  refineAppSpec,
  registerTemplate,
  renderPreviewPage,
  resolveTemplate,
  runDeployPipeline,
  runGenerationPipeline,
  runIncrementalUpdate,
  runPreviewPipeline,
  serializeHydrationManifest,
  serializeManifest,
  sha256,
  smartPatch,
  workflowExecutor
};
