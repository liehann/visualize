import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { TraceViewerButton } from './trace-viewer-button.js';

describe('<TraceViewerButton>', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the View trace button', () => {
    const { container } = render(<TraceViewerButton attachmentId="att-1" />);
    expect(container.querySelector('button')).toBeTruthy();
    expect(screen.getByText(/view trace/i)).toBeTruthy();
  });

  it('on success: requests a signed URL and opens trace.playwright.dev in a new tab', async () => {
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: true,
            playwrightTraceUrl: 'https://trace.playwright.dev/?trace=...',
          }),
          { status: 200 },
        ),
      );
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);

    const { container } = render(<TraceViewerButton attachmentId="att-1" />);
    const button = container.querySelector('button');
    if (!button) throw new Error('button not rendered');
    fireEvent.click(button);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/trace/sign/att-1', {
        method: 'POST',
      });
      expect(openSpy).toHaveBeenCalledWith(
        'https://trace.playwright.dev/?trace=...',
        '_blank',
        'noopener,noreferrer',
      );
    });
  });

  it('on JSON 500 with detail: surfaces the underlying error', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ error: 'sign failed', detail: 'attachment is not a trace' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const { container } = render(<TraceViewerButton attachmentId="att-1" />);
    const button = container.querySelector('button');
    if (!button) throw new Error('button not rendered');
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/attachment is not a trace/)).toBeTruthy();
    });
  });
});
