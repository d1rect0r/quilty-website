import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateCsrfToken, makeRenderTimestamp } from '@quilty/security';
import { __resetIdempotencyForTesting } from '@/lib/idempotency';
import type { SentryEventLike } from '@quilty/observability';

/**
 * /api/contact Route Handler integration tests.
 *
 * Strategy:
 *   - vi.mock the composition root to inject a fake container whose
 *     ports record calls; assert the 8-piece sequence enforces each
 *     gate in order.
 *   - Mint real CSRF + time tokens via the @quilty/security primitives
 *     so verifyCsrf / verifyTimeTrap pass the real implementation.
 *   - Spy on emailSender.send to assert success-path delivery; spy
 *     on rateLimiter.consume to drive the throttled branch.
 */

const VALID_CSRF_SECRET = 'a'.repeat(32);
const SITE_ORIGIN = 'https://my-quilty.com';

interface FakeContainerOptions {
  readonly captchaPass?: boolean;
  readonly rateLimitAllow?: boolean;
  readonly sendOk?: boolean;
}

function makeFakeContainer(opts: FakeContainerOptions = {}) {
  return {
    runtime: 'server' as const,
    sanitizer: {
      scrub: <T>(v: T): T => v,
      scrubAsync: async <T>(v: T): Promise<T> => v,
      isSensitiveKey: () => false,
      assertNoPHI: () => undefined,
    },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    errorReporter: { captureException: vi.fn() },
    analytics: { track: vi.fn() },
    featureFlags: { flag: vi.fn(), all: () => ({}) },
    phiScrubber: { scrubSentryEvent: (e: SentryEventLike): SentryEventLike | null => e },
    emailSender: {
      send: vi
        .fn()
        .mockResolvedValue(
          opts.sendOk === false
            ? { ok: false, reason: 'transient', message: 'simulated' }
            : { ok: true, providerId: 'inmem-1' },
        ),
    },
    captchaVerifier: {
      verify: vi
        .fn()
        .mockResolvedValue(
          opts.captchaPass === false
            ? { ok: false, reason: 'invalid-input-response' }
            : { ok: true, action: 'contact_form', hostname: 'my-quilty.com' },
        ),
    },
    rateLimiter: {
      consume: vi
        .fn()
        .mockResolvedValue(
          opts.rateLimitAllow === false
            ? { allowed: false, remaining: 0, resetAtMs: Date.now() + 60_000, retryAfterMs: 60_000 }
            : { allowed: true, remaining: 4, resetAtMs: Date.now() + 60_000 },
        ),
    },
    consentStore: { migrate: vi.fn(), set: vi.fn(), get: vi.fn() },
  };
}

let fakeContainer = makeFakeContainer();

vi.mock('@/composition.server', () => ({
  makeServerContainer: () => fakeContainer,
}));

vi.mock('@/lib/get-container', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    getServerContainer: () => fakeContainer,
  };
});

const mockHeaders = new Map<string, string>();
const mockCookies = new Map<string, string>();

vi.mock('next/headers', () => ({
  headers: async () => ({
    get: (k: string) => mockHeaders.get(k.toLowerCase()) ?? null,
  }),
  cookies: async () => ({
    get: (k: string) => (mockCookies.has(k) ? { name: k, value: mockCookies.get(k) } : undefined),
    set: (entry: { name: string; value: string }) => mockCookies.set(entry.name, entry.value),
  }),
}));

async function makeValidBody(overrides: Partial<Record<string, unknown>> = {}) {
  const csrf = generateCsrfToken();
  mockCookies.set('__Host-quilty_csrf', csrf);
  mockHeaders.set('origin', SITE_ORIGIN);
  mockHeaders.set('x-quilty-csrf', csrf);
  mockHeaders.set('x-forwarded-for', '203.0.113.42');
  const time_token = makeRenderTimestamp();
  await new Promise((r) => setTimeout(r, 1600));
  return {
    name: 'Alice',
    email: 'alice@example.com',
    subject: 'Hi',
    message: 'I would like to learn more.',
    csrf_token: csrf,
    time_token,
    idempotency_key: '550e8400-e29b-41d4-a716-446655440000',
    turnstile_token: 'inmem-pass',
    ...overrides,
  };
}

