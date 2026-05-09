import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BulkApprove, type PendingDiff } from './bulk-approve.js';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const fixturePending: PendingDiff[] = [
  {
    attachmentId: 'a1',
    snapshotName: 'home/dashboard.png',
    testTitle: 'home > renders',
    testId: 'tc1',
    actualSrc: '/files/a1.png',
    diffPercent: 12.4,
  },
  {
    attachmentId: 'a2',
    snapshotName: 'auth/sign-in.png',
    testTitle: 'auth > sign-in',
    testId: 'tc2',
    actualSrc: '/files/a2.png',
    diffPercent: 0.05,
  },
];

// happy-dom surfaces lucide SVG icons as extra role=button matches in
// some cases; query the DOM directly for stability.
function findButton(container: HTMLElement, match: RegExp): HTMLButtonElement {
  const all = Array.from(container.querySelectorAll('button')) as HTMLButtonElement[];
  const hits = all.filter((b) => match.test(b.textContent ?? ''));
  if (hits.length === 0) throw new Error(`no button matching ${match}`);
  return hits[0]!;
}

function findButtonAll(container: HTMLElement, match: RegExp): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll('button'))
    .filter((b) => match.test((b as HTMLButtonElement).textContent ?? ''))
    .map((b) => b as HTMLButtonElement);
}

// React's text-with-interpolation splits into multiple text nodes —
// `getByText` is unreliable for those. Query the DOM directly + match
// against normalized textContent.
function bodyContains(text: string): boolean {
  return (document.body.textContent ?? '').replace(/\s+/g, ' ').includes(text);
}

async function waitForBody(text: string): Promise<void> {
  await waitFor(() => {
    if (!bodyContains(text)) throw new Error(`text not found: ${text}`);
  });
}

describe('<BulkApprove>', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when there are no pending diffs', () => {
    const { container } = render(<BulkApprove runId="r1" pending={[]} />);
    expect(container.textContent).toBe('');
  });

  it('shows the pending banner with the diff count', () => {
    render(<BulkApprove runId="r1" pending={fixturePending} />);
    expect(bodyContains('2 visual changes pending review')).toBe(true);
  });

  it('opening the sheet lists every pending diff with its impact badge', async () => {
    const utils = render(<BulkApprove runId="r1" pending={fixturePending} />);
    fireEvent.click(findButton(utils.container, /approve all 2/i));

    await waitForBody('Approve 2 visual changes');
    expect(bodyContains('home/dashboard.png')).toBe(true);
    expect(bodyContains('auth/sign-in.png')).toBe(true);
    expect(screen.getByText('12.4%')).toBeTruthy();
    expect(screen.getByText('0.05%')).toBeTruthy();
  });

  it('on bulk success: marks every row "approved" and updates the footer count', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          approved: 2,
          results: [
            { snapshotName: 'home/dashboard.png', ok: true },
            { snapshotName: 'auth/sign-in.png', ok: true },
          ],
        }),
        { status: 200 },
      ),
    );
    const utils = render(<BulkApprove runId="r1" pending={fixturePending} />);

    fireEvent.click(findButton(utils.container, /approve all 2/i));
    await waitForBody('Approve 2 visual changes');

    const sheetApproves = findButtonAll(utils.container, /^\s*approve all\s*$/i);
    fireEvent.click(sheetApproves[sheetApproves.length - 1]!);

    await waitFor(() => {
      expect(screen.getAllByText(/approved/i).length).toBeGreaterThanOrEqual(2);
    });
    expect(screen.getByText(/2 approved/i)).toBeTruthy();
  });

  it('on partial failure: per-row error text is surfaced for the failed snapshot', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          approved: 1,
          results: [
            { snapshotName: 'home/dashboard.png', ok: true },
            {
              snapshotName: 'auth/sign-in.png',
              ok: false,
              error: 'baseline path collision',
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const utils = render(<BulkApprove runId="r1" pending={fixturePending} />);

    fireEvent.click(findButton(utils.container, /approve all 2/i));
    await waitForBody('Approve 2 visual changes');

    const sheetApproves = findButtonAll(utils.container, /^\s*approve all\s*$/i);
    fireEvent.click(sheetApproves[sheetApproves.length - 1]!);

    await waitFor(() => {
      expect(screen.getByText('baseline path collision')).toBeTruthy();
    });
    expect(screen.getByText(/1 approved · 1 failed/i)).toBeTruthy();
  });

  it('on request-level error: footer shows 0 approved · 1 failed', async () => {
    // The component models a network/auth failure as a single
    // synthetic failure row (name `(request)`) so the footer count
    // still increments. The per-row error text isn't surfaced because
    // `(request)` isn't in `pending`, but the count is the visible
    // signal.
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 500 }));
    const utils = render(<BulkApprove runId="r1" pending={fixturePending} />);

    fireEvent.click(findButton(utils.container, /approve all 2/i));
    await waitForBody('Approve 2 visual changes');

    const sheetApproves = findButtonAll(utils.container, /^\s*approve all\s*$/i);
    fireEvent.click(sheetApproves[sheetApproves.length - 1]!);

    await waitFor(() => {
      expect(screen.getByText(/0 approved · 1 failed/i)).toBeTruthy();
    });
  });
});
