import { z } from 'zod';
import { prisma } from '@visualize/core/db';
import { dataFileExists, readDataFile } from '@visualize/core/storage';
import {
  jsonResult,
  textResult,
  type McpContent,
  type ToolDefinition,
  type ToolResult,
} from './types.js';

const InputSchema = z.object({
  attachmentId: z.string().min(1),
});

const MAX_INLINE_BYTES = 2 * 1024 * 1024; // 2MB

function metadataPayload(args: {
  attachment: {
    id: string;
    name: string;
    kind: string;
    contentType: string | null;
    sizeBytes: number | null;
    snapshotKind: string | null;
    snapshotName: string | null;
    storagePath: string;
  };
  note: string;
}): ToolResult {
  return jsonResult({
    attachment: {
      id: args.attachment.id,
      name: args.attachment.name,
      kind: args.attachment.kind,
      contentType: args.attachment.contentType,
      sizeBytes: args.attachment.sizeBytes,
      snapshotKind: args.attachment.snapshotKind,
      snapshotName: args.attachment.snapshotName,
      storagePath: args.attachment.storagePath,
    },
    note: args.note,
  });
}

export const getAttachmentTool: ToolDefinition<typeof InputSchema> = {
  name: 'get_attachment',
  description:
    'Fetch the content of a single attachment by id. Images are returned as base64 image content; small text/error attachments are returned as text. Trace zips and videos return metadata only (too large to inline).',
  inputSchema: InputSchema,
  handler: async (input) => {
    const a = await prisma.attachment.findUnique({
      where: { id: input.attachmentId },
    });
    if (!a) {
      return {
        ...textResult(`Attachment not found: ${input.attachmentId}`),
        isError: true,
      };
    }

    // Trace + video: never inline.
    if (a.kind === 'trace' || a.kind === 'video') {
      return metadataPayload({
        attachment: a,
        note: `Attachment kind '${a.kind}' is not inlined over MCP. Fetch the file directly from DATA_DIR using the storagePath.`,
      });
    }

    if (!(await dataFileExists(a.storagePath))) {
      return {
        ...textResult(
          `Attachment file missing from storage: ${a.storagePath}`,
        ),
        isError: true,
      };
    }

    // Size cap.
    if (a.sizeBytes !== null && a.sizeBytes > MAX_INLINE_BYTES) {
      return metadataPayload({
        attachment: a,
        note: `Attachment is ${a.sizeBytes} bytes (> ${MAX_INLINE_BYTES}). Too large to inline.`,
      });
    }

    const buffer = await readDataFile(a.storagePath);
    if (buffer.byteLength > MAX_INLINE_BYTES) {
      return metadataPayload({
        attachment: a,
        note: `Attachment is ${buffer.byteLength} bytes (> ${MAX_INLINE_BYTES}). Too large to inline.`,
      });
    }

    if (a.kind === 'screenshot') {
      const mimeType = a.contentType ?? 'image/png';
      const content: McpContent[] = [
        {
          type: 'image',
          data: buffer.toString('base64'),
          mimeType,
        },
      ];
      return { content };
    }

    if (a.kind === 'text') {
      return textResult(buffer.toString('utf8'));
    }

    // Other: try as text if it looks textual, else metadata.
    const ct = a.contentType ?? '';
    if (ct.startsWith('text/') || ct.includes('json')) {
      return textResult(buffer.toString('utf8'));
    }

    return metadataPayload({
      attachment: a,
      note: `Attachment kind '${a.kind}' with content-type '${ct}' is not inlined.`,
    });
  },
};
