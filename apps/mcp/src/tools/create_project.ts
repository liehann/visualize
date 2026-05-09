import { z } from 'zod';
import { prisma } from '@visualize/core/db';
import { jsonResult, type ToolDefinition } from './types.js';

const InputSchema = z
  .object({
    slug: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/, {
        message: 'Slug must be lowercase kebab-case (a-z, 0-9, -).',
      })
      .describe('Project slug (kebab-case). Stable identifier; used in URLs.'),
    name: z
      .string()
      .min(1)
      .max(120)
      .optional()
      .describe('Human-friendly project name. Defaults to slug.'),
    githubRepo: z
      .string()
      .regex(/^[^/\s]+\/[^/\s]+$/, { message: 'Use "owner/repo".' })
      .optional()
      .describe('Optional GitHub repo, "owner/repo".'),
  })
  .describe('Create or fetch a project by slug.');

export const createProjectTool: ToolDefinition<typeof InputSchema> = {
  name: 'create_project',
  description:
    'Create a project, or return the existing one if a project with this slug already exists. Idempotent — safe to call repeatedly.',
  inputSchema: InputSchema,
  handler: async ({ slug, name, githubRepo }) => {
    const existing = await prisma.project.findUnique({
      where: { slug },
      select: { id: true, slug: true, name: true, githubRepo: true, createdAt: true },
    });
    if (existing) {
      return jsonResult({ project: existing, created: false });
    }
    const created = await prisma.project.create({
      data: {
        slug,
        name: name ?? slug,
        ...(githubRepo ? { githubRepo } : {}),
      },
      select: { id: true, slug: true, name: true, githubRepo: true, createdAt: true },
    });
    return jsonResult({ project: created, created: true });
  },
};
