import type { z } from 'zod';
import type { ToolDefinition } from './types.js';

import { listProjectsTool } from './list_projects.js';
import { listRunsTool } from './list_runs.js';
import { getRunTool } from './get_run.js';
import { listFailedTestsTool } from './list_failed_tests.js';
import { getTestFailureTool } from './get_test_failure.js';
import { getAttachmentTool } from './get_attachment.js';
import { getSnapshotDiffTool } from './get_snapshot_diff.js';
import { listRunsForPrTool } from './list_runs_for_pr.js';
import { listRunsForCommitTool } from './list_runs_for_commit.js';
import { listAnnotationsTool } from './list_annotations.js';
import { addAnnotationTool } from './add_annotation.js';

// `unknown` so we can keep the array heterogeneous in zod input types.
export const tools: ToolDefinition<z.ZodTypeAny>[] = [
  listProjectsTool,
  listRunsTool,
  getRunTool,
  listFailedTestsTool,
  getTestFailureTool,
  getAttachmentTool,
  getSnapshotDiffTool,
  listRunsForPrTool,
  listRunsForCommitTool,
  listAnnotationsTool,
  addAnnotationTool,
];

export type { ToolDefinition } from './types.js';
