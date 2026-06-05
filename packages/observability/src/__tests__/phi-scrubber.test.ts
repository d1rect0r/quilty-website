import { describe, expect, it } from 'vitest';
import { makePhiScrubber } from '../adapters/phi-scrubber';
import type { SentryEventLike } from '../ports';

describe('makePhiScrubber', () => {
  const scrubber = makePhiScrubber();

  it('strips query string from request.url', () => {
    const evt: SentryEventLike = {
      request: { url: 'https://my-quilty.com/api/health?secret=abc&token=def' },
    };
    const out = scrubber.scrubSentryEvent(evt);
    expect(out?.request?.url).toBe('https://my-quilty.com/api/health');
  });

  it('nulls request.data (defense-in-depth against POST body capture)', () => {
    const evt: SentryEventLike = {
      request: {
        url: '/api/contact',
        data: { email: 'user@example.com', message: 'hello' },
      },
    };
    const out = scrubber.scrubSentryEvent(evt);
    expect(out?.request?.data).toBeUndefined();
  });

  it('sanitizes request.headers (Authorization + Cookie redacted)', () => {
    const evt: SentryEventLike = {
      request: {
        url: '/api/foo',
        headers: {
          authorization: 'Bearer eyJabc.def.ghi',
          cookie: '__Host-quilty-session=secret',
          'x-request-id': 'req_123',
        },
      },
    };
    const out = scrubber.scrubSentryEvent(evt);
    const headers = out?.request?.headers ?? {};
    expect(headers['authorization']).toBe('[REDACTED]');
    expect(headers['cookie']).toBe('[REDACTED]');
    expect(headers['x-request-id']).toBe('req_123');
  });

  it('sanitizes exception.values[].value — throws carrying free-text PHI', () => {
    const evt: SentryEventLike = {
      exception: {
        values: [{ type: 'Error', value: 'Failed to send email to user@example.com' }],
      },
    };
    const out = scrubber.scrubSentryEvent(evt);
    const msg = out?.exception?.values?.[0]?.value ?? '';
    expect(msg).not.toContain('user@example.com');
    expect(msg).toMatch(/\[EMAIL\]/);
  });

  it('sanitizes exception.values[].type — domain error subclass names carrying PHI', () => {
    // A custom error subclass with a PHI-shaped name (e.g.,
    // `class UserEmailValidationError extends Error`) is blocked at
    // author time by the ESLint rule, but the sink-side scrub remains
    // a defense-in-depth layer: even if a vendor SDK or third-party
    // library throws an error with a PHI-shaped class name, the
    // scrubber strips it before transmission.
    const evt: SentryEventLike = {
      exception: {
        values: [{ type: 'user@example.com lookup failed', value: 'inner' }],
      },
    };
    const out = scrubber.scrubSentryEvent(evt);
    const type = out?.exception?.values?.[0]?.type ?? '';
    expect(type).not.toContain('user@example.com');
    expect(type).toMatch(/\[EMAIL\]/);
  });

  it('sanitizes top-level event.message (captureMessage path)', () => {
    const evt: SentryEventLike = {
      message: 'Phone fallback: (555) 123-4567',
    };
    const out = scrubber.scrubSentryEvent(evt);
    expect(out?.message).not.toContain('(555) 123-4567');
    expect(out?.message).toMatch(/\[PHONE\]/);
  });

  it('sanitizes breadcrumbs.message + breadcrumbs.data', () => {
    const evt: SentryEventLike = {
      breadcrumbs: [
        { message: 'user@example.com clicked button', data: { email: 'user@example.com' } },
      ],
    };
    const out = scrubber.scrubSentryEvent(evt);
    const crumb = out?.breadcrumbs?.[0];
    expect(crumb?.message).not.toContain('user@example.com');
    expect(crumb?.data?.['email']).toBe('[REDACTED]');
  });

  it('sanitizes extra + tags + contexts (key-denylist applies)', () => {
    const evt: SentryEventLike = {
      extra: { email: 'user@example.com', request_id: 'req_123' },
      tags: { email: 'user@example.com', route: '/account' },
      contexts: {
        device: { advertising_id: 'idfa-123', os: 'iOS 19' },
      },
    };
    const out = scrubber.scrubSentryEvent(evt);
    expect(out?.extra?.['email']).toBe('[REDACTED]');
    expect(out?.extra?.['request_id']).toBe('req_123');
    expect(out?.tags?.['email']).toBe('[REDACTED]');
    expect(out?.tags?.['route']).toBe('/account');
    expect(out?.contexts?.['device']?.['advertising_id']).toBe('[REDACTED]');
    expect(out?.contexts?.['device']?.['os']).toBe('iOS 19');
  });

  it('redacts user.email + user.ip_address; retains user.id', () => {
    const evt: SentryEventLike = {
      user: {
        id: 'hmac.v1:abc123',
        email: 'user@example.com',
        ip_address: '203.0.113.42',
      },
    };
    const out = scrubber.scrubSentryEvent(evt);
    expect(out?.user?.id).toBe('hmac.v1:abc123');
    expect(out?.user?.email).toBe('[REDACTED]');
    expect(out?.user?.ip_address).toBe('[REDACTED]');
  });

  it('returns an event object (never null today) for normal inputs', () => {
    expect(scrubber.scrubSentryEvent({})).not.toBeNull();
    expect(scrubber.scrubSentryEvent({ message: 'plain' })).not.toBeNull();
  });

  it('preserves un-touched vendor-specific Sentry event fields via spread', () => {
    // The scrubber spreads `{...event}` before mutating the fields it
    // owns. Future-Sentry-SDK fields (`fingerprint`, `spans`,
    // `measurements`, `sdkProcessingMetadata`, etc.) must round-trip
    // intact — they're not in SentryEventLike but live on the runtime
    // event object. The generic `scrubSentryEvent<E>` signature carries
    // the concrete event type `E` (here `SentryEventLike & passthrough`)
    // straight through to the return type, so no cast is needed at the
    // call site. If a future refactor drops the spread, this test fails
    // loudly rather than silently dropping the vendor-extension fields.
    const passthroughFields = {
      fingerprint: ['my-group'],
      release: '1.2.3',
      environment: 'production',
      // SentryEventLike's user.email + user.ip_address are typed for
      // structural compatibility; here we mix one known field (user)
      // with extension fields that aren't in our port.
    } as const;
    const evt = {
      message: 'hello user@example.com',
      ...passthroughFields,
    } as SentryEventLike & typeof passthroughFields;
    const out = scrubber.scrubSentryEvent(evt);
    expect(out?.fingerprint).toEqual(['my-group']);
    expect(out?.release).toBe('1.2.3');
    expect(out?.environment).toBe('production');
    // And the message field IS scrubbed:
    expect(out?.message).toMatch(/\[EMAIL\]/);
  });
});
