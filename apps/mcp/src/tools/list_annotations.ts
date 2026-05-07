import { z } from 'zod';
import { prisma } from '@visualize/core/db';
import { jsonResult, type ToolDefinition } from './types.js';

const InputSchema = z.object({
  attachmentId: z.string().min(1),
});

export const listAnnotationsTool: ToolDefinition<typeof InputSchema> = {
  name: 'list_annotations',
  description:
    'List saved annotations for an attachment. Each annotation has shape (rect/arrow/circle/text), label, author, source, and createdAt.',
  inputSchema: InputSchema,
  handler: async (input) => {
    const rows = await prisma.annotation.findMany({
      where: { attachmentId: input.attachmentId },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    return jsonResult({
      attachmentId: input.attachmentId,
      annotations: rows.map((r) => ({
        id: r.id,
        shape: r.shape,
        label: r.label,
        author: r.author,
        source: r.source,
        createdAt: r.createdAt,
      })),
    });
  },
};
