import { z } from 'zod';
import { prisma } from '@visualize/core/db';
import { jsonResult, type ToolDefinition } from './types.js';

const InputSchema = z.object({
  runId: z.string().min(1),
});

const FAILED_STATUSES = [
  'failed',
  'timedOut',
  'unexpected',
  'flaky',
  'interrupted',
] as const;

export const listFailedTestsTool: ToolDefinition<typeof InputSchema> = {
  name: 'list_failed_tests',
  description:
    'List only the tests in a run that did not pass. Includes latest error message, error snippet, and screenshot triplets grouped by snapshotName.',
  inputSchema: InputSchema,
  handler: async (input) => {
    const tests = await prisma.testCase.findMany({
      where: {
        runId: input.runId,
        status: { in: [...FAILED_STATUSES] },
      },
      take: 100,
      orderBy: { titlePath: 'asc' },
      include: {
        results: {
          orderBy: { retry: 'desc' },
          include: {
            attachments: {
              where: { kind: 'screenshot' },
              select: {
                id: true,
                name: true,
                contentType: true,
                snapshotKind: true,
                snapshotName: true,
              },
            },
          },
        },
      },
    });

    const failedTests = tests.map((t) => {
      const latest = t.results[0];

      // Group screenshot triplets across all results by snapshotName.
      const snapshots: Record<
        string,
        { actual?: string; expected?: string; diff?: string }
      > = {};
      for (const r of t.results) {
        for (const a of r.attachments) {
          if (!a.snapshotName || !a.snapshotKind) continue;
          const bucket = (snapshots[a.snapshotName] ??= {});
          bucket[a.snapshotKind as 'actual' | 'expected' | 'diff'] = a.id;
        }
      }
      const snapshotGroups = Object.entries(snapshots).map(
        ([snapshotName, ids]) => ({ snapshotName, ...ids }),
      );

      return {
        id: t.id,
        titlePath: t.titlePath,
        title: t.title,
        file: t.file,
        line: t.line,
        projectName: t.projectName,
        status: t.status,
        expectedStatus: t.expectedStatus,
        durationMs: t.durationMs,
        latestError: latest
          ? {
              status: latest.status,
              retry: latest.retry,
              errorMessage: latest.errorMessage,
              errorSnippet: latest.errorSnippet,
            }
          : null,
        snapshotGroups,
      };
    });

    return jsonResult({ runId: input.runId, failedTests });
  },
};
