import { z } from 'zod';
import { prisma } from '@visualize/core/db';
import { jsonResult, type ToolDefinition } from './types.js';

const InputSchema = z.object({}).describe('No arguments.');

export const listProjectsTool: ToolDefinition<typeof InputSchema> = {
  name: 'list_projects',
  description: 'List all visual-test projects (id, slug, name).',
  inputSchema: InputSchema,
  handler: async () => {
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, slug: true, name: true },
    });
    return jsonResult({ projects });
  },
};
