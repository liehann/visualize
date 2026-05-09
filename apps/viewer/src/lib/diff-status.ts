import { prisma } from '@/lib/db';
import { env } from '@/env';

const STATUS_CONTEXT = 'visualize/visual-diffs';

/**
 * Re-evaluate the GitHub commit status for a run after an approval. If
 * everything is set up (token, project.githubRepo, run.commitSha) and
 * all visual diffs in the run are now approved, post `success` to flip
 * the merge gate without waiting for the next CI run. If diffs remain,
 * we re-post `pending` with the updated count so the description stays
 * accurate.
 *
 * Best-effort: returns silently on any missing prerequisite or
 * non-2xx response. The approval itself has already succeeded by the
 * time we get here; failing to update GitHub must not break the user
 * flow.
 */
export async function refreshDiffStatusForRun(runId: string): Promise<void> {
  const token = env.VIEWER_GITHUB_TOKEN;
  if (!token) return;

  const run = await prisma.run.findUnique({
    where: { id: runId },
    select: {
      commitSha: true,
      project: { select: { id: true, githubRepo: true } },
    },
  });
  if (!run?.commitSha) return;
  const repo = run.project.githubRepo;
  if (!repo) return;

  const remaining = await countUnapprovedDiffs(runId, run.project.id);

  const state: 'success' | 'pending' = remaining === 0 ? 'success' : 'pending';
  const description =
    remaining === 0
      ? 'All visual diffs approved'
      : `${remaining} visual change${remaining === 1 ? '' : 's'} pending review`;

  const targetUrl = env.VIEWER_URL ? `${env.VIEWER_URL.replace(/\/$/, '')}/runs/${runId}` : undefined;

  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/statuses/${run.commitSha}`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        state,
        context: STATUS_CONTEXT,
        description,
        target_url: targetUrl,
      }),
    });
    if (!res.ok) {
      console.warn(
        `[diff-status] GitHub statuses POST returned ${res.status} for ${repo}@${run.commitSha}`,
      );
    }
  } catch (err) {
    console.warn('[diff-status] GitHub statuses POST failed:', err);
  }
}

async function countUnapprovedDiffs(runId: string, projectId: string): Promise<number> {
  // Same logic as the bulk-approve endpoint: an "unapproved diff" is an
  // actual snapshot whose sibling diff PNG exists but no Baseline yet
  // points at it.
  const [actuals, diffNames, approvedFromIds] = await Promise.all([
    prisma.attachment.findMany({
      where: {
        snapshotKind: 'actual',
        testResult: { testCase: { runId } },
      },
      select: {
        id: true,
        snapshotName: true,
        testResult: { select: { testCaseId: true } },
      },
    }),
    prisma.attachment
      .findMany({
        where: {
          snapshotKind: 'diff',
          testResult: { testCase: { runId } },
        },
        select: {
          snapshotName: true,
          testResult: { select: { testCaseId: true } },
        },
      })
      .then(
        (rows) =>
          new Set(
            rows
              .filter((r) => r.snapshotName)
              .map((r) => `${r.testResult.testCaseId}::${r.snapshotName}`),
          ),
      ),
    prisma.baseline
      .findMany({
        where: { projectId },
        select: { approvedFromAttachmentId: true },
      })
      .then(
        (rows) =>
          new Set(
            rows
              .map((r) => r.approvedFromAttachmentId)
              .filter((id): id is string => !!id),
          ),
      ),
  ]);

  return actuals.filter((a) => {
    if (!a.snapshotName) return false;
    const key = `${a.testResult.testCaseId}::${a.snapshotName}`;
    return diffNames.has(key) && !approvedFromIds.has(a.id);
  }).length;
}
