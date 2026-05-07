import { z } from 'zod';
import { prisma } from '@visualize/core/db';
import { dataFileExists, readDataFile } from '@visualize/core/storage';
import {
  textResult,
  type McpContent,
  type ToolDefinition,
  type ToolResult,
} from './types.js';

const InputSchema = z.object({
  runId: z.string().min(1),
  snapshotName: z.string().min(1),
});

const MAX_INLINE_BYTES = 2 * 1024 * 1024; // 2MB

type AttachmentRow = {
  id: string;
  name: string;
  contentType: string | null;
  sizeBytes: number | null;
  storagePath: string;
  snapshotKind: 'actual' | 'expected' | 'diff' | null;
  snapshotName: string | null;
  testResult: { testCaseId: string };
};

async function loadImage(
  a: AttachmentRow,
  label: 'actual' | 'expected' | 'diff',
): Promise<McpContent[]> {
  const header: McpContent = {
    type: 'text',
    text: `--- ${label} (attachmentId=${a.id}) ---`,
  };
  if (!(await dataFileExists(a.storagePath))) {
    return [
      header,
      { type: 'text', text: `(missing on disk: ${a.storagePath})` },
    ];
  }
  if (a.sizeBytes !== null && a.sizeBytes > MAX_INLINE_BYTES) {
    return [
      header,
      {
        type: 'text',
        text: `(too large to inline: ${a.sizeBytes} bytes; storagePath=${a.storagePath})`,
      },
    ];
  }
  const buf = await readDataFile(a.storagePath);
  if (buf.byteLength > MAX_INLINE_BYTES) {
    return [
      header,
      {
        type: 'text',
        text: `(too large to inline: ${buf.byteLength} bytes; storagePath=${a.storagePath})`,
      },
    ];
  }
  return [
    header,
    {
      type: 'image',
      data: buf.toString('base64'),
      mimeType: a.contentType ?? 'image/png',
    },
  ];
}

export const getSnapshotDiffTool: ToolDefinition<typeof InputSchema> = {
  name: 'get_snapshot_diff',
  description:
    'Fetch the actual / expected / diff screenshot triplet for a single snapshot in a run. Returns image content for each (subject to a 2MB per-image cap).',
  inputSchema: InputSchema,
  handler: async (input) => {
    const attachments = (await prisma.attachment.findMany({
      where: {
        snapshotName: input.snapshotName,
        kind: 'screenshot',
        testResult: { testCase: { runId: input.runId } },
      },
      include: { testResult: { select: { testCaseId: true } } },
      take: 100,
    })) as AttachmentRow[];

    if (attachments.length === 0) {
      return {
        ...textResult(
          `No snapshot triplet found for run=${input.runId} snapshot=${input.snapshotName}`,
        ),
        isError: true,
      };
    }

    const byKind: Partial<Record<'actual' | 'expected' | 'diff', AttachmentRow>> =
      {};
    for (const a of attachments) {
      if (a.snapshotKind && !byKind[a.snapshotKind]) {
        byKind[a.snapshotKind] = a;
      }
    }

    const testCaseId = attachments[0]?.testResult.testCaseId ?? null;

    const content: McpContent[] = [
      {
        type: 'text',
        text: JSON.stringify(
          {
            runId: input.runId,
            snapshotName: input.snapshotName,
            testCaseId,
          },
          null,
          2,
        ),
      },
    ];

    for (const label of ['actual', 'expected', 'diff'] as const) {
      const a = byKind[label];
      if (!a) {
        content.push({ type: 'text', text: `--- ${label}: not present ---` });
        continue;
      }
      const items = await loadImage(a, label);
      for (const it of items) content.push(it);
    }

    const result: ToolResult = { content };
    return result;
  },
};
