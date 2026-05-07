import { z } from 'zod';

// --- Playwright JSON report shapes ------------------------------------------
// Subset of @playwright/test's JSON reporter output. We only declare the fields
// we read; everything else is preserved as `Json` on Run.metadata.

export const PlaywrightAttachmentSchema = z.object({
  name: z.string(),
  contentType: z.string().optional(),
  path: z.string().optional(),
  body: z.string().optional(), // base64 if inlined
});
export type PlaywrightAttachment = z.infer<typeof PlaywrightAttachmentSchema>;

export const PlaywrightTestStatusSchema = z.enum([
  'passed',
  'failed',
  'timedOut',
  'skipped',
  'interrupted',
  'expected',
  'unexpected',
  'flaky',
]);
export type PlaywrightTestStatus = z.infer<typeof PlaywrightTestStatusSchema>;

export const PlaywrightResultSchema = z.object({
  workerIndex: z.number().optional(),
  status: PlaywrightTestStatusSchema,
  duration: z.number().optional(),
  startTime: z.string().optional(),
  retry: z.number().optional(),
  attachments: z.array(PlaywrightAttachmentSchema).optional(),
  errors: z
    .array(
      z.object({
        message: z.string().optional(),
        stack: z.string().optional(),
        snippet: z.string().optional(),
      }),
    )
    .optional(),
  stdout: z.array(z.union([z.string(), z.object({ text: z.string() })])).optional(),
  stderr: z.array(z.union([z.string(), z.object({ text: z.string() })])).optional(),
});
export type PlaywrightResult = z.infer<typeof PlaywrightResultSchema>;

export const PlaywrightTestSchema = z.object({
  projectName: z.string().optional(),
  expectedStatus: PlaywrightTestStatusSchema.optional(),
  status: PlaywrightTestStatusSchema.optional(),
  results: z.array(PlaywrightResultSchema).optional(),
});
export type PlaywrightTest = z.infer<typeof PlaywrightTestSchema>;

export const PlaywrightSpecSchema = z.object({
  title: z.string(),
  file: z.string(),
  line: z.number().optional(),
  column: z.number().optional(),
  ok: z.boolean().optional(),
  tests: z.array(PlaywrightTestSchema).optional(),
});
export type PlaywrightSpec = z.infer<typeof PlaywrightSpecSchema>;

export type PlaywrightSuite = {
  title: string;
  file?: string;
  suites?: PlaywrightSuite[];
  specs?: PlaywrightSpec[];
};

export const PlaywrightSuiteSchema: z.ZodType<PlaywrightSuite> = z.lazy(() =>
  z.object({
    title: z.string(),
    file: z.string().optional(),
    suites: z.array(PlaywrightSuiteSchema).optional(),
    specs: z.array(PlaywrightSpecSchema).optional(),
  }),
);

export const PlaywrightReportSchema = z.object({
  config: z.unknown().optional(),
  suites: z.array(PlaywrightSuiteSchema).optional(),
  errors: z.array(z.unknown()).optional(),
  stats: z
    .object({
      startTime: z.string().optional(),
      duration: z.number().optional(),
      expected: z.number().optional(),
      unexpected: z.number().optional(),
      flaky: z.number().optional(),
      skipped: z.number().optional(),
    })
    .optional(),
});
export type PlaywrightReport = z.infer<typeof PlaywrightReportSchema>;

// --- API request schemas ----------------------------------------------------

export const RunUploadMetadataSchema = z.object({
  projectSlug: z.string().min(1),
  projectName: z.string().min(1).optional(),
  commitSha: z.string().optional(),
  branch: z.string().optional(),
  prNumber: z.coerce.number().int().positive().optional(),
  ciProvider: z.string().optional(),
  ciRunUrl: z.string().url().optional(),
});
export type RunUploadMetadata = z.infer<typeof RunUploadMetadataSchema>;

export const BaselineUploadMetadataSchema = z.object({
  projectSlug: z.string().min(1),
  projectName: z.string().min(1).optional(),
  name: z.string().min(1),
  browser: z.string().optional(),
  platform: z.string().optional(),
  commitSha: z.string().optional(),
  branch: z.string().optional(),
});
export type BaselineUploadMetadata = z.infer<typeof BaselineUploadMetadataSchema>;

// --- Annotation shape schema (used by viewer + MCP) -------------------------

export const AnnotationShapeSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('rect'),
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    color: z.string().optional(),
    strokeWidth: z.number().optional(),
  }),
  z.object({
    type: z.literal('arrow'),
    x1: z.number(),
    y1: z.number(),
    x2: z.number(),
    y2: z.number(),
    color: z.string().optional(),
    strokeWidth: z.number().optional(),
  }),
  z.object({
    type: z.literal('circle'),
    x: z.number(),
    y: z.number(),
    radius: z.number(),
    color: z.string().optional(),
    strokeWidth: z.number().optional(),
  }),
  z.object({
    type: z.literal('text'),
    x: z.number(),
    y: z.number(),
    text: z.string(),
    color: z.string().optional(),
    fontSize: z.number().optional(),
  }),
]);
export type AnnotationShape = z.infer<typeof AnnotationShapeSchema>;
