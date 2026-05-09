import type { AnyToolDefinition } from './types.js';

import { listProjectsTool } from './list_projects.js';
import { createProjectTool } from './create_project.js';
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

export const tools: AnyToolDefinition[] = [
  listProjectsTool,
  createProjectTool,
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
] as unknown as AnyToolDefinition[];

export type { ToolDefinition, AnyToolDefinition } from './types.js';
