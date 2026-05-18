import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { track } from '@/lib/observability/track';
import type { ConsentState } from '@/lib/observability/consent';

const consentGranted: ConsentState = {
  necessary: true,
  analytics: true,
  marketing: true,
  preferences: true,
  gpc_detected: false,
};

const consentDenied: ConsentState = {
  necessary: true,
  analytics: false,
  marketing: false,
  preferences: false,
  gpc_detected: false,
};

describe('track (consent gating)', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it('emits when consent.analytics is true', async () => {
    await track(
      { name: 'page_view', props: { route: '/en', locale: 'en' } },
      { consent: consentGranted, session_id: 'sess-abc' },
    );
    expect(logSpy).toHaveBeenCalled();
    const emitted = JSON.parse((logSpy.mock.calls[0]?.[0] as string) ?? '{}');
    expect(emitted.event_name).toBe('page_view');
    expect(emitted.route).toBe('/en');
    expect(emitted.locale).toBe('en');
  });

  it('does NOT emit when consent.analytics is false (Cerebral defense)', async () => {
    await track(
      { name: 'page_view', props: { route: '/en', locale: 'en' } },
      { consent: consentDenied, session_id: 'sess-abc' },
    );
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('throws in development if a payload contains PHI keys', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    await expect(
      track(
        // @ts-expect-error — intentionally constructing an invalid event for the runtime PHI assertion test
        {
          name: 'page_view',
          props: { route: '/en', locale: 'en', email: 'leak@example.com' },
        },
        { consent: consentGranted, session_id: 'sess-abc' },
      ),
    ).rejects.toThrow(/PHI keys detected/);
  });

  it('sanitizes UUID-shaped values in event props before emission', async () => {
    await track(
      {
        name: 'cta_click',
        props: {
          cta_id: '550e8400-e29b-41d4-a716-446655440000',
          location: 'header',
        },
      },
      { consent: consentGranted, session_id: 'sess-abc' },
    );
    expect(logSpy).toHaveBeenCalled();
    const emitted = JSON.parse((logSpy.mock.calls[0]?.[0] as string) ?? '{}');
    expect(emitted.cta_id).toMatch(/^id:[0-9a-f]{8}$/);
    expect(emitted.location).toBe('header');
  });
});
