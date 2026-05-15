// packages/templates/src/registry/templates/dashboard/manifest.ts
import type { TemplateManifest } from '../../../types/template-manifest.js';

export const dashboardTemplate: TemplateManifest = {
  id: 'dashboard-analytics',
  name: 'Analytics Dashboard',
  description: 'A real-time analytics dashboard with charts, KPI cards, and data tables.',
  appType: 'dashboard',
  version: '1.0.0',
  supportedFieldTypes: ['string', 'number', 'date', 'datetime', 'boolean', 'enum'],
  requiredEntityCount: { min: 1, max: 10 },
  tags: ['dashboard', 'analytics', 'charts', 'kpi'],
  previewImageUrl: '/previews/dashboard-analytics.png',
  envVars: ['DATABASE_URL', 'CLERK_SECRET_KEY', 'CLERK_PUBLISHABLE_KEY'],
  dependencies: ['@prisma/client', 'next', 'react', 'react-dom', '@clerk/nextjs', 'recharts'],
  devDependencies: ['prisma', 'typescript', '@types/react', '@types/node'],
  slots: [
    { id: 'ENTITY_NAME', description: 'PascalCase entity name', required: true, accepts: ['entity_name'] },
    { id: 'KPI_FIELDS', description: 'Fields to use as KPI metrics', required: true, accepts: ['field_list'] },
    { id: 'CHART_FIELDS', description: 'Fields to use in charts', required: true, accepts: ['field_list'] },
    { id: 'TIME_FIELD', description: 'Date field for time-series', required: false, accepts: ['field_list'] },
  ],
  files: [
    {
      relativePath: 'pages/dashboard/index.tsx',
      category: 'page',
      slots: ['ENTITY_NAME', 'KPI_FIELDS', 'CHART_FIELDS'],
      isUserEditable: true,
      templateSource: 'dashboard/pages/main',
    },
    {
      relativePath: 'pages/api/dashboard/stats.ts',
      category: 'api',
      slots: ['ENTITY_NAME', 'KPI_FIELDS', 'TIME_FIELD'],
      isUserEditable: false,
      templateSource: 'dashboard/api/stats',
    },
  ],
};
