import { z } from 'zod';
import { prisma } from '@visualize/core/db';
import { jsonResult, type ToolDefinition } from './types.js';

const InputSchema = z.object({
  commitSha: z.string().min(1),
});

export const listRunsForCommitTool: ToolDefinition<typeof InputSchema> = {
  name: 'list_runs_for_commit',
  description: 'List the last 10 runs that match a given commit SHA.',
  inputSchema: InputSchema,
  handler: async (input) => {
    const runs = await prisma.run.findMany({
      where: { commitSha: input.commitSha },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { project: { select: { slug: true } } },
    });
    return jsonResult({
      commitSha: input.commitSha,
      runs: runs.map((r) => ({
        id: r.id,
        projectSlug: r.project.slug,
        branch: r.branch,
        prNumber: r.prNumber,
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
