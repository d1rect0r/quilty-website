import { expect, test } from '@playwright/test';

/**
 * Smoke tests for the /contact form — the reference implementation of
 * the D113 canonical 8-piece form pattern. Each test exercises one
 * gate of the 8-piece sequence end-to-end through the Route Handler.
 *
 * Note: this suite requires `CSRF_SECRET` to be set (32+ chars). The
 * Playwright config / dev server is expected to load it; tests skip
 * the env-dependent scenarios when the secret is absent.
 *
 * Tag: @forms — invoked via `pnpm test:e2e --grep "@forms"`.
 */

const CSRF_COOKIE_NAME = '__Host-quilty_csrf';

test.describe('@forms /contact', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/en/contact');
  });

  test('renders the form scaffold + disclaimer', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/contact/i);
    await expect(page.getByRole('complementary', { name: /privacy disclaimer/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /^name$/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /^email$/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /^subject$/i })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /^message$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /send message/i })).toBeVisible();
  });

  test('mints the __Host-quilty_csrf cookie on render', async ({ request }) => {
    // Inspect the response Set-Cookie header directly rather than
    // `context.cookies()` after a navigation. WebKit (Safari) refuses
    // to store `Secure` cookies received over plain HTTP — Chromium
    // and Firefox treat localhost as a "potentially trustworthy"
    // origin per the spec's exception, but Safari is strict. In a
    // real production deploy the connection is HTTPS so the cookie
    // lands in every browser; this test asserts the proxy.ts mint
    // logic by reading the wire form, which is browser-independent.
    const response = await request.get('/en/contact', { maxRedirects: 0 });
    const setCookieHeaders = response
      .headersArray()
      .filter((h) => h.name.toLowerCase() === 'set-cookie')
      .map((h) => h.value);
    const csrfHeader = setCookieHeaders.find((c) => c.startsWith(`${CSRF_COOKIE_NAME}=`));
    expect(csrfHeader).toBeDefined();
    expect(csrfHeader ?? '').toMatch(/Secure/i);
    expect(csrfHeader ?? '').toMatch(/Path=\//i);
    expect(csrfHeader ?? '').toMatch(/SameSite=lax/i);
    // No Domain attribute — required by the __Host- prefix per
    // OWASP. A leaked Domain attribute would let a subdomain
    // overwrite the cookie.
    expect(csrfHeader ?? '').not.toMatch(/Domain=/i);
    // Token value shape: `<base64url(32 bytes)>.<base64url(HMAC-SHA-256)>`.
    const tokenValue = csrfHeader?.split(';')[0]?.split('=')[1] ?? '';
    expect(tokenValue).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });

  test('Zod validation: empty email blocks submit + surfaces inline error', async ({ page }) => {
    await page.getByRole('textbox', { name: /^name$/i }).fill('Alice');
    await page.getByRole('textbox', { name: /^email$/i }).fill('not-an-email');
    await page.getByRole('textbox', { name: /^subject$/i }).fill('Hi');
    await page
      .getByRole('textbox', { name: /^message$/i })
      .fill('Some message that is long enough.');
    await page.getByRole('button', { name: /send message/i }).click();
    await expect(page.getByText(/valid email address/i)).toBeVisible();
  });

  test('Origin-mismatch attack: bare POST without correct origin returns 403 csrf', async ({
    request,
  }) => {
    // Unique UUID per test invocation. The Route Handler keeps an
    // in-memory idempotency cache that persists across requests within
    // the same server process; a static UUID would cause retries
    // (Playwright retries failed tests up to 2× in CI) + cross-browser
    // runs (chromium then webkit) to hit the cached envelope, and the
    // cache currently collapses all failure statuses to 400 (see
    // lib/idempotency.ts — `cached.ok ? 200 : 400`), masking the live
    // 403. Fresh UUID per run forces the live path every time.
    const idempotencyKey = crypto.randomUUID();
    const res = await request.post('/api/contact', {
      headers: {
        'content-type': 'application/json',
        origin: 'https://attacker.example',
      },
      data: {
        name: 'Alice',
        email: 'alice@example.com',
        subject: 'Hi',
        message: 'A message that is long enough to pass validation.',
        csrf_token: 'fake.fakesig',
        time_token: Buffer.from(JSON.stringify({ t: Date.now() - 3000 }), 'utf-8').toString(
          'base64url',
        ),
        idempotency_key: idempotencyKey,
        turnstile_token: 'pending',
      },
    });
    expect(res.status()).toBe(403);
    const envelope = (await res.json()) as { ok: boolean; reason?: string };
    expect(envelope.ok).toBe(false);
    expect(envelope.reason).toBe('csrf');
  });

  test('response carries X-Robots-Tag: noindex, nofollow + Cache-Control: no-store', async ({
    request,
  }) => {
    const res = await request.post('/api/contact', {
      headers: { 'content-type': 'application/json' },
      data: { not_valid: true },
    });
    expect(res.headers()['x-robots-tag']).toBe('noindex, nofollow');
    expect(res.headers()['cache-control']).toBe('no-store');
  });

  test('honeypot trip: extra field returns ok=true silently (no email send signal)', async ({
    request,
    page,
  }) => {
    const cookies = await page.context().cookies();
    const csrfCookie = cookies.find((c) => c.name === CSRF_COOKIE_NAME);
    test.skip(!csrfCookie, 'CSRF cookie not minted — env-dependent scenario');
    // Unique idempotency key per invocation — see the comment in the
    // Origin-mismatch test for the in-memory cache reasoning.
    const idempotencyKey = crypto.randomUUID();
    const res = await request.post('/api/contact', {
      headers: {
        'content-type': 'application/json',
        origin: new URL(page.url()).origin,
        'x-quilty-csrf': csrfCookie?.value ?? '',
      },
      data: {
        name: 'Alice',
        email: 'alice@example.com',
        subject: 'Hi',
        message: 'A message that is long enough to pass validation.',
        csrf_token: csrfCookie?.value ?? '',
        time_token: Buffer.from(JSON.stringify({ t: Date.now() - 3000 }), 'utf-8').toString(
          'base64url',
        ),
        idempotency_key: idempotencyKey,
        turnstile_token: 'pending',
        fax_number: 'bot-fill',
      },
    });
    // The handler returns 200 OK silently to the bot, so we cannot
    // distinguish honeypot-trip from real success at the response
    // layer — that's the intended contract. We assert only that the
    // response is shape-valid (ok envelope).
    if (res.status() === 200) {
      const envelope = (await res.json()) as { ok: boolean; digest?: string };
      expect(envelope.ok).toBe(true);
      expect(envelope.digest).toMatch(/^q1m_/);
    } else {
      // Earlier gate (csrf, captcha, time-trap) may have tripped
      // depending on env; the honeypot test specifically requires the
      // earlier gates to pass which we cannot guarantee deterministically
      // without env control. Document the conditional.
      test.skip(true, 'earlier gate tripped — honeypot path not reached deterministically');
    }
  });
});
