import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientContainer } from '@/lib/get-container';

const captureExceptionSpy = vi.fn();
const loggerErrorSpy = vi.fn();
const featureFlagsEvalSpy = vi.fn();

// The mock's return type is annotated as `ClientContainer` so a future
// expansion of the port surface fails this test at compile time
// rather than silently returning `undefined` at runtime.
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
    featureFlags: { flag: featureFlagsEvalSpy, all: () => ({}) },
    phiScrubber: { scrubSentryEvent: (event) => event },
  };
}

vi.mock('@/lib/get-container', () => ({
  getClientContainer: () => makeMockClientContainer(),
}));

vi.mock('@/composition.client', () => ({
  makeClientContainer: () => undefined,
}));

const { default: ErrorPage } = await import('../error');

function renderErrorPage(error: Error & { digest?: string }, reset = vi.fn()) {
  return render(<ErrorPage error={error} reset={reset} />);
}

describe('app/error.tsx', () => {
  beforeEach(() => {
    captureExceptionSpy.mockReset();
    loggerErrorSpy.mockReset();
  });

  it('emits role=alert + aria-live=assertive + aria-atomic=true on the announcement region', () => {
    renderErrorPage(new Error('boom'));
    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
    expect(alert).toHaveAttribute('aria-atomic', 'true');
  });

  it('focuses the heading on mount (WCAG 2.4.3 + 3.2.5 context change)', () => {
    renderErrorPage(new Error('boom'));
    const heading = screen.getByRole('heading', { level: 1, name: /unexpected error/i });
    expect(heading).toHaveAttribute('tabindex', '-1');
    expect(document.activeElement).toBe(heading);
  });

  it('renders the digest with data-testid when present', () => {
    const error: Error & { digest?: string } = Object.assign(new Error('boom'), {
      digest: 'abc123def456',
    });
    renderErrorPage(error);
    const digestEl = screen.getByTestId('error-digest');
    expect(digestEl).toHaveTextContent('abc123def456');
  });

  it('omits the digest paragraph when the error carries no digest', () => {
    renderErrorPage(new Error('boom'));
    expect(screen.queryByTestId('error-digest')).toBeNull();
  });

  it('reports to ErrorReporter + Logger with the app-error boundary tag', () => {
    const error: Error & { digest?: string } = Object.assign(new Error('boom'), {
      digest: 'abc123',
    });
    renderErrorPage(error);
    expect(captureExceptionSpy).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ boundary: 'app-error', digest: 'abc123' }),
    );
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      'boom',
      expect.objectContaining({
        boundary: 'app-error',
        error_name: 'Error',
        digest: 'abc123',
      }),
    );
  });

  it('first reset click calls the reset prop; second click within the retry window reveals the permanent fallback', async () => {
    const user = userEvent.setup();
    const resetSpy = vi.fn();
    renderErrorPage(new Error('boom'), resetSpy);

    const retryButton = screen.getByRole('button', { name: /try again/i });
    await user.click(retryButton);
    expect(resetSpy).toHaveBeenCalledTimes(1);

    // Second click within the 5s window — error-state stays the same
    // (Next.js would have re-mounted the component if reset cleared
    // the error; here we model the "reset didn't help" path).
    await user.click(retryButton);
    expect(resetSpy).toHaveBeenCalledTimes(1);

    // Try-again button is now removed; Go-home + Email-support remain.
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
    expect(screen.getByRole('link', { name: /go home/i })).toBeInTheDocument();
  });

  it('encodes the digest into the mailto subject (defense-in-depth against control-character drift)', () => {
    const error: Error & { digest?: string } = Object.assign(new Error('boom'), {
      digest: 'abc 123/!?',
    });
    renderErrorPage(error);
    const supportLink = screen.getByRole('link', { name: /email support/i });
    const href = supportLink.getAttribute('href');
    expect(href).toMatch(/^mailto:support@my-quilty\.app\?subject=/);
    expect(href).toContain(encodeURIComponent('Error abc 123/!?'));
  });

  it('falls back to a digest-less mailto when no digest is present', () => {
    renderErrorPage(new Error('boom'));
    const supportLink = screen.getByRole('link', { name: /email support/i });
    expect(supportLink.getAttribute('href')).toBe('mailto:support@my-quilty.app');
  });
});
