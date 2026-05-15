// packages/templates/src/registry/templates/crud/manifest.ts
import type { TemplateManifest } from '../../../types/template-manifest.js';

export const crudTemplate: TemplateManifest = {
  id: 'crud-basic',
  name: 'Basic CRUD',
  description: 'A fully functional CRUD app with list, detail, and form pages for each entity.',
  appType: 'crud',
  version: '1.0.0',
  supportedFieldTypes: ['string', 'text', 'number', 'boolean', 'date', 'datetime', 'email', 'url', 'enum', 'relation', 'file'],
  requiredEntityCount: { min: 1, max: 20 },
  tags: ['crud', 'internal-tool', 'data-management'],
  previewImageUrl: '/previews/crud-basic.png',
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
    { id: 'FIELD_LIST', description: 'Comma-separated field names', required: true, accepts: ['field_list'] },
    { id: 'PRISMA_FIELDS', description: 'Prisma schema field definitions', required: true, accepts: ['field_list'] },
    { id: 'ZOD_SCHEMA', description: 'Zod validation schema body', required: true, accepts: ['field_list'] },
    { id: 'FORM_FIELDS', description: 'Form field JSX block', required: true, accepts: ['field_list'] },
    { id: 'TABLE_COLUMNS', description: 'Table column definitions', required: true, accepts: ['field_list'] },
    { id: 'ROUTE_PATH', description: 'API route path', required: true, accepts: ['route_path'] },
  ],
  files: [
    {
      relativePath: 'pages/{{TABLE_NAME}}/index.tsx',
      category: 'page',
      slots: ['ENTITY_NAME', 'ENTITY_NAME_PLURAL', 'TABLE_NAME', 'TABLE_COLUMNS'],
      isUserEditable: true,
      templateSource: 'crud/pages/list',
    },
    {
      relativePath: 'pages/{{TABLE_NAME}}/[id].tsx',
      category: 'page',
      slots: ['ENTITY_NAME', 'TABLE_NAME', 'FIELD_LIST'],
      isUserEditable: true,
      templateSource: 'crud/pages/detail',
    },
    {
      relativePath: 'pages/{{TABLE_NAME}}/new.tsx',
      category: 'page',
      slots: ['ENTITY_NAME', 'TABLE_NAME', 'FORM_FIELDS', 'ZOD_SCHEMA'],
      isUserEditable: true,
      templateSource: 'crud/pages/form',
    },
    {
      relativePath: 'pages/api/{{TABLE_NAME}}/index.ts',
      category: 'api',
      slots: ['ENTITY_NAME', 'ENTITY_NAME_PLURAL', 'TABLE_NAME'],
      isUserEditable: false,
      templateSource: 'crud/api/list-create',
    },
    {
      relativePath: 'pages/api/{{TABLE_NAME}}/[id].ts',
      category: 'api',
      slots: ['ENTITY_NAME', 'TABLE_NAME'],
      isUserEditable: false,
      templateSource: 'crud/api/get-update-delete',
    },
  ],
};
