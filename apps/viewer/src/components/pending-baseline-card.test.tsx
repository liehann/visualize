import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PendingBaselineCard } from './pending-baseline-card.js';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const baseProps = {
  baselineId: 'bl-1',
  name: 'home/dashboard',
  path: 'tests/e2e/__screenshots__/home/dashboard.png',
  src: '/api/files/baselines/x/y.png',
  width: 400,
  height: 300,
};

function renderApproveBtn() {
  // Use container.querySelector instead of getByRole('button') —
  // happy-dom appears to surface the lucide SVG icons as additional
  // role=button matches in some cases, which makes screen.getByRole
  // throw "multiple elements". The card has exactly one <button>.
  const utils = render(<PendingBaselineCard {...baseProps} />);
  const button = utils.container.querySelector('button');
  if (!button) throw new Error('no button rendered');
  return { button, ...utils };
}

describe('<PendingBaselineCard>', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the baseline image, name, and path', () => {
    render(<PendingBaselineCard {...baseProps} />);
    expect(screen.getByText('home/dashboard')).toBeTruthy();
    expect(
      screen.getByText('tests/e2e/__screenshots__/home/dashboard.png'),
    ).toBeTruthy();
    expect(screen.getByAltText('home/dashboard')).toBeTruthy();
  });

  it('on success: posts to the baseline approve endpoint and flips to "approved"', async () => {
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const user = userEvent.setup();
    const { button } = renderApproveBtn();

    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText(/^approved$/i)).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/baselines/bl-1/approve', {
      method: 'POST',
    });
  });

  it('on JSON 500 with `detail`: surfaces the server error message', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'baseline approve failed',
          detail: 'EROFS: read-only file system',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const user = userEvent.setup();
    const { button } = renderApproveBtn();

    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText(/EROFS: read-only file system/)).toBeTruthy();
    });
  });

  it('on opaque 500 with no body: falls back to the status code', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 500 }));
    const user = userEvent.setup();
    const { button } = renderApproveBtn();

    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText(/approve failed \(500\)/)).toBeTruthy();
    });
  });
});
