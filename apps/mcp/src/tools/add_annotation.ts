import { z } from 'zod';
import { prisma } from '@visualize/core/db';
import { AnnotationShapeSchema } from '@visualize/core/types';
import { jsonResult, textResult, type ToolDefinition } from './types.js';

const InputSchema = z.object({
  attachmentId: z.string().min(1),
  shape: AnnotationShapeSchema,
  label: z.string().max(500).optional(),
});

export const addAnnotationTool: ToolDefinition<typeof InputSchema> = {
  name: 'add_annotation',
  description:
    'Create a new annotation (rect/arrow/circle/text) on an attachment, attributed to Claude. Returns the new annotation id.',
  inputSchema: InputSchema,
  handler: async (input) => {
    const attachment = await prisma.attachment.findUnique({
      where: { id: input.attachmentId },
      select: { id: true },
    });
    if (!attachment) {
      return {
        ...textResult(`Attachment not found: ${input.attachmentId}`),
        isError: true,
      };
    }
    const created = await prisma.annotation.create({
      data: {
        attachmentId: input.attachmentId,
        shape: input.shape,
        label: input.label ?? null,
        author: 'Claude',
        source: 'claude',
      },
      select: { id: true, createdAt: true },
    });
    return jsonResult({
      id: created.id,
      createdAt: created.createdAt,
    });
  },
};
