import { z } from 'zod';
import { prisma } from '@visualize/core/db';
import { jsonResult, type ToolDefinition } from './types.js';

const StatusEnum = z.enum(['passed', 'failed', 'flaky']);

const InputSchema = z.object({
  projectSlug: z.string().min(1).optional(),
  branch: z.string().min(1).optional(),
  prNumber: z.number().int().positive().optional(),
  status: StatusEnum.optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

export const listRunsTool: ToolDefinition<typeof InputSchema> = {
  name: 'list_runs',
  description:
    'List runs newest-first. Filter by projectSlug, branch, prNumber, or status.',
  inputSchema: InputSchema,
  handler: async (input) => {
    const where: Record<string, unknown> = {};
    if (input.projectSlug) {
      where['project'] = { slug: input.projectSlug };
    }
    if (input.branch) where['branch'] = input.branch;
    if (input.prNumber !== undefined) where['prNumber'] = input.prNumber;
    if (input.status) where['status'] = input.status;

    const runs = await prisma.run.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: input.limit,
      include: { project: { select: { slug: true } } },
    });

    return jsonResult({
      runs: runs.map((r) => ({
        id: r.id,
        projectSlug: r.project.slug,
        branch: r.branch,
        prNumber: r.prNumber,
        commitSha: r.commitSha,
        status: r.status,
        startedAt: r.startedAt,
        durationMs: r.durationMs,
        totals: {
          totalTests: r.totalTests,
          passedTests: r.passedTests,
          failedTests: r.failedTests,
          flakyTests: r.flakyTests,
          skippedTests: r.skippedTests,
        },
      })),
    });
  },
};
