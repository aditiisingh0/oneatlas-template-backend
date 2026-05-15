// packages/templates/src/types/render-manifest.ts
// ─── Render Manifest — tracks generated vs user-modified files ───

export type FileOrigin = 'template' | 'ai_generated' | 'user_modified' | 'composed';

export interface GeneratedFile {
  relativePath: string;
  content: string;
  origin: FileOrigin;
  templateId?: string;
  slotValues?: Record<string, string>;
  hash: string;               // sha256 of content — used for change detection
  generatedAt: string;
  lockedFromRegen: boolean;   // true if user has modified this file
}

export interface RenderManifest {
  appId: string;
  tenantId: string;
  templateId: string;
  version: number;
  files: GeneratedFile[];
  prismaSchema: string;       // full generated schema string
  envVarKeys: string[];       // list of env vars the app needs
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
