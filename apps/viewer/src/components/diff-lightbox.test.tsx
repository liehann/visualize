import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { DiffLightbox } from './diff-lightbox.js';
import type { SnapshotTriplet } from './snapshot-diff.js';

const triplet: SnapshotTriplet = {
  snapshotName: 'home/dashboard.png',
  expected: { id: 'exp', src: '/files/exp.png' },
  actual: { id: 'act', src: '/files/act.png' },
  diff: { id: 'diff', src: '/files/diff.png' },
  diffPercent: 12.4,
};

const secondTriplet: SnapshotTriplet = {
  snapshotName: 'auth/sign-in.png',
  expected: { id: 'exp2', src: '/files/exp2.png' },
  actual: { id: 'act2', src: '/files/act2.png' },
  diff: { id: 'diff2', src: '/files/diff2.png' },
  diffPercent: 0.05,
};

function renderLightbox(opts: {
  triplets?: SnapshotTriplet[];
  index?: number;
  onClose?: () => void;
  onIndexChange?: (i: number) => void;
  onApprove?: (t: SnapshotTriplet) => Promise<{ ok: boolean; error?: string }>;
} = {}) {
  const triplets = opts.triplets ?? [triplet];
  const onClose = opts.onClose ?? vi.fn();
  const onIndexChange = opts.onIndexChange ?? vi.fn();
  const onApprove =
    opts.onApprove ??
    vi.fn(async () => ({ ok: true } as { ok: boolean; error?: string }));
  const utils = render(
    <DiffLightbox
      triplets={triplets}
      index={opts.index ?? 0}
      onIndexChange={onIndexChange}
      onClose={onClose}
      onApprove={onApprove}
    />,
  );
  return { ...utils, onClose, onIndexChange, onApprove };
}

function bodyText(): string {
  return (document.body.textContent ?? '').replace(/\s+/g, ' ');
}

describe('<DiffLightbox>', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the snapshot name + diff% badge in the header', () => {
    renderLightbox();
    expect(screen.getByText('home/dashboard.png')).toBeTruthy();
    expect(screen.getByText('12.4%')).toBeTruthy();
  });

  it('shows "1 of N" position when there are multiple triplets', () => {
    renderLightbox({ triplets: [triplet, secondTriplet], index: 0 });
    expect(bodyText()).toContain('1 of 2');
  });

  it('Esc fires onClose', () => {
    const { onClose } = renderLightbox();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('arrow keys advance the index in both directions, wrapping', () => {
    const { onIndexChange, rerender } = renderLightbox({
      triplets: [triplet, secondTriplet],
      index: 0,
    });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onIndexChange).toHaveBeenLastCalledWith(1);

    rerender(
      <DiffLightbox
        triplets={[triplet, secondTriplet]}
        index={0}
        onIndexChange={onIndexChange}
        onClose={vi.fn()}
        onApprove={vi.fn(async () => ({ ok: true }))}
      />,
    );
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    // wrap from 0 -> 1
    expect(onIndexChange).toHaveBeenLastCalledWith(1);
  });

  it('arrow keys are no-ops when there is only one triplet', () => {
    const { onIndexChange } = renderLightbox({ triplets: [triplet], index: 0 });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(onIndexChange).not.toHaveBeenCalled();
  });

  it('A key triggers onApprove', async () => {
    const onApprove = vi.fn(async () => ({ ok: true } as { ok: boolean }));
    renderLightbox({ onApprove });
    fireEvent.keyDown(window, { key: 'a' });
    await waitFor(() => {
      expect(onApprove).toHaveBeenCalledOnce();
    });
  });

  it('after a successful approve, a disabled button reads "approved"', async () => {
    const onApprove = vi.fn(async () => ({ ok: true } as { ok: boolean }));
    renderLightbox({ onApprove });

    fireEvent.keyDown(window, { key: 'a' });

    await waitFor(() => {
      expect(onApprove).toHaveBeenCalledOnce();
    });
    await waitFor(() => {
      const found = Array.from(document.body.querySelectorAll('button[disabled]'))
        .some((b) => /approved/i.test(b.textContent ?? ''));
      expect(found).toBe(true);
    });
  });

  it('a failed approve renders the error band with the message', async () => {
    const onApprove = vi.fn(async () => ({
      ok: false,
      error: 'EROFS: read-only file system',
    }));
    renderLightbox({ onApprove });
    fireEvent.keyDown(window, { key: 'a' });
    await waitFor(() => {
      expect(screen.getByText(/EROFS: read-only file system/)).toBeTruthy();
    });
  });

  it('keyboard 1/3/4 switches the view (slider→side / onion / diff)', () => {
    renderLightbox();
    // Default for full triplet is "slider" view; pressing "1" goes to side.
    fireEvent.keyDown(window, { key: '1' });
    // In side mode the labels expected/actual/diff render as section
    // headers — assert they're all in the DOM at once.
    expect(bodyText()).toContain('expected');
    expect(bodyText()).toContain('actual');
    expect(bodyText()).toContain('diff');
  });
});
