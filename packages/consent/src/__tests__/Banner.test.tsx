// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Banner } from '../components/Banner';
import { DEFAULT_DENY_STATE } from '../domain/cookie-taxonomy';

// Structural a11y is asserted here (role / aria-label / aria-expanded /
// disabled + keyboard interactions). Full axe-core compliance lives in
// the Playwright `@a11y` spec in apps/web/tests/playwright/a11y/ — that
// suite runs against the real-browser-rendered Banner where the
// @axe-core/playwright matcher is already wired (no extra workspace
// dependency needed at this tier).

afterEach(() => {
  cleanup();
});

describe('Banner', () => {
  it('renders as a labeled region (not a modal) — WAI cookie-banner guidance', () => {
    render(
      <Banner
        persistConsent={vi.fn()}
        cookiePolicyHref="/en/legal/cookies"
        privacyChoicesHref="/en/legal/privacy-choices"
      />,
    );
    const region = screen.getByRole('region', { name: /cookie consent/i });
    expect(region).toBeDefined();
  });

  it('focuses the Accept-all button on mount (keyboard users can act immediately)', async () => {
    render(
      <Banner
        persistConsent={vi.fn()}
        cookiePolicyHref="/en/legal/cookies"
        privacyChoicesHref="/en/legal/privacy-choices"
      />,
    );
    await waitFor(() => {
      const acceptButton = screen.getByRole('button', { name: /accept all/i });
      expect(document.activeElement).toBe(acceptButton);
    });
  });

  it('Accept-all click commits the granted state via persistConsent', () => {
    const persist = vi.fn().mockResolvedValue(undefined);
    render(
      <Banner
        persistConsent={persist}
        cookiePolicyHref="/en/legal/cookies"
        privacyChoicesHref="/en/legal/privacy-choices"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /accept all/i }));
    expect(persist).toHaveBeenCalledWith(
      expect.objectContaining({
        essential: true,
        functional: true,
        analytics: true,
        marketing: true,
        personalization: true,
      }),
    );
  });

  it('Reject-all click commits the default-deny state via persistConsent', () => {
    const persist = vi.fn().mockResolvedValue(undefined);
    render(
      <Banner
        persistConsent={persist}
        cookiePolicyHref="/en/legal/cookies"
        privacyChoicesHref="/en/legal/privacy-choices"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /reject all/i }));
    expect(persist).toHaveBeenCalledWith(DEFAULT_DENY_STATE);
  });

  it('Escape key dismisses with default-deny state preserved (CCPA §7004(a)(2) no implicit consent)', () => {
    const persist = vi.fn().mockResolvedValue(undefined);
    render(
      <Banner
        persistConsent={persist}
        cookiePolicyHref="/en/legal/cookies"
        privacyChoicesHref="/en/legal/privacy-choices"
      />,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(persist).toHaveBeenCalledWith(DEFAULT_DENY_STATE);
  });

  it('Customize toggle expands the per-category controls (aria-expanded flips)', () => {
    render(
      <Banner
        persistConsent={vi.fn()}
        cookiePolicyHref="/en/legal/cookies"
        privacyChoicesHref="/en/legal/privacy-choices"
      />,
    );
    const customize = screen.getByRole('button', { name: /customize/i });
    expect(customize.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(customize);
    expect(customize.getAttribute('aria-expanded')).toBe('true');
  });

  it('Essential category is always-on + disabled in the customize view (cannot opt out)', () => {
    render(
      <Banner
        persistConsent={vi.fn()}
        cookiePolicyHref="/en/legal/cookies"
        privacyChoicesHref="/en/legal/privacy-choices"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /customize/i }));
    const essentialCheckbox = screen.getByRole('checkbox', {
      name: /essential cookies \(always on\)/i,
    });
    expect((essentialCheckbox as HTMLInputElement).checked).toBe(true);
    expect((essentialCheckbox as HTMLInputElement).disabled).toBe(true);
  });

  it('Save-preferences click commits the per-category draft state', () => {
    const persist = vi.fn().mockResolvedValue(undefined);
    render(
      <Banner
        persistConsent={persist}
        cookiePolicyHref="/en/legal/cookies"
        privacyChoicesHref="/en/legal/privacy-choices"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /customize/i }));
    fireEvent.click(screen.getByLabelText(/^functional$/i));
    fireEvent.click(screen.getByLabelText(/^analytics$/i));
    fireEvent.click(screen.getByRole('button', { name: /save preferences/i }));
    expect(persist).toHaveBeenCalledWith(
      expect.objectContaining({
        essential: true,
        functional: true,
        analytics: true,
        marketing: false,
        personalization: false,
      }),
    );
  });

  it('safe-area-inset-bottom padding is applied (iOS home indicator safety per D163)', () => {
    render(
      <Banner
        persistConsent={vi.fn()}
        cookiePolicyHref="/en/legal/cookies"
        privacyChoicesHref="/en/legal/privacy-choices"
      />,
    );
    const region = screen.getByRole('region', { name: /cookie consent/i });
    expect(region.getAttribute('style')).toContain('env(safe-area-inset-bottom)');
  });
});
