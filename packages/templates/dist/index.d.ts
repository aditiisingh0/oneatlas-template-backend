import { z } from 'zod';

type AppType = 'crud' | 'dashboard' | 'workflow' | 'admin-panel';
type FieldType = 'string' | 'text' | 'number' | 'boolean' | 'date' | 'datetime' | 'email' | 'url' | 'enum' | 'relation' | 'file' | 'json';
interface FieldDef {
    name: string;
    type: FieldType;
    label: string;
    required: boolean;
    unique?: boolean;
    default?: unknown;
    enumValues?: string[];
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
interface EntityDef {
    name: string;
    pluralName: string;
    tableName: string;
    fields: FieldDef[];
    softDelete?: boolean;
    timestamps?: boolean;
    tenantScoped?: boolean;
}
interface PageDef {
    id: string;
    path: string;
    component: string;
    pageType: 'list' | 'detail' | 'form' | 'dashboard' | 'custom';
    entityName?: string;
    title: string;
    icon?: string;
    permissions?: string[];
    slots?: Record<string, unknown>;
}
interface RouteDef {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    path: string;
    handler: string;
    entityName?: string;
    middlewares?: string[];
    rateLimit?: {
        requests: number;
        windowMs: number;
    };
}
interface RBACPolicy {
    roles: RoleDef[];
    entityPermissions: EntityPermission[];
}
interface RoleDef {
    name: string;
    description?: string;
    inherits?: string[];
}
interface EntityPermission {
    entityName: string;
    role: string;
    actions: ('create' | 'read' | 'update' | 'delete' | 'list')[];
}
interface WorkflowDef {
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
type WorkflowTrigger = {
    type: 'webhook';
    path: string;
    method: 'GET' | 'POST';
} | {
    type: 'schedule';
    cron: string;
} | {
    type: 'db_event';
    entityName: string;
    event: 'insert' | 'update' | 'delete';
} | {
    type: 'form_submit';
    formId: string;
};
type WorkflowStep = {
    type: 'ai';
    model: string;
    prompt: string;
    outputVar: string;
} | {
    type: 'db_query';
    entity: string;
    action: string;
    params: Record<string, unknown>;
    outputVar: string;
} | {
    type: 'http';
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: unknown;
    outputVar: string;
} | {
    type: 'notify';
    channel: 'email' | 'slack' | 'webhook';
    template: string;
    recipients: string[];
} | {
    type: 'condition';
    expression: string;
    trueBranch: WorkflowStep[];
    falseBranch?: WorkflowStep[];
};
interface IntegrationRef {
    id: string;
    type: 'stripe' | 'sendgrid' | 'slack' | 'github' | 'custom';
    label: string;
    configKeys: string[];
}
interface AppSpec {
    id: string;
    tenantId: string;
    appType: AppType;
    name: string;
    slug: string;
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

interface SlotDef {
    id: string;
    description: string;
    required: boolean;
    accepts: SlotAcceptType[];
    defaultValue?: string;
}
type SlotAcceptType = 'field_list' | 'entity_name' | 'route_path' | 'component_name' | 'permission_list' | 'enum_values' | 'relation_ref' | 'custom_string';
interface TemplateFile {
    relativePath: string;
    category: 'page' | 'api' | 'schema' | 'config' | 'middleware';
    slots: string[];
    isUserEditable: boolean;
    templateSource: string;
}
interface TemplateManifest {
    id: string;
    name: string;
    description: string;
    appType: AppType;
    version: string;
    supportedFieldTypes: FieldType[];
    requiredEntityCount: {
        min: number;
        max: number;
    };
    slots: SlotDef[];
    files: TemplateFile[];
    dependencies: string[];
    devDependencies: string[];
    envVars: string[];
    tags: string[];
    previewImageUrl?: string;
}

type FileOrigin = 'template' | 'ai_generated' | 'user_modified' | 'composed';
interface GeneratedFile {
    relativePath: string;
    content: string;
    origin: FileOrigin;
    templateId?: string;
    slotValues?: Record<string, string>;
    hash: string;
    generatedAt: string;
    lockedFromRegen: boolean;
}
interface RenderManifest {
    appId: string;
    tenantId: string;
    templateId: string;
    version: number;
    files: GeneratedFile[];
    prismaSchema: string;
    envVarKeys: string[];
    routes: {
        method: string;
        path: string;
        handlerFile: string;
    }[];
    pages: {
        path: string;
        componentFile: string;
    }[];
    generatedAt: string;
    bundleReady: boolean;
}

declare const FieldTypeSchema: z.ZodEnum<["string", "text", "number", "boolean", "date", "datetime", "email", "url", "enum", "relation", "file", "json"]>;
declare const FieldDefSchema: z.ZodObject<{
    name: z.ZodString;
    type: z.ZodEnum<["string", "text", "number", "boolean", "date", "datetime", "email", "url", "enum", "relation", "file", "json"]>;
    label: z.ZodString;
    required: z.ZodBoolean;
    unique: z.ZodOptional<z.ZodBoolean>;
    default: z.ZodOptional<z.ZodUnknown>;
    enumValues: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    relation: z.ZodOptional<z.ZodObject<{
        targetEntity: z.ZodString;
        type: z.ZodEnum<["one-to-one", "one-to-many", "many-to-many"]>;
        foreignKey: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        type: "one-to-one" | "one-to-many" | "many-to-many";
        targetEntity: string;
        foreignKey?: string | undefined;
    }, {
        type: "one-to-one" | "one-to-many" | "many-to-many";
        targetEntity: string;
        foreignKey?: string | undefined;
    }>>;
    validation: z.ZodOptional<z.ZodObject<{
        min: z.ZodOptional<z.ZodNumber>;
        max: z.ZodOptional<z.ZodNumber>;
        pattern: z.ZodOptional<z.ZodString>;
        message: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        message?: string | undefined;
        min?: number | undefined;
        max?: number | undefined;
        pattern?: string | undefined;
    }, {
        message?: string | undefined;
        min?: number | undefined;
        max?: number | undefined;
        pattern?: string | undefined;
    }>>;
    ui: z.ZodOptional<z.ZodObject<{
        placeholder: z.ZodOptional<z.ZodString>;
        helpText: z.ZodOptional<z.ZodString>;
        hidden: z.ZodOptional<z.ZodBoolean>;
        readOnly: z.ZodOptional<z.ZodBoolean>;
        order: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        placeholder?: string | undefined;
        helpText?: string | undefined;
        hidden?: boolean | undefined;
        readOnly?: boolean | undefined;
        order?: number | undefined;
    }, {
        placeholder?: string | undefined;
        helpText?: string | undefined;
        hidden?: boolean | undefined;
        readOnly?: boolean | undefined;
        order?: number | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    type: "string" | "number" | "boolean" | "text" | "date" | "datetime" | "email" | "url" | "enum" | "relation" | "file" | "json";
    label: string;
    required: boolean;
    relation?: {
        type: "one-to-one" | "one-to-many" | "many-to-many";
        targetEntity: string;
        foreignKey?: string | undefined;
    } | undefined;
    unique?: boolean | undefined;
    default?: unknown;
    validation?: {
        message?: string | undefined;
        min?: number | undefined;
        max?: number | undefined;
        pattern?: string | undefined;
    } | undefined;
    enumValues?: string[] | undefined;
    ui?: {
        placeholder?: string | undefined;
        helpText?: string | undefined;
        hidden?: boolean | undefined;
        readOnly?: boolean | undefined;
        order?: number | undefined;
    } | undefined;
}, {
    name: string;
    type: "string" | "number" | "boolean" | "text" | "date" | "datetime" | "email" | "url" | "enum" | "relation" | "file" | "json";
    label: string;
    required: boolean;
    relation?: {
        type: "one-to-one" | "one-to-many" | "many-to-many";
        targetEntity: string;
        foreignKey?: string | undefined;
    } | undefined;
    unique?: boolean | undefined;
    default?: unknown;
    validation?: {
        message?: string | undefined;
        min?: number | undefined;
        max?: number | undefined;
        pattern?: string | undefined;
    } | undefined;
    enumValues?: string[] | undefined;
    ui?: {
        placeholder?: string | undefined;
        helpText?: string | undefined;
        hidden?: boolean | undefined;
        readOnly?: boolean | undefined;
        order?: number | undefined;
    } | undefined;
}>;
declare const EntityDefSchema: z.ZodObject<{
    name: z.ZodString;
    pluralName: z.ZodString;
    tableName: z.ZodString;
    fields: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        type: z.ZodEnum<["string", "text", "number", "boolean", "date", "datetime", "email", "url", "enum", "relation", "file", "json"]>;
        label: z.ZodString;
        required: z.ZodBoolean;
        unique: z.ZodOptional<z.ZodBoolean>;
        default: z.ZodOptional<z.ZodUnknown>;
        enumValues: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        relation: z.ZodOptional<z.ZodObject<{
            targetEntity: z.ZodString;
            type: z.ZodEnum<["one-to-one", "one-to-many", "many-to-many"]>;
            foreignKey: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            type: "one-to-one" | "one-to-many" | "many-to-many";
            targetEntity: string;
            foreignKey?: string | undefined;
        }, {
            type: "one-to-one" | "one-to-many" | "many-to-many";
            targetEntity: string;
            foreignKey?: string | undefined;
        }>>;
        validation: z.ZodOptional<z.ZodObject<{
            min: z.ZodOptional<z.ZodNumber>;
            max: z.ZodOptional<z.ZodNumber>;
            pattern: z.ZodOptional<z.ZodString>;
            message: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            message?: string | undefined;
            min?: number | undefined;
            max?: number | undefined;
            pattern?: string | undefined;
        }, {
            message?: string | undefined;
            min?: number | undefined;
            max?: number | undefined;
            pattern?: string | undefined;
        }>>;
        ui: z.ZodOptional<z.ZodObject<{
            placeholder: z.ZodOptional<z.ZodString>;
            helpText: z.ZodOptional<z.ZodString>;
            hidden: z.ZodOptional<z.ZodBoolean>;
            readOnly: z.ZodOptional<z.ZodBoolean>;
            order: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            placeholder?: string | undefined;
            helpText?: string | undefined;
            hidden?: boolean | undefined;
            readOnly?: boolean | undefined;
            order?: number | undefined;
        }, {
            placeholder?: string | undefined;
            helpText?: string | undefined;
            hidden?: boolean | undefined;
            readOnly?: boolean | undefined;
            order?: number | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        type: "string" | "number" | "boolean" | "text" | "date" | "datetime" | "email" | "url" | "enum" | "relation" | "file" | "json";
        label: string;
        required: boolean;
        relation?: {
            type: "one-to-one" | "one-to-many" | "many-to-many";
            targetEntity: string;
            foreignKey?: string | undefined;
        } | undefined;
        unique?: boolean | undefined;
        default?: unknown;
        validation?: {
            message?: string | undefined;
            min?: number | undefined;
            max?: number | undefined;
            pattern?: string | undefined;
        } | undefined;
        enumValues?: string[] | undefined;
        ui?: {
            placeholder?: string | undefined;
            helpText?: string | undefined;
            hidden?: boolean | undefined;
            readOnly?: boolean | undefined;
            order?: number | undefined;
        } | undefined;
    }, {
        name: string;
        type: "string" | "number" | "boolean" | "text" | "date" | "datetime" | "email" | "url" | "enum" | "relation" | "file" | "json";
        label: string;
        required: boolean;
        relation?: {
            type: "one-to-one" | "one-to-many" | "many-to-many";
            targetEntity: string;
            foreignKey?: string | undefined;
        } | undefined;
        unique?: boolean | undefined;
        default?: unknown;
        validation?: {
            message?: string | undefined;
            min?: number | undefined;
            max?: number | undefined;
            pattern?: string | undefined;
        } | undefined;
        enumValues?: string[] | undefined;
        ui?: {
            placeholder?: string | undefined;
            helpText?: string | undefined;
            hidden?: boolean | undefined;
            readOnly?: boolean | undefined;
            order?: number | undefined;
        } | undefined;
    }>, "many">;
    softDelete: z.ZodOptional<z.ZodBoolean>;
    timestamps: z.ZodOptional<z.ZodBoolean>;
    tenantScoped: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    name: string;
    pluralName: string;
    tableName: string;
    fields: {
        name: string;
        type: "string" | "number" | "boolean" | "text" | "date" | "datetime" | "email" | "url" | "enum" | "relation" | "file" | "json";
        label: string;
        required: boolean;
        relation?: {
            type: "one-to-one" | "one-to-many" | "many-to-many";
            targetEntity: string;
            foreignKey?: string | undefined;
        } | undefined;
        unique?: boolean | undefined;
        default?: unknown;
        validation?: {
            message?: string | undefined;
            min?: number | undefined;
            max?: number | undefined;
            pattern?: string | undefined;
        } | undefined;
        enumValues?: string[] | undefined;
        ui?: {
            placeholder?: string | undefined;
            helpText?: string | undefined;
            hidden?: boolean | undefined;
            readOnly?: boolean | undefined;
            order?: number | undefined;
        } | undefined;
    }[];
    softDelete?: boolean | undefined;
    timestamps?: boolean | undefined;
    tenantScoped?: boolean | undefined;
}, {
    name: string;
    pluralName: string;
    tableName: string;
    fields: {
        name: string;
        type: "string" | "number" | "boolean" | "text" | "date" | "datetime" | "email" | "url" | "enum" | "relation" | "file" | "json";
        label: string;
        required: boolean;
        relation?: {
            type: "one-to-one" | "one-to-many" | "many-to-many";
            targetEntity: string;
            foreignKey?: string | undefined;
        } | undefined;
        unique?: boolean | undefined;
        default?: unknown;
        validation?: {
            message?: string | undefined;
            min?: number | undefined;
            max?: number | undefined;
            pattern?: string | undefined;
        } | undefined;
        enumValues?: string[] | undefined;
        ui?: {
            placeholder?: string | undefined;
            helpText?: string | undefined;
            hidden?: boolean | undefined;
            readOnly?: boolean | undefined;
            order?: number | undefined;
        } | undefined;
    }[];
    softDelete?: boolean | undefined;
    timestamps?: boolean | undefined;
    tenantScoped?: boolean | undefined;
}>;
declare const PageDefSchema: z.ZodObject<{
    id: z.ZodString;
    path: z.ZodString;
    component: z.ZodString;
    pageType: z.ZodEnum<["list", "detail", "form", "dashboard", "custom"]>;
    entityName: z.ZodOptional<z.ZodString>;
    title: z.ZodString;
    icon: z.ZodOptional<z.ZodString>;
    permissions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    slots: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    path: string;
    id: string;
    component: string;
    pageType: "dashboard" | "list" | "detail" | "form" | "custom";
    title: string;
    entityName?: string | undefined;
    icon?: string | undefined;
    permissions?: string[] | undefined;
    slots?: Record<string, unknown> | undefined;
}, {
    path: string;
    id: string;
    component: string;
    pageType: "dashboard" | "list" | "detail" | "form" | "custom";
    title: string;
    entityName?: string | undefined;
    icon?: string | undefined;
    permissions?: string[] | undefined;
    slots?: Record<string, unknown> | undefined;
}>;
declare const RouteDefSchema: z.ZodObject<{
    method: z.ZodEnum<["GET", "POST", "PUT", "PATCH", "DELETE"]>;
    path: z.ZodString;
    handler: z.ZodString;
    entityName: z.ZodOptional<z.ZodString>;
    middlewares: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    rateLimit: z.ZodOptional<z.ZodObject<{
        requests: z.ZodNumber;
        windowMs: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        requests: number;
        windowMs: number;
    }, {
        requests: number;
        windowMs: number;
    }>>;
}, "strip", z.ZodTypeAny, {
    path: string;
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    handler: string;
    entityName?: string | undefined;
    middlewares?: string[] | undefined;
    rateLimit?: {
        requests: number;
        windowMs: number;
    } | undefined;
}, {
    path: string;
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    handler: string;
    entityName?: string | undefined;
    middlewares?: string[] | undefined;
    rateLimit?: {
        requests: number;
        windowMs: number;
    } | undefined;
}>;
declare const RBACPolicySchema: z.ZodObject<{
    roles: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        description: z.ZodOptional<z.ZodString>;
        inherits: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        description?: string | undefined;
        inherits?: string[] | undefined;
    }, {
        name: string;
        description?: string | undefined;
        inherits?: string[] | undefined;
    }>, "many">;
    entityPermissions: z.ZodArray<z.ZodObject<{
        entityName: z.ZodString;
        role: z.ZodString;
        actions: z.ZodArray<z.ZodEnum<["create", "read", "update", "delete", "list"]>, "many">;
    }, "strip", z.ZodTypeAny, {
        entityName: string;
        role: string;
        actions: ("list" | "create" | "read" | "update" | "delete")[];
    }, {
        entityName: string;
        role: string;
        actions: ("list" | "create" | "read" | "update" | "delete")[];
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    roles: {
        name: string;
        description?: string | undefined;
        inherits?: string[] | undefined;
    }[];
    entityPermissions: {
        entityName: string;
        role: string;
        actions: ("list" | "create" | "read" | "update" | "delete")[];
    }[];
}, {
    roles: {
        name: string;
        description?: string | undefined;
        inherits?: string[] | undefined;
    }[];
    entityPermissions: {
        entityName: string;
        role: string;
        actions: ("list" | "create" | "read" | "update" | "delete")[];
    }[];
}>;
declare const AppSpecSchema: z.ZodObject<{
    id: z.ZodString;
    tenantId: z.ZodString;
    appType: z.ZodEnum<["crud", "dashboard", "workflow", "admin-panel"]>;
    name: z.ZodString;
    slug: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    entities: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        pluralName: z.ZodString;
        tableName: z.ZodString;
        fields: z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            type: z.ZodEnum<["string", "text", "number", "boolean", "date", "datetime", "email", "url", "enum", "relation", "file", "json"]>;
            label: z.ZodString;
            required: z.ZodBoolean;
            unique: z.ZodOptional<z.ZodBoolean>;
            default: z.ZodOptional<z.ZodUnknown>;
            enumValues: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            relation: z.ZodOptional<z.ZodObject<{
                targetEntity: z.ZodString;
                type: z.ZodEnum<["one-to-one", "one-to-many", "many-to-many"]>;
                foreignKey: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                type: "one-to-one" | "one-to-many" | "many-to-many";
                targetEntity: string;
                foreignKey?: string | undefined;
            }, {
                type: "one-to-one" | "one-to-many" | "many-to-many";
                targetEntity: string;
                foreignKey?: string | undefined;
            }>>;
            validation: z.ZodOptional<z.ZodObject<{
                min: z.ZodOptional<z.ZodNumber>;
                max: z.ZodOptional<z.ZodNumber>;
                pattern: z.ZodOptional<z.ZodString>;
                message: z.ZodOptional<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                message?: string | undefined;
                min?: number | undefined;
                max?: number | undefined;
                pattern?: string | undefined;
            }, {
                message?: string | undefined;
                min?: number | undefined;
                max?: number | undefined;
                pattern?: string | undefined;
            }>>;
            ui: z.ZodOptional<z.ZodObject<{
                placeholder: z.ZodOptional<z.ZodString>;
                helpText: z.ZodOptional<z.ZodString>;
                hidden: z.ZodOptional<z.ZodBoolean>;
                readOnly: z.ZodOptional<z.ZodBoolean>;
                order: z.ZodOptional<z.ZodNumber>;
            }, "strip", z.ZodTypeAny, {
                placeholder?: string | undefined;
                helpText?: string | undefined;
                hidden?: boolean | undefined;
                readOnly?: boolean | undefined;
                order?: number | undefined;
            }, {
                placeholder?: string | undefined;
                helpText?: string | undefined;
                hidden?: boolean | undefined;
                readOnly?: boolean | undefined;
                order?: number | undefined;
            }>>;
        }, "strip", z.ZodTypeAny, {
            name: string;
            type: "string" | "number" | "boolean" | "text" | "date" | "datetime" | "email" | "url" | "enum" | "relation" | "file" | "json";
            label: string;
            required: boolean;
            relation?: {
                type: "one-to-one" | "one-to-many" | "many-to-many";
                targetEntity: string;
                foreignKey?: string | undefined;
            } | undefined;
            unique?: boolean | undefined;
            default?: unknown;
            validation?: {
                message?: string | undefined;
                min?: number | undefined;
                max?: number | undefined;
                pattern?: string | undefined;
            } | undefined;
            enumValues?: string[] | undefined;
            ui?: {
                placeholder?: string | undefined;
                helpText?: string | undefined;
                hidden?: boolean | undefined;
                readOnly?: boolean | undefined;
                order?: number | undefined;
            } | undefined;
        }, {
            name: string;
            type: "string" | "number" | "boolean" | "text" | "date" | "datetime" | "email" | "url" | "enum" | "relation" | "file" | "json";
            label: string;
            required: boolean;
            relation?: {
                type: "one-to-one" | "one-to-many" | "many-to-many";
                targetEntity: string;
                foreignKey?: string | undefined;
            } | undefined;
            unique?: boolean | undefined;
            default?: unknown;
            validation?: {
                message?: string | undefined;
                min?: number | undefined;
                max?: number | undefined;
                pattern?: string | undefined;
            } | undefined;
            enumValues?: string[] | undefined;
            ui?: {
                placeholder?: string | undefined;
                helpText?: string | undefined;
                hidden?: boolean | undefined;
                readOnly?: boolean | undefined;
                order?: number | undefined;
            } | undefined;
        }>, "many">;
        softDelete: z.ZodOptional<z.ZodBoolean>;
        timestamps: z.ZodOptional<z.ZodBoolean>;
        tenantScoped: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        pluralName: string;
        tableName: string;
        fields: {
            name: string;
            type: "string" | "number" | "boolean" | "text" | "date" | "datetime" | "email" | "url" | "enum" | "relation" | "file" | "json";
            label: string;
            required: boolean;
            relation?: {
                type: "one-to-one" | "one-to-many" | "many-to-many";
                targetEntity: string;
                foreignKey?: string | undefined;
            } | undefined;
            unique?: boolean | undefined;
            default?: unknown;
            validation?: {
                message?: string | undefined;
                min?: number | undefined;
                max?: number | undefined;
                pattern?: string | undefined;
            } | undefined;
            enumValues?: string[] | undefined;
            ui?: {
                placeholder?: string | undefined;
                helpText?: string | undefined;
                hidden?: boolean | undefined;
                readOnly?: boolean | undefined;
                order?: number | undefined;
            } | undefined;
        }[];
        softDelete?: boolean | undefined;
        timestamps?: boolean | undefined;
        tenantScoped?: boolean | undefined;
    }, {
        name: string;
        pluralName: string;
        tableName: string;
        fields: {
            name: string;
            type: "string" | "number" | "boolean" | "text" | "date" | "datetime" | "email" | "url" | "enum" | "relation" | "file" | "json";
            label: string;
            required: boolean;
            relation?: {
                type: "one-to-one" | "one-to-many" | "many-to-many";
                targetEntity: string;
                foreignKey?: string | undefined;
            } | undefined;
            unique?: boolean | undefined;
            default?: unknown;
            validation?: {
                message?: string | undefined;
                min?: number | undefined;
                max?: number | undefined;
                pattern?: string | undefined;
            } | undefined;
            enumValues?: string[] | undefined;
            ui?: {
                placeholder?: string | undefined;
                helpText?: string | undefined;
                hidden?: boolean | undefined;
                readOnly?: boolean | undefined;
                order?: number | undefined;
            } | undefined;
        }[];
        softDelete?: boolean | undefined;
        timestamps?: boolean | undefined;
        tenantScoped?: boolean | undefined;
    }>, "many">;
    pages: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        path: z.ZodString;
        component: z.ZodString;
        pageType: z.ZodEnum<["list", "detail", "form", "dashboard", "custom"]>;
        entityName: z.ZodOptional<z.ZodString>;
        title: z.ZodString;
        icon: z.ZodOptional<z.ZodString>;
        permissions: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        slots: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        path: string;
        id: string;
        component: string;
        pageType: "dashboard" | "list" | "detail" | "form" | "custom";
        title: string;
        entityName?: string | undefined;
        icon?: string | undefined;
        permissions?: string[] | undefined;
        slots?: Record<string, unknown> | undefined;
    }, {
        path: string;
        id: string;
        component: string;
        pageType: "dashboard" | "list" | "detail" | "form" | "custom";
        title: string;
        entityName?: string | undefined;
        icon?: string | undefined;
        permissions?: string[] | undefined;
        slots?: Record<string, unknown> | undefined;
    }>, "many">;
    routes: z.ZodArray<z.ZodObject<{
        method: z.ZodEnum<["GET", "POST", "PUT", "PATCH", "DELETE"]>;
        path: z.ZodString;
        handler: z.ZodString;
        entityName: z.ZodOptional<z.ZodString>;
        middlewares: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        rateLimit: z.ZodOptional<z.ZodObject<{
            requests: z.ZodNumber;
            windowMs: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            requests: number;
            windowMs: number;
        }, {
            requests: number;
            windowMs: number;
        }>>;
    }, "strip", z.ZodTypeAny, {
        path: string;
        method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
        handler: string;
        entityName?: string | undefined;
        middlewares?: string[] | undefined;
        rateLimit?: {
            requests: number;
            windowMs: number;
        } | undefined;
    }, {
        path: string;
        method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
        handler: string;
        entityName?: string | undefined;
        middlewares?: string[] | undefined;
        rateLimit?: {
            requests: number;
            windowMs: number;
        } | undefined;
    }>, "many">;
    permissions: z.ZodObject<{
        roles: z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            description: z.ZodOptional<z.ZodString>;
            inherits: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            name: string;
            description?: string | undefined;
            inherits?: string[] | undefined;
        }, {
            name: string;
            description?: string | undefined;
            inherits?: string[] | undefined;
        }>, "many">;
        entityPermissions: z.ZodArray<z.ZodObject<{
            entityName: z.ZodString;
            role: z.ZodString;
            actions: z.ZodArray<z.ZodEnum<["create", "read", "update", "delete", "list"]>, "many">;
        }, "strip", z.ZodTypeAny, {
            entityName: string;
            role: string;
            actions: ("list" | "create" | "read" | "update" | "delete")[];
        }, {
            entityName: string;
            role: string;
            actions: ("list" | "create" | "read" | "update" | "delete")[];
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        roles: {
            name: string;
            description?: string | undefined;
            inherits?: string[] | undefined;
        }[];
        entityPermissions: {
            entityName: string;
            role: string;
            actions: ("list" | "create" | "read" | "update" | "delete")[];
        }[];
    }, {
        roles: {
            name: string;
            description?: string | undefined;
            inherits?: string[] | undefined;
        }[];
        entityPermissions: {
            entityName: string;
            role: string;
            actions: ("list" | "create" | "read" | "update" | "delete")[];
        }[];
    }>;
    workflows: z.ZodOptional<z.ZodArray<z.ZodAny, "many">>;
    integrations: z.ZodOptional<z.ZodArray<z.ZodAny, "many">>;
    theme: z.ZodOptional<z.ZodObject<{
        primaryColor: z.ZodOptional<z.ZodString>;
        fontFamily: z.ZodOptional<z.ZodString>;
        darkMode: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        primaryColor?: string | undefined;
        fontFamily?: string | undefined;
        darkMode?: boolean | undefined;
    }, {
        primaryColor?: string | undefined;
        fontFamily?: string | undefined;
        darkMode?: boolean | undefined;
    }>>;
    meta: z.ZodObject<{
        createdAt: z.ZodString;
        updatedAt: z.ZodString;
        version: z.ZodNumber;
        generatedBy: z.ZodEnum<["ai", "user", "template"]>;
        templateId: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        createdAt: string;
        updatedAt: string;
        version: number;
        generatedBy: "ai" | "user" | "template";
        templateId?: string | undefined;
    }, {
        createdAt: string;
        updatedAt: string;
        version: number;
        generatedBy: "ai" | "user" | "template";
        templateId?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    name: string;
    id: string;
    permissions: {
        roles: {
            name: string;
            description?: string | undefined;
            inherits?: string[] | undefined;
        }[];
        entityPermissions: {
            entityName: string;
            role: string;
            actions: ("list" | "create" | "read" | "update" | "delete")[];
        }[];
    };
    tenantId: string;
    appType: "crud" | "dashboard" | "workflow" | "admin-panel";
    slug: string;
    entities: {
        name: string;
        pluralName: string;
        tableName: string;
        fields: {
            name: string;
            type: "string" | "number" | "boolean" | "text" | "date" | "datetime" | "email" | "url" | "enum" | "relation" | "file" | "json";
            label: string;
            required: boolean;
            relation?: {
                type: "one-to-one" | "one-to-many" | "many-to-many";
                targetEntity: string;
                foreignKey?: string | undefined;
            } | undefined;
            unique?: boolean | undefined;
            default?: unknown;
            validation?: {
                message?: string | undefined;
                min?: number | undefined;
                max?: number | undefined;
                pattern?: string | undefined;
            } | undefined;
            enumValues?: string[] | undefined;
            ui?: {
                placeholder?: string | undefined;
                helpText?: string | undefined;
                hidden?: boolean | undefined;
                readOnly?: boolean | undefined;
                order?: number | undefined;
            } | undefined;
        }[];
        softDelete?: boolean | undefined;
        timestamps?: boolean | undefined;
        tenantScoped?: boolean | undefined;
    }[];
    pages: {
        path: string;
        id: string;
        component: string;
        pageType: "dashboard" | "list" | "detail" | "form" | "custom";
        title: string;
        entityName?: string | undefined;
        icon?: string | undefined;
        permissions?: string[] | undefined;
        slots?: Record<string, unknown> | undefined;
    }[];
    routes: {
        path: string;
        method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
        handler: string;
        entityName?: string | undefined;
        middlewares?: string[] | undefined;
        rateLimit?: {
            requests: number;
            windowMs: number;
        } | undefined;
    }[];
    meta: {
        createdAt: string;
        updatedAt: string;
        version: number;
        generatedBy: "ai" | "user" | "template";
        templateId?: string | undefined;
    };
    description?: string | undefined;
    workflows?: any[] | undefined;
    integrations?: any[] | undefined;
    theme?: {
        primaryColor?: string | undefined;
        fontFamily?: string | undefined;
        darkMode?: boolean | undefined;
    } | undefined;
}, {
    name: string;
    id: string;
    permissions: {
        roles: {
            name: string;
            description?: string | undefined;
            inherits?: string[] | undefined;
        }[];
        entityPermissions: {
            entityName: string;
            role: string;
            actions: ("list" | "create" | "read" | "update" | "delete")[];
        }[];
    };
    tenantId: string;
    appType: "crud" | "dashboard" | "workflow" | "admin-panel";
    slug: string;
    entities: {
        name: string;
        pluralName: string;
        tableName: string;
        fields: {
            name: string;
            type: "string" | "number" | "boolean" | "text" | "date" | "datetime" | "email" | "url" | "enum" | "relation" | "file" | "json";
            label: string;
            required: boolean;
            relation?: {
                type: "one-to-one" | "one-to-many" | "many-to-many";
                targetEntity: string;
                foreignKey?: string | undefined;
            } | undefined;
            unique?: boolean | undefined;
            default?: unknown;
            validation?: {
                message?: string | undefined;
                min?: number | undefined;
                max?: number | undefined;
                pattern?: string | undefined;
            } | undefined;
            enumValues?: string[] | undefined;
            ui?: {
                placeholder?: string | undefined;
                helpText?: string | undefined;
                hidden?: boolean | undefined;
                readOnly?: boolean | undefined;
                order?: number | undefined;
            } | undefined;
        }[];
        softDelete?: boolean | undefined;
        timestamps?: boolean | undefined;
        tenantScoped?: boolean | undefined;
    }[];
    pages: {
        path: string;
        id: string;
        component: string;
        pageType: "dashboard" | "list" | "detail" | "form" | "custom";
        title: string;
        entityName?: string | undefined;
        icon?: string | undefined;
        permissions?: string[] | undefined;
        slots?: Record<string, unknown> | undefined;
    }[];
    routes: {
        path: string;
        method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
        handler: string;
        entityName?: string | undefined;
        middlewares?: string[] | undefined;
        rateLimit?: {
            requests: number;
            windowMs: number;
        } | undefined;
    }[];
    meta: {
        createdAt: string;
        updatedAt: string;
        version: number;
        generatedBy: "ai" | "user" | "template";
        templateId?: string | undefined;
    };
    description?: string | undefined;
    workflows?: any[] | undefined;
    integrations?: any[] | undefined;
    theme?: {
        primaryColor?: string | undefined;
        fontFamily?: string | undefined;
        darkMode?: boolean | undefined;
    } | undefined;
}>;
type AppSpecInput = z.input<typeof AppSpecSchema>;
type AppSpecOutput = z.output<typeof AppSpecSchema>;

declare function generateAppSpec(userPrompt: string, tenantId: string, options?: {
    model?: 'claude-haiku-4-5-20251001' | 'claude-sonnet-4-6';
    maxRetries?: number;
}): Promise<AppSpec>;
declare function refineAppSpec(existingSpec: AppSpec, refinementPrompt: string): Promise<AppSpec>;
declare function diffSpecs(prev: AppSpec, next: AppSpec): {
    addedEntities: string[];
    removedEntities: string[];
    modifiedEntities: string[];
    addedPages: string[];
    removedPages: string[];
    addedRoutes: string[];
    removedRoutes: string[];
};
declare function buildSpecFromEntities(tenantId: string, appName: string, appType: AppSpec['appType'], entities: EntityDef[]): AppSpec;

declare const REGISTRY: Map<string, TemplateManifest>;
declare function getTemplate(id: string): TemplateManifest;
declare function listTemplates(filter?: {
    appType?: AppType;
    tags?: string[];
}): TemplateManifest[];
declare function resolveTemplate(appType: AppType, entityCount: number): TemplateManifest;
declare function registerTemplate(manifest: TemplateManifest): void;

declare function loadTemplate(spec: AppSpec, existingManifest?: RenderManifest): Promise<RenderManifest>;
declare function generateAppShellFiles(spec: AppSpec, templateId: string): GeneratedFile[];

declare function generateFullPrismaSchema(entities: EntityDef[], tenantId?: string): string;
declare function generateZodSchema(entity: EntityDef): string;
declare function generateTypeScriptInterface(entity: EntityDef): string;
declare function computeSlotValues(entity: EntityDef): Record<string, string>;

declare function patchSlots(templateSource: string, slotValues: Record<string, string>): string;
declare function smartPatch(existingFile: GeneratedFile, newSlotValues: Record<string, string>, templateSource: string): GeneratedFile;
declare function diffFileSets(existing: GeneratedFile[], incoming: Omit<GeneratedFile, 'hash' | 'generatedAt'>[]): {
    toAdd: typeof incoming;
    toUpdate: typeof incoming;
    toDelete: GeneratedFile[];
    unchanged: GeneratedFile[];
};
declare function sha256(content: string): string;
declare function generateFileFromTemplate(templateSource: string, slotValues: Record<string, string>, relativePath: string, templateId: string): GeneratedFile;

interface HydrationEntity {
    name: string;
    pluralName: string;
    tableName: string;
    apiPath: string;
    pages: {
        list: string;
        detail: string;
        form: string;
    };
    fields: HydrationField[];
    tenantScoped: boolean;
    softDelete: boolean;
}
interface HydrationField {
    name: string;
    label: string;
    type: FieldDef['type'];
    required: boolean;
    unique: boolean;
    inputType: string;
    showInTable: boolean;
    showInForm: boolean;
    enumValues?: string[];
}
interface HydrationManifest {
    appId: string;
    appName: string;
    appType: AppSpec['appType'];
    tenantId: string;
    generatedAt: string;
    entities: HydrationEntity[];
    routes: {
        method: string;
        path: string;
    }[];
    roles: string[];
}
declare function generateHydrationManifest(spec: AppSpec): HydrationManifest;
declare function serializeHydrationManifest(manifest: HydrationManifest): string;
declare function generateHydrationModule(manifest: HydrationManifest): string;

interface ComponentRegistryEntry {
    entityName: string;
    tableName: string;
    components: {
        ListPage: string;
        DetailPage: string;
        FormPage: string;
    };
    apiPath: string;
}
declare function generateComponentRegistryModule(spec: AppSpec): string;
declare function generateDynamicListPageShell(): string;
declare function generateDynamicDetailPageShell(): string;
declare function generateDynamicFormPageShell(): string;

interface BundleResult {
    appId: string;
    tenantId: string;
    files: {
        path: string;
        content: string;
    }[];
    prismaSchema: string;
    packageJson: string;
    envVarKeys: string[];
    bundleHash: string;
    composedAt: string;
}
declare function composeBundle(spec: AppSpec, manifest: RenderManifest): BundleResult;
declare function serializeManifest(manifest: RenderManifest): string;
declare function deserializeManifest(json: string): RenderManifest;

interface PreviewRequest {
    appId: string;
    tenantId: string;
    bundle: BundleResult;
    ttlSeconds?: number;
}
interface PreviewResponse {
    previewId: string;
    previewUrl: string;
    ttlSeconds: number;
    expiresAt: string;
    mockDataSeeded: boolean;
}
interface PreviewStore {
    get(previewId: string): Promise<PreviewSession | null>;
    set(previewId: string, session: PreviewSession, ttlSeconds: number): Promise<void>;
    delete(previewId: string): Promise<void>;
    list(tenantId: string): Promise<string[]>;
}
interface PreviewSession {
    previewId: string;
    appId: string;
    tenantId: string;
    previewUrl: string;
    createdAt: string;
    expiresAt: string;
    mockState: Record<string, unknown[]>;
    status: 'provisioning' | 'ready' | 'expired';
}
declare class PreviewEngine {
    private store;
    private basePreviewDomain;
    constructor(options?: {
        store?: PreviewStore;
        basePreviewDomain?: string;
    });
    createPreview(req: PreviewRequest): Promise<PreviewResponse>;
    getPreview(previewId: string): Promise<PreviewSession | null>;
    destroyPreview(previewId: string): Promise<void>;
    extendPreview(previewId: string, additionalSeconds: number): Promise<void>;
    handleMockRequest(previewId: string, method: string, path: string, body?: unknown): Promise<{
        status: number;
        data: unknown;
    }>;
}
declare const previewEngine: PreviewEngine;

declare class RedisPreviewStore implements PreviewStore {
    private redis;
    constructor(options?: {
        url?: string;
        token?: string;
    });
    get(previewId: string): Promise<PreviewSession | null>;
    set(previewId: string, session: PreviewSession, ttlSeconds: number): Promise<void>;
    delete(previewId: string): Promise<void>;
    list(tenantId: string): Promise<string[]>;
}

interface RenderedPage {
    html: string;
    statusCode: number;
}
declare function renderPreviewPage(session: PreviewSession, urlPath: string, basePreviewUrl: string): RenderedPage;

type DeploymentStatus = 'queued' | 'building' | 'deploying' | 'live' | 'failed' | 'rolled_back';
interface DeploymentRecord {
    deploymentId: string;
    appId: string;
    tenantId: string;
    slug: string;
    url: string;
    status: DeploymentStatus;
    bundleHash: string;
    version: number;
    createdAt: string;
    updatedAt: string;
    completedAt?: string;
    error?: string;
    cfDeploymentId?: string;
    cfProjectName?: string;
}
interface DeployRequest {
    appId: string;
    tenantId: string;
    slug: string;
    bundle: BundleResult;
    cfAccountId: string;
    cfApiToken: string;
    baseDomain?: string;
}
interface DeployResult {
    deploymentId: string;
    url: string;
    status: DeploymentStatus;
    cfDeploymentId?: string;
}
declare class DeploymentEngine {
    private deployments;
    private baseDomain;
    constructor(options?: {
        baseDomain?: string;
    });
    deploy(req: DeployRequest): Promise<DeployResult>;
    private runDeploymentPipeline;
    private buildBundle;
    private deployToCloudflare;
    getDeployment(deploymentId: string): Promise<DeploymentRecord | null>;
    listDeployments(appId: string): Promise<DeploymentRecord[]>;
    rollback(appId: string, targetVersion: number): Promise<DeployResult | null>;
    private updateStatus;
    private getNextVersion;
}
declare const deploymentEngine: DeploymentEngine;

type WorkflowRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'retrying';
interface WorkflowRun {
    runId: string;
    workflowId: string;
    appId: string;
    tenantId: string;
    triggerPayload: unknown;
    status: WorkflowRunStatus;
    currentStep: number;
    stepResults: StepResult[];
    context: Record<string, unknown>;
    startedAt: string;
    completedAt?: string;
    error?: string;
    retryCount: number;
}
interface StepResult {
    stepIndex: number;
    type: string;
    status: 'success' | 'failed' | 'skipped';
    outputVar?: string;
    output?: unknown;
    error?: string;
    durationMs: number;
    executedAt: string;
}
declare class WorkflowExecutor {
    private runs;
    startRun(workflow: WorkflowDef, appId: string, tenantId: string, triggerPayload: unknown): Promise<WorkflowRun>;
    private executeRun;
    getRun(runId: string): WorkflowRun | null;
    listRuns(workflowId: string): WorkflowRun[];
}
declare function evaluateCondition(expression: string, context: Record<string, unknown>): boolean;
declare function matchesTrigger(trigger: WorkflowTrigger, requestMethod: string, requestPath: string): boolean;
declare const workflowExecutor: WorkflowExecutor;

interface GenerateOptions {
    userPrompt?: string;
    entities?: EntityDef[];
    tenantId: string;
    appName?: string;
    appType?: AppSpec['appType'];
    existingSpec?: AppSpec;
    existingManifestJson?: string;
}
interface PipelineResult {
    spec: AppSpec;
    manifest: RenderManifest;
    manifestJson: string;
    fileCount: number;
    entities: string[];
    routes: string[];
    preview?: PreviewResponse;
}
declare function runGenerationPipeline(opts: GenerateOptions): Promise<PipelineResult>;
declare function runPreviewPipeline(opts: GenerateOptions & {
    ttlSeconds?: number;
}): Promise<PipelineResult>;
declare function runDeployPipeline(opts: GenerateOptions & {
    slug: string;
    cfAccountId: string;
    cfApiToken: string;
}): Promise<{
    pipelineResult: PipelineResult;
    deployment: DeployResult;
}>;
declare function runIncrementalUpdate(existingSpec: AppSpec, existingManifestJson: string, refinementPrompt: string): Promise<{
    result: PipelineResult;
    diff: ReturnType<typeof diffSpecs>;
}>;

export { type AppSpec, type AppSpecInput, type AppSpecOutput, AppSpecSchema, type AppType, type BundleResult, type ComponentRegistryEntry, type DeployRequest, type DeployResult, DeploymentEngine, type DeploymentRecord, type DeploymentStatus, type EntityDef, EntityDefSchema, type EntityPermission, type FieldDef, FieldDefSchema, type FieldType, FieldTypeSchema, type FileOrigin, type GenerateOptions, type GeneratedFile, type HydrationEntity, type HydrationField, type HydrationManifest, type IntegrationRef, type PageDef, PageDefSchema, type PipelineResult, PreviewEngine, type PreviewRequest, type PreviewResponse, type PreviewSession, type PreviewStore, type RBACPolicy, RBACPolicySchema, REGISTRY, RedisPreviewStore, type RenderManifest, type RenderedPage, type RoleDef, type RouteDef, RouteDefSchema, type SlotAcceptType, type SlotDef, type StepResult, type TemplateFile, type TemplateManifest, type WorkflowDef, WorkflowExecutor, type WorkflowRun, type WorkflowStep, type WorkflowTrigger, buildSpecFromEntities, composeBundle, computeSlotValues, deploymentEngine, deserializeManifest, diffFileSets, diffSpecs, evaluateCondition, generateAppShellFiles, generateAppSpec, generateComponentRegistryModule, generateDynamicDetailPageShell, generateDynamicFormPageShell, generateDynamicListPageShell, generateFileFromTemplate, generateFullPrismaSchema, generateHydrationManifest, generateHydrationModule, generateTypeScriptInterface, generateZodSchema, getTemplate, listTemplates, loadTemplate, matchesTrigger, patchSlots, previewEngine, refineAppSpec, registerTemplate, renderPreviewPage, resolveTemplate, runDeployPipeline, runGenerationPipeline, runIncrementalUpdate, runPreviewPipeline, serializeHydrationManifest, serializeManifest, sha256, smartPatch, workflowExecutor };
