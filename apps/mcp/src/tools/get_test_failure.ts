import { z } from 'zod';
import { prisma } from '@visualize/core/db';
import { jsonResult, textResult, type ToolDefinition } from './types.js';

const InputSchema = z.object({
  testCaseId: z.string().min(1),
});

export const getTestFailureTool: ToolDefinition<typeof InputSchema> = {
  name: 'get_test_failure',
  description:
    'Fetch a single test case with all retries and attachment metadata. Each attachment includes an mcpUrl (mcp://attachment/<id>) that can be passed to get_attachment.',
  inputSchema: InputSchema,
  handler: async (input) => {
    const test = await prisma.testCase.findUnique({
      where: { id: input.testCaseId },
      include: {
        run: {
          select: {
            id: true,
            commitSha: true,
            branch: true,
            prNumber: true,
            project: { select: { slug: true } },
          },
        },
        results: {
          orderBy: { retry: 'asc' },
          include: {
            attachments: {
              select: {
                id: true,
                name: true,
                kind: true,
                snapshotKind: true,
                snapshotName: true,
                contentType: true,
                sizeBytes: true,
                storagePath: true,
              },
            },
          },
        },
      },
    });

    if (!test) {
      return {
        ...textResult(`TestCase not found: ${input.testCaseId}`),
        isError: true,
      };
    }

    return jsonResult({
      testCase: {
        id: test.id,
        titlePath: test.titlePath,
        title: test.title,
        file: test.file,
        line: test.line,
        column: test.column,
        projectName: test.projectName,
        status: test.status,
        expectedStatus: test.expectedStatus,
        durationMs: test.durationMs,
      },
      run: {
        id: test.run.id,
        projectSlug: test.run.project.slug,
        commitSha: test.run.commitSha,
        branch: test.run.branch,
        prNumber: test.run.prNumber,
      },
      results: test.results.map((r) => ({
        id: r.id,
        retry: r.retry,
        status: r.status,
        durationMs: r.durationMs,
        startedAt: r.startedAt,
        workerIndex: r.workerIndex,
        errorMessage: r.errorMessage,
        errorStack: r.errorStack,
        errorSnippet: r.errorSnippet,
        stdout: r.stdout,
        stderr: r.stderr,
        attachments: r.attachments.map((a) => ({
          id: a.id,
          name: a.name,
          kind: a.kind,
          snapshotKind: a.snapshotKind,
          snapshotName: a.snapshotName,
          contentType: a.contentType,
          sizeBytes: a.sizeBytes,
          mcpUrl: `mcp://attachment/${a.id}`,
        })),
      })),
    });
  },
};
