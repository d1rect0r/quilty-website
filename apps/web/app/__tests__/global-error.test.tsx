import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientContainer } from '@/lib/get-container';

const captureExceptionSpy = vi.fn();
const loggerErrorSpy = vi.fn();

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

// global-error.tsx renders its own <html><body>, so render() into a
// detached container produces nested html — which is structurally OK
// for the assertions; React testing-library + jsdom tolerate the
// nesting at the assertion layer (not at the live-DOM layer).
const { default: GlobalError } = await import('../global-error');

function renderGlobalError(error: Error & { digest?: string }, reset = vi.fn()) {
  return render(<GlobalError error={error} reset={reset} />);
}

describe('app/global-error.tsx', () => {
  beforeEach(() => {
    captureExceptionSpy.mockReset();
    loggerErrorSpy.mockReset();
  });

  it('emits role=alert + aria-live=assertive + aria-atomic=true on the announcement region', () => {
    renderGlobalError(new Error('layout crash'));
    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
    expect(alert).toHaveAttribute('aria-atomic', 'true');
  });

  it('focuses the heading on mount', () => {
    renderGlobalError(new Error('layout crash'));
    const heading = screen.getByRole('heading', { level: 1, name: /something went wrong/i });
    expect(heading).toHaveAttribute('tabindex', '-1');
    expect(document.activeElement).toBe(heading);
  });

  it('renders the digest with data-testid when present', () => {
    const error: Error & { digest?: string } = Object.assign(new Error('layout crash'), {
      digest: 'global-789',
    });
    renderGlobalError(error);
    const digestEl = screen.getByTestId('error-digest');
    expect(digestEl).toHaveTextContent('global-789');
  });

  it('reports to ErrorReporter + Logger with the global-error boundary tag', () => {
    const error: Error & { digest?: string } = Object.assign(new Error('layout crash'), {
      digest: 'global-789',
    });
    renderGlobalError(error);
    expect(captureExceptionSpy).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ boundary: 'global-error', digest: 'global-789' }),
    );
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      'layout crash',
      expect.objectContaining({ boundary: 'global-error', error_name: 'Error' }),
    );
  });

  it('renders the Try-again button + Go-home + Email-support CTAs on initial mount', () => {
    // The D147 retry-fallback interaction is identical to the
    // app/error.tsx implementation and is exhaustively covered in
    // error.test.tsx. Asserting interactive behavior here is
    // unreliable because React 19 partially hoists the nested
    // <html><body> the component returns, breaking event routing
    // under jsdom. The structural assertions in this suite are what
    // global-error specifically owns (root layout failed, no
    // CSS-token cascade available).
    renderGlobalError(new Error('layout crash'));
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go home/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /email support/i })).toBeInTheDocument();
  });

  it('encodes the digest into the mailto subject', () => {
    const error: Error & { digest?: string } = Object.assign(new Error('layout crash'), {
      digest: 'global 789',
    });
    renderGlobalError(error);
    const supportLink = screen.getByRole('link', { name: /email support/i });
    const href = supportLink.getAttribute('href');
    expect(href).toMatch(/^mailto:support@my-quilty\.app\?subject=/);
    expect(href).toContain(encodeURIComponent('Error global 789'));
  });
});
