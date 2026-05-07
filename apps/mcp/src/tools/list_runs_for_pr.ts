import { z } from 'zod';
import { prisma } from '@visualize/core/db';
import { jsonResult, type ToolDefinition } from './types.js';

const InputSchema = z.object({
  prNumber: z.number().int().positive(),
  projectSlug: z.string().min(1).optional(),
});

export const listRunsForPrTool: ToolDefinition<typeof InputSchema> = {
  name: 'list_runs_for_pr',
  description:
    'Convenience: list the last 10 runs for a given pull request number, optionally scoped to a project slug.',
  inputSchema: InputSchema,
  handler: async (input) => {
    const where: Record<string, unknown> = { prNumber: input.prNumber };
    if (input.projectSlug) {
      where['project'] = { slug: input.projectSlug };
    }
    const runs = await prisma.run.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { project: { select: { slug: true } } },
    });
    return jsonResult({
      prNumber: input.prNumber,
      runs: runs.map((r) => ({
        id: r.id,
        projectSlug: r.project.slug,
        branch: r.branch,
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
