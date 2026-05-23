import { expect, test } from '@playwright/test';

/**
 * RFC 9116 security.txt smoke + schema assertions.
 *
 * The static file at `/.well-known/security.txt` is the canonical
 * machine-readable disclosure surface. Security-research tooling +
 * compliance scanners + GitHub's own discovery flow all read it. A
 * missing file, wrong MIME type, or stale `Expires:` value silently
 * degrades disclosure UX for researchers — covered by the CI gate at
 * `scripts/check-security-txt-expires.mjs` AND by the assertions
 * below as defense-in-depth.
 */

test('@seo /.well-known/security.txt serves with status 200 + text/plain', async ({ request }) => {
  const response = await request.get('/.well-known/security.txt');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('text/plain');
});

test('@seo /.well-known/security.txt carries a 1h public Cache-Control', async ({ request }) => {
  const response = await request.get('/.well-known/security.txt');
  // 1h CDN TTL: short enough that an annual rotation propagates within
  // the hour; long enough not to hammer origin.
  expect(response.headers()['cache-control']).toContain('max-age=3600');
});

test('@seo /.well-known/security.txt declares all required RFC 9116 fields', async ({
  request,
}) => {
  const body = await (await request.get('/.well-known/security.txt')).text();

  // Contact: mailto: form is convergent enterprise practice (Linear /
  // BetterHelp / Vercel pattern). HackerOne URL form is reserved for
  // public bug-bounty programs (Stripe / Cloudflare / Anthropic
  // pattern) — out of scope at this stage.
  expect(body).toMatch(/^Contact:\s*mailto:security@my-quilty\.com/m);

  // Expires: RFC 3339 with UTC Z suffix. The CI gate at
  // scripts/check-security-txt-expires.mjs enforces the ≥30-day
  // window separately; this assertion confirms the on-the-wire
  // value has the right shape. Avoids the capture-group +
  // non-null-assertion shape that no-non-null-assertion forbids.
  expect(body).toMatch(/^Expires:\s*\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/m);

  // Preferred-Languages, Canonical, Policy — recommended-but-optional
  // per RFC 9116, all 5/6 reference shops ship them.
  expect(body).toMatch(/^Preferred-Languages:\s*en/m);
  expect(body).toMatch(/^Canonical:\s*https:\/\/my-quilty\.com\/\.well-known\/security\.txt/m);
  expect(body).toMatch(/^Policy:\s*https:\/\/my-quilty\.com\/en\/security/m);
});

test('@seo /security marketing page serves the policy content', async ({ page }) => {
  await page.goto('/en/security');
  // Page exists (no 404, no error boundary).
  // Anchor on the h1's role + name rather than an id — the section
  // landmark redesign dropped the `id="security-heading"` anchor that
  // previously paired with `aria-labelledby` (the nested-region
  // pattern under <main> was retired).
  await expect(page.getByRole('heading', { level: 1, name: 'Security' })).toBeVisible();
  // HIPAA-aligned "no PHI" warning — convergent peer disclosure pages
  // (Stripe / Anthropic / Linear / Cloudflare / BetterHelp) omit it;
  // for a consumer-health product the warning is the real-exposure
  // guard against researchers including real user data in PoCs.
  await expect(
    page.getByRole('heading', { name: /no protected health information/i }),
  ).toBeVisible();
  // Machine-readable cross-reference.
  await expect(page.getByRole('link', { name: '/.well-known/security.txt' })).toBeVisible();
});

test('@seo /security marketing page is indexable (unlike stubs)', async ({ page }) => {
  await page.goto('/en/security');
  // Security policy pages must be findable by researchers and
  // automated tooling. Confirm the page does NOT carry a
  // `robots: { index: false }` directive (which would render as
  // `<meta name="robots" content="noindex">`).
  const noindexMeta = await page.locator('meta[name="robots"][content*="noindex"]').count();
  expect(noindexMeta).toBe(0);
});
