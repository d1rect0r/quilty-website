import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientContainer } from '@/lib/get-container';

const captureExceptionSpy = vi.fn();
const loggerErrorSpy = vi.fn();

// Mirror of apps/web/app/__tests__/error.test.tsx contract (Commit 15)
// — the per-group error.tsx files share the same WCAG 2.2 AA + D147
// retry-fallback discipline as the apex boundary. ClientContainer
// type annotation forces a port-shape expansion to fail this test
// at compile time rather than silently returning undefined.
function makeMockClientContainer(): ClientContainer {
  return {
    runtime: 'client',
    sanitizer: {
      scrub: <T,>(value: T) => value,
      scrubAsync: async <T,>(value: T) => value,
      isSensitiveKey: () => false,
      assertNoPHI: () => undefined,
    },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: loggerErrorSpy,
      debug: vi.fn(),
    },
    errorReporter: { captureException: captureExceptionSpy },
    analytics: { track: vi.fn() },
    featureFlags: { flag: vi.fn(), all: () => ({}) },
    phiScrubber: { scrubSentryEvent: (event) => event },
  };
}

vi.mock('@/lib/get-container', () => ({
  getClientContainer: () => makeMockClientContainer(),
}));

vi.mock('@/composition.client', () => ({
  makeClientContainer: () => undefined,
}));

const { default: MarketingError } = await import('../error');

function renderMarketingError(error: Error & { digest?: string }, reset = vi.fn()) {
  return render(<MarketingError error={error} reset={reset} />);
}

describe('app/[locale]/(marketing)/error.tsx', () => {
  beforeEach(() => {
    captureExceptionSpy.mockReset();
    loggerErrorSpy.mockReset();
  });

  it('emits role=alert + aria-live=assertive + aria-atomic=true on the announcement region', async () => {
    renderMarketingError(new Error('boom'));
    // Region must be in the DOM before AT registers it (ARIA 1.2
    // §6.6.3) — empty on first render, populated via useEffect.
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
    expect(alert).toHaveAttribute('aria-atomic', 'true');
    // After mount, the announcement copy is injected.
    expect(alert).toHaveTextContent(/we’ve been notified/i);
  });

  it('focuses the h1 on mount (WCAG 2.4.3 + 3.2.5 context-change focus)', () => {
    renderMarketingError(new Error('boom'));
    const heading = screen.getByRole('heading', { level: 1, name: /unexpected error/i });
    expect(heading).toHaveAttribute('tabindex', '-1');
    expect(document.activeElement).toBe(heading);
  });

  it('renders the digest with data-testid when present', () => {
    const error: Error & { digest?: string } = Object.assign(new Error('boom'), {
      digest: 'mkt123',
    });
    renderMarketingError(error);
    expect(screen.getByTestId('marketing-error-digest')).toHaveTextContent('mkt123');
  });

  it('reports to ErrorReporter + Logger with the marketing-error boundary tag', () => {
    const error: Error & { digest?: string } = Object.assign(new Error('boom'), {
      digest: 'mkt456',
    });
    renderMarketingError(error);
    expect(captureExceptionSpy).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ boundary: 'marketing-error', digest: 'mkt456' }),
    );
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      'boom',
      expect.objectContaining({
        boundary: 'marketing-error',
        error_name: 'Error',
        digest: 'mkt456',
      }),
    );
  });

  it('D147 — second reset click within 5s reveals the permanent fallback', async () => {
    const user = userEvent.setup();
    const resetSpy = vi.fn();
    renderMarketingError(new Error('boom'), resetSpy);

    const retryButton = screen.getByRole('button', { name: /try again/i });
    await user.click(retryButton);
    expect(resetSpy).toHaveBeenCalledTimes(1);

    await user.click(retryButton);
    expect(resetSpy).toHaveBeenCalledTimes(1);

    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
    expect(screen.getByRole('link', { name: /go home/i })).toBeInTheDocument();
  });

  it('mailto subject encodes the digest defensively', () => {
    const error: Error & { digest?: string } = Object.assign(new Error('boom'), {
      digest: 'has space?',
    });
    renderMarketingError(error);
    const supportLink = screen.getByRole('link', { name: /email support/i });
    const href = supportLink.getAttribute('href');
    expect(href).toMatch(/^mailto:support@my-quilty\.app\?subject=/);
    expect(href).toContain(encodeURIComponent('Error has space?'));
  });
});
