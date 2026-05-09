import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnapshotDiff, type SnapshotTriplet } from './snapshot-diff.js';

const triplet: SnapshotTriplet = {
  snapshotName: 'home/dashboard.png',
  expected: { id: 'att-exp', src: '/files/exp.png' },
  actual: { id: 'att-act', src: '/files/act.png' },
  diff: { id: 'att-diff', src: '/files/diff.png' },
  diffPercent: 12.4,
};

function renderApprove() {
  const utils = render(<SnapshotDiff triplet={triplet} />);
  // Buttons in the header: side / overlay / diff (tabs), maybe expand,
  // and approve. Approve is always the last <button> with text content
  // including "approve". Use querySelector for stability — happy-dom
  // surfaces extra role=button matches via lucide SVGs.
  const buttons = Array.from(utils.container.querySelectorAll('button'));
  const approve = buttons.find((b) => /approve/i.test(b.textContent ?? ''));
  if (!approve) throw new Error('no approve button rendered');
  return { ...utils, approve };
}

describe('<SnapshotDiff>', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the snapshot name and the diff% badge', () => {
    render(<SnapshotDiff triplet={triplet} />);
    expect(screen.getByText('home/dashboard.png')).toBeTruthy();
    expect(screen.getByText('12.4%')).toBeTruthy();
  });

  it('on success: posts to /api/approve/<actualId> and shows "approved"', async () => {
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const user = userEvent.setup();
    const { approve } = renderApprove();

    await user.click(approve);

    await waitFor(() => {
      expect(screen.getByText(/^approved$/i)).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/approve/att-act', {
      method: 'POST',
    });
  });

  it('on JSON 500 with `detail`: surfaces the underlying server error', async () => {
    // This is the exact bug class that took prod down: opaque 500s on
    // the approve endpoint with no body. After the route was wrapped
    // in try/catch and started returning {error, detail} JSON, this
    // is the path the user-facing error band has to render.
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'attachment approve failed',
          detail:
            "ENOENT: no such file or directory, mkdir '/var/lib/visualize/data/baselines/x'",
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const user = userEvent.setup();
    const { approve } = renderApprove();

    await user.click(approve);

    await waitFor(() => {
      expect(screen.getByText(/ENOENT/)).toBeTruthy();
    });
  });

  it('on opaque 500 with no body: shows the status code as a fallback', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 500 }));
    const user = userEvent.setup();
    const { approve } = renderApprove();

    await user.click(approve);

    await waitFor(() => {
      expect(screen.getByText(/approve failed \(500\)/)).toBeTruthy();
    });
  });
});
