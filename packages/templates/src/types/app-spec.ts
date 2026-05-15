// packages/templates/src/types/app-spec.ts
// ─── Core AppSpec types — the normalized contract the entire pipeline consumes ───

export type AppType = 'crud' | 'dashboard' | 'workflow' | 'admin-panel';

export type FieldType =
  | 'string'
  | 'text'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'email'
  | 'url'
  | 'enum'
  | 'relation'
  | 'file'
  | 'json';

export interface FieldDef {
  name: string;
  type: FieldType;
  label: string;
  required: boolean;
  unique?: boolean;
  default?: unknown;
  enumValues?: string[];            // only when type === 'enum'
  relation?: {
    targetEntity: string;
    type: 'one-to-one' | 'one-to-many' | 'many-to-many';
    foreignKey?: string;
  };
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    message?: string;
  };
  ui?: {
    placeholder?: string;
    helpText?: string;
    hidden?: boolean;
    readOnly?: boolean;
    order?: number;
  };
}

export interface EntityDef {
  name: string;               // PascalCase, e.g. "Customer"
  pluralName: string;         // e.g. "Customers"
  tableName: string;          // snake_case, e.g. "customers"
  fields: FieldDef[];
  softDelete?: boolean;
  timestamps?: boolean;       // createdAt / updatedAt auto-fields
  tenantScoped?: boolean;     // adds tenantId FK + search_path isolation
}

export interface PageDef {
  id: string;
  path: string;               // e.g. "/customers"
  component: string;          // e.g. "CustomerList"
  pageType: 'list' | 'detail' | 'form' | 'dashboard' | 'custom';
  entityName?: string;        // linked entity for CRUD pages
  title: string;
  icon?: string;
  permissions?: string[];     // roles that can access this page
  slots?: Record<string, unknown>; // injectable template slots
}

export interface RouteDef {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;               // e.g. "/api/customers"
  handler: string;            // e.g. "listCustomers"
  entityName?: string;
  middlewares?: string[];     // e.g. ["auth", "rbac:admin"]
  rateLimit?: {
    requests: number;
    windowMs: number;
  };
}

export interface RBACPolicy {
  roles: RoleDef[];
  entityPermissions: EntityPermission[];
}

export interface RoleDef {
  name: string;               // e.g. "admin", "viewer", "editor"
  description?: string;
  inherits?: string[];        // role inheritance
}

export interface EntityPermission {
  entityName: string;
  role: string;
  actions: ('create' | 'read' | 'update' | 'delete' | 'list')[];
}

export interface WorkflowDef {
  id: string;
  name: string;
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
  onError?: 'stop' | 'continue' | 'retry';
  retryConfig?: {
    maxAttempts: number;
    backoffMs: number;
  };
}

export type WorkflowTrigger =
  | { type: 'webhook'; path: string; method: 'GET' | 'POST' }
  | { type: 'schedule'; cron: string }
  | { type: 'db_event'; entityName: string; event: 'insert' | 'update' | 'delete' }
  | { type: 'form_submit'; formId: string };

export type WorkflowStep =
  | { type: 'ai'; model: string; prompt: string; outputVar: string }
  | { type: 'db_query'; entity: string; action: string; params: Record<string, unknown>; outputVar: string }
  | { type: 'http'; url: string; method: string; headers?: Record<string, string>; body?: unknown; outputVar: string }
  | { type: 'notify'; channel: 'email' | 'slack' | 'webhook'; template: string; recipients: string[] }
  | { type: 'condition'; expression: string; trueBranch: WorkflowStep[]; falseBranch?: WorkflowStep[] };

export interface IntegrationRef {
  id: string;
  type: 'stripe' | 'sendgrid' | 'slack' | 'github' | 'custom';
  label: string;
  configKeys: string[];       // env var names required
}

export interface AppSpec {
  id: string;
  tenantId: string;
  appType: AppType;
  name: string;
  slug: string;               // URL-safe identifier
  description?: string;
  entities: EntityDef[];
  pages: PageDef[];
  routes: RouteDef[];
  permissions: RBACPolicy;
  workflows?: WorkflowDef[];
  integrations?: IntegrationRef[];
  theme?: {
    primaryColor?: string;
    fontFamily?: string;
    darkMode?: boolean;
  };
  meta: {
    createdAt: string;
    updatedAt: string;
    version: number;
    generatedBy: 'ai' | 'user' | 'template';
    templateId?: string;
  };
}
