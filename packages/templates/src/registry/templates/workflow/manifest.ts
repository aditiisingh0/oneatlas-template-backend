// packages/templates/src/registry/templates/workflow/manifest.ts
import type { TemplateManifest } from '../../../types/template-manifest.js';

export const workflowTemplate: TemplateManifest = {
  id: 'workflow-automation',
  name: 'Workflow Automation',
  description: 'Trigger-based workflow engine with multi-step action chains and conditionals.',
  appType: 'workflow',
  version: '1.0.0',
  supportedFieldTypes: ['string', 'text', 'number', 'boolean', 'date', 'datetime', 'json', 'enum'],
  requiredEntityCount: { min: 1, max: 5 },
  tags: ['workflow', 'automation', 'triggers', 'actions'],
  previewImageUrl: '/previews/workflow-automation.png',
  envVars: ['DATABASE_URL', 'CLERK_SECRET_KEY', 'CLERK_PUBLISHABLE_KEY', 'UPSTASH_REDIS_URL', 'UPSTASH_REDIS_TOKEN'],
  dependencies: [
    '@prisma/client', 'next', 'react', 'react-dom', '@clerk/nextjs',
    '@upstash/redis', 'zod',
  ],
  devDependencies: ['prisma', 'typescript', '@types/react', '@types/node'],
  slots: [
    { id: 'WORKFLOW_NAME', description: 'Workflow identifier', required: true, accepts: ['entity_name'] },
    { id: 'TRIGGER_TYPE', description: 'Trigger type: webhook|schedule|db_event|form_submit', required: true, accepts: ['custom_string'] },
    { id: 'ACTION_STEPS', description: 'Serialized action step configs', required: true, accepts: ['custom_string'] },
  ],
  files: [
    {
      relativePath: 'pages/workflows/index.tsx',
      category: 'page',
      slots: ['WORKFLOW_NAME'],
      isUserEditable: true,
      templateSource: 'workflow/pages/list',
    },
    {
      relativePath: 'pages/api/workflows/trigger.ts',
      category: 'api',
      slots: ['WORKFLOW_NAME', 'TRIGGER_TYPE'],
      isUserEditable: false,
      templateSource: 'workflow/api/trigger',
    },
    {
      relativePath: 'pages/api/workflows/execute.ts',
      category: 'api',
      slots: ['ACTION_STEPS'],
      isUserEditable: false,
      templateSource: 'workflow/api/execute',
    },
  ],
};