function makeRequest(body: unknown): Request {
  return new Request('https://my-quilty.com/api/contact', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/contact POST', () => {
  beforeEach(() => {
    vi.stubEnv('CSRF_SECRET', VALID_CSRF_SECRET);
    vi.stubEnv('QUILTY_SITE_ORIGIN', SITE_ORIGIN);
    fakeContainer = makeFakeContainer();
    mockHeaders.clear();
    mockCookies.clear();
    __resetIdempotencyForTesting();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns ok + digest on the happy path + dispatches email', async () => {
    const body = await makeValidBody();
    const { POST } = await import('../route');
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(200);
    const envelope = await res.json();
    expect(envelope.ok).toBe(true);
    expect(envelope.digest).toMatch(/^q1m_/);
    expect(fakeContainer.emailSender.send).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'contact_acknowledgement',
        to: 'alice@example.com',
      }),
    );
  });

  it('rejects with reason=validation when Zod schema fails', async () => {
    const body = await makeValidBody({ email: 'not-an-email' });
    const { POST } = await import('../route');
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(400);
    const envelope = await res.json();
    expect(envelope.ok).toBe(false);
    expect(envelope.reason).toBe('validation');
    expect(envelope.field_errors?.email).toBeDefined();
  });

  it('D31 invariant: validation response NEVER echoes user-submitted content', async () => {
    // A future Zod refine that interpolates the input value into the
    // error message (e.g., `\`\${v} is not a valid subject\``) would
    // leak user content to the JSON response. This test guards
    // against that drift by asserting no submitted field value
    // appears anywhere in the validation envelope.
    const SENTINEL = 'UNIQUE_SENTINEL_PAYLOAD_42';
    const body = await makeValidBody({
      email: 'not-an-email',
      message: SENTINEL,
      subject: SENTINEL,
      name: SENTINEL,
    });
    const { POST } = await import('../route');
    const res = await POST(makeRequest(body));
    const text = await res.text();
    expect(text).not.toContain(SENTINEL);
  });

  it('rejects with reason=csrf on Origin mismatch', async () => {
    const body = await makeValidBody();
    mockHeaders.set('origin', 'https://attacker.com');
    const { POST } = await import('../route');
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(403);
    const envelope = await res.json();
    expect(envelope.reason).toBe('csrf');
  });

  it('rejects with reason=time_trap on stale or fast submit', async () => {
    const body = await makeValidBody();
    // Replace token with a freshly minted one — submitted immediately
    body.time_token = makeRenderTimestamp();
    const { POST } = await import('../route');
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(400);
    const envelope = await res.json();
    expect(envelope.reason).toBe('time_trap');
  });

  it('returns ok=true silently when honeypot is filled (no email sent)', async () => {
    const body = await makeValidBody();
    const bodyWithHoneypot = { ...body, fax_number: 'bot-fill' };
    const { POST } = await import('../route');
    const res = await POST(makeRequest(bodyWithHoneypot));
    expect(res.status).toBe(200);
    const envelope = await res.json();
    expect(envelope.ok).toBe(true);
    expect(fakeContainer.emailSender.send).not.toHaveBeenCalled();
  });

  it('rejects with reason=captcha when Turnstile verify fails', async () => {
    fakeContainer = makeFakeContainer({ captchaPass: false });
    const body = await makeValidBody();
    const { POST } = await import('../route');
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(400);
    const envelope = await res.json();
    expect(envelope.reason).toBe('captcha');
  });

  it('rejects with reason=rate_limit + retry_after_ms when limiter throttles', async () => {
    fakeContainer = makeFakeContainer({ rateLimitAllow: false });
    const body = await makeValidBody();
    const { POST } = await import('../route');
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(429);
    const envelope = await res.json();
    expect(envelope.reason).toBe('rate_limit');
    expect(envelope.retry_after_ms).toBe(60_000);
  });

  it('idempotency: a duplicate idempotency_key returns the cached envelope', async () => {
    const body = await makeValidBody();
    const { POST } = await import('../route');
    const first = await POST(makeRequest(body));
    const firstEnvelope = await first.json();
    fakeContainer.emailSender.send.mockClear();
    // Re-submit the SAME idempotency key — handler should short-circuit.
    const second = await POST(makeRequest(body));
    const secondEnvelope = await second.json();
    expect(secondEnvelope).toEqual(firstEnvelope);
    expect(fakeContainer.emailSender.send).not.toHaveBeenCalled();
  });

  it('emits X-Robots-Tag: noindex + Cache-Control: no-store on every response', async () => {
    const body = await makeValidBody();
    const { POST } = await import('../route');
    const res = await POST(makeRequest(body));
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});
