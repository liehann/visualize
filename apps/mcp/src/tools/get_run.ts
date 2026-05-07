import { z } from 'zod';
import { prisma } from '@visualize/core/db';
import { jsonResult, textResult, type ToolDefinition } from './types.js';

const InputSchema = z.object({
  runId: z.string().min(1),
});

export const getRunTool: ToolDefinition<typeof InputSchema> = {
  name: 'get_run',
  description:
    'Get a single run with summary metadata and per-test summaries (status, file, line, attachment counts).',
  inputSchema: InputSchema,
  handler: async (input) => {
    const run = await prisma.run.findUnique({
      where: { id: input.runId },
      include: {
        project: { select: { slug: true, name: true } },
        tests: {
          select: {
            id: true,
            titlePath: true,
            title: true,
            file: true,
            line: true,
            projectName: true,
            status: true,
            expectedStatus: true,
            durationMs: true,
            results: {
              select: {
                id: true,
                attachments: {
                  select: { id: true, snapshotKind: true, kind: true },
                },
              },
            },
          },
        },
      },
    });
    if (!run) {
      return { ...textResult(`Run not found: ${input.runId}`), isError: true };
    }

    const tests = run.tests.map((t) => {
      let attachmentCount = 0;
      let failedSnapshotCount = 0;
      for (const r of t.results) {
        attachmentCount += r.attachments.length;
        for (const a of r.attachments) {
          if (a.kind === 'screenshot' && a.snapshotKind === 'diff') {
            failedSnapshotCount += 1;
          }
        }
      }
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
        attachmentCount,
        failedSnapshotCount,
      };
    });

    return jsonResult({
      run: {
        id: run.id,
        projectSlug: run.project.slug,
        projectName: run.project.name,
        branch: run.branch,
        prNumber: run.prNumber,
        commitSha: run.commitSha,
        ciProvider: run.ciProvider,
        ciRunUrl: run.ciRunUrl,
        status: run.status,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        durationMs: run.durationMs,
        storagePath: run.storagePath,
        totals: {
          totalTests: run.totalTests,
          passedTests: run.passedTests,
          failedTests: run.failedTests,
          flakyTests: run.flakyTests,
          skippedTests: run.skippedTests,
        },
      },
      tests,
    });
  },
};
