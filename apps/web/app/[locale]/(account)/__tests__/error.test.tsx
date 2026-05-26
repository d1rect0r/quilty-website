import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

const { default: AccountError } = await import('../error');

function renderAccountError(error: Error & { digest?: string }, reset = vi.fn()) {
  return render(<AccountError error={error} reset={reset} />);
}

describe('app/[locale]/(account)/error.tsx', () => {
  beforeEach(() => {
    captureExceptionSpy.mockReset();
    loggerErrorSpy.mockReset();
  });

  it('emits role=alert + aria-live=assertive + aria-atomic=true on the announcement region', async () => {
    renderAccountError(new Error('boom'));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
    expect(alert).toHaveAttribute('aria-atomic', 'true');
    expect(alert).toHaveTextContent(/your session is still active/i);
  });

  it('focuses the h1 on mount', () => {
    renderAccountError(new Error('boom'));
    const heading = screen.getByRole('heading', {
      level: 1,
      name: /we couldn’t load this page/i,
    });
    expect(heading).toHaveAttribute('tabindex', '-1');
    expect(document.activeElement).toBe(heading);
  });

  it('reports with the account-error boundary tag', () => {
    const error: Error & { digest?: string } = Object.assign(new Error('boom'), {
      digest: 'acct789',
    });
    renderAccountError(error);
    expect(captureExceptionSpy).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ boundary: 'account-error', digest: 'acct789' }),
    );
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      'error_boundary_caught',
      expect.objectContaining({ boundary: 'account-error', digest: 'acct789' }),
    );
  });

  it('preserves signed-in chrome by linking back to /en/account rather than /en', () => {
    renderAccountError(new Error('boom'));
    const goToProfile = screen.getByRole('link', { name: /go to profile/i });
    expect(goToProfile.getAttribute('href')).toBe('/en/account');
  });

  it('D147 — second reset click within 5s reveals the permanent fallback', async () => {
    const user = userEvent.setup();
    const resetSpy = vi.fn();
    renderAccountError(new Error('boom'), resetSpy);

    const retryButton = screen.getByRole('button', { name: /try again/i });
    await user.click(retryButton);
    await user.click(retryButton);

    expect(resetSpy).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
    expect(screen.getByRole('link', { name: /go to profile/i })).toBeInTheDocument();
  });
});
