import { expect, test } from '@playwright/test';

/**
 * RFC 8615 + W3C webappsec-change-password-url compliance.
 *
 * Browser credential managers (Chrome, Safari, Bitwarden, 1Password,
 * Apple Passwords) use `/.well-known/change-password` to discover the
 * password-change surface. The W3C spec permits 302/303/307 and
 * explicitly prohibits 301 — the destination must remain mutable as
 * auth flows evolve.
 */

test('@seo /.well-known/change-password returns a temporary redirect to /en/account/security', async ({
  request,
}) => {
  const response = await request.get('/.well-known/change-password', {
    maxRedirects: 0,
  });
  // W3C spec permits 302/303/307; 301 (permanent) is prohibited.
  expect([302, 303, 307]).toContain(response.status());
  const location = response.headers()['location'] ?? '';
  expect(location).toContain('/en/account/security');
});

test('@seo /.well-known/change-password redirect carries Cache-Control: no-store', async ({
  request,
}) => {
  const response = await request.get('/.well-known/change-password', {
    maxRedirects: 0,
  });
  // Password managers must always re-evaluate the current pointer.
  // A cached redirect would send users to a stale URL if the
  // security page ever moves.
  expect(response.headers()['cache-control'] ?? '').toContain('no-store');
});

test('@seo /.well-known/change-password destination resolves (not 404/500)', async ({
  request,
}) => {
  // Follow the redirect — the portal security page either returns
  // 200 (signed-in) or 307 to sign-in (unauthenticated). Either is
  // acceptable per the W3C spec; what must NOT happen is a 404 or
  // server error.
  const response = await request.get('/.well-known/change-password');
  expect(response.status()).not.toBe(404);
  expect(response.status()).not.toBe(500);
  // Defense-in-depth against a future route rename leaving a 301 in
  // the resolved chain: a permanent redirect would defeat the
  // no-store cache directive on the initial hop because intermediary
  // caches would honor the 301's implicit cacheability.
  expect([200, 302, 303, 307]).toContain(response.status());
});
