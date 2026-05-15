// packages/templates/src/registry/templates/crud/api/list-create.ts
// Template source for pages/api/{{TABLE_NAME}}/index.ts

export const listCreateTemplate = `
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
              // {{SEARCH_FIELDS}} — injected by AST patcher
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

export const getUpdateDeleteTemplate = `
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

  // Ownership check — ensure record belongs to this tenant
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
