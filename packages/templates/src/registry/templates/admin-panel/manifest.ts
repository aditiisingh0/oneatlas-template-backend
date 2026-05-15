// packages/templates/src/registry/templates/admin-panel/manifest.ts
import type { TemplateManifest } from '../../../types/template-manifest.js';

export const adminPanelTemplate: TemplateManifest = {
  id: 'admin-panel-full',
  name: 'Admin Panel',
  description: 'Full admin panel with user management, role-based access, and audit logs.',
  appType: 'admin-panel',
  version: '1.0.0',
  supportedFieldTypes: ['string', 'text', 'number', 'boolean', 'date', 'datetime', 'email', 'url', 'enum', 'relation', 'file', 'json'],
  requiredEntityCount: { min: 1, max: 30 },
  tags: ['admin', 'management', 'rbac', 'audit'],
  previewImageUrl: '/previews/admin-panel.png',
  envVars: ['DATABASE_URL', 'CLERK_SECRET_KEY', 'CLERK_PUBLISHABLE_KEY'],
  dependencies: [
    '@prisma/client', 'next', 'react', 'react-dom',
    '@clerk/nextjs', 'zod', 'react-hook-form', '@hookform/resolvers',
  ],
  devDependencies: ['prisma', 'typescript', '@types/react', '@types/node'],
  slots: [
    { id: 'ENTITY_NAME', description: 'PascalCase entity name', required: true, accepts: ['entity_name'] },
    { id: 'ENTITY_NAME_PLURAL', description: 'Plural entity name', required: true, accepts: ['entity_name'] },
    { id: 'TABLE_NAME', description: 'snake_case DB table name', required: true, accepts: ['entity_name'] },
    { id: 'FIELD_LIST', description: 'Field definitions', required: true, accepts: ['field_list'] },
    { id: 'ROLES', description: 'Role list', required: true, accepts: ['permission_list'] },
  ],
  files: [
    {
      relativePath: 'pages/admin/{{TABLE_NAME}}/index.tsx',
      category: 'page',
      slots: ['ENTITY_NAME', 'ENTITY_NAME_PLURAL', 'TABLE_NAME', 'FIELD_LIST'],
      isUserEditable: true,
      templateSource: 'admin-panel/pages/list',
    },
    {
      relativePath: 'pages/admin/users/index.tsx',
      category: 'page',
      slots: ['ROLES'],
      isUserEditable: true,
      templateSource: 'admin-panel/pages/users',
    },
    {
      relativePath: 'pages/api/admin/{{TABLE_NAME}}/index.ts',
      category: 'api',
      slots: ['ENTITY_NAME', 'TABLE_NAME', 'ROLES'],
      isUserEditable: false,
      templateSource: 'admin-panel/api/crud',
    },
    {
      relativePath: 'pages/api/admin/audit-log.ts',
      category: 'api',
      slots: [],
      isUserEditable: false,
      templateSource: 'admin-panel/api/audit-log',
    },
  ],
};
