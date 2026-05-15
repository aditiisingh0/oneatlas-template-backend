// packages/templates/src/types/template-manifest.ts
// ─── Template Manifest types — contract between template definitions and the loader ───

import type { AppType, FieldType } from './app-spec.js';

export interface SlotDef {
  id: string;
  description: string;
  required: boolean;
  accepts: SlotAcceptType[];
  defaultValue?: string;
}

export type SlotAcceptType =
  | 'field_list'
  | 'entity_name'
  | 'route_path'
  | 'component_name'
  | 'permission_list'
  | 'enum_values'
  | 'relation_ref'
  | 'custom_string';

export interface TemplateFile {
  relativePath: string;           // e.g. "pages/list.tsx"
  category: 'page' | 'api' | 'schema' | 'config' | 'middleware';
  slots: string[];                // slot IDs this file uses
  isUserEditable: boolean;        // if true, re-generation won't overwrite
  templateSource: string;         // raw template string with {{SLOT_ID}} markers
}

export interface TemplateManifest {
  id: string;                     // e.g. "crud-basic"
  name: string;                   // e.g. "Basic CRUD"
  description: string;
  appType: AppType;
  version: string;
  supportedFieldTypes: FieldType[];
  requiredEntityCount: { min: number; max: number };
  slots: SlotDef[];
  files: TemplateFile[];
  dependencies: string[];         // npm packages the generated app needs
  devDependencies: string[];
  envVars: string[];              // required env vars
  tags: string[];
  previewImageUrl?: string;
}
