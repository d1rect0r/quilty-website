import { test, expect } from '@playwright/test';

/**
 * Opaque anonymous guest-session cookie (`__Host-quilty_sid_guest`,
 * ADR-0029 F). The carrier package + server-side store + composition
 * wiring ship now, but the proxy.ts mint is gated behind the
 * `guest_state_enabled` feature flag (default OFF). Privacy-by-design: NO
 * identifier cookie is set for visitors until a real consumer (the
 * onboarding/quiz UX) + the `/legal/cookies` disclosure ship and the flag
 * is flipped.
 *
 * This spec pins the SHIPPED dormant default — a regression that minted the
 * cookie unconditionally (the pre-review behaviour) would fail here. The
 * active-mint attributes (`__Host-` + HttpOnly + session scope) are pinned
 * by the COOKIE_REGISTRY declaration test in `@quilty/consent`.
 *
 * Tagged `@security @privacy` for compliance-regression CI.
 */

const GUEST_COOKIE = '__Host-quilty_sid_guest';

function guestSetCookie(headersArray: { name: string; value: string }[]): string | undefined {
  return headersArray
    .filter((h) => h.name.toLowerCase() === 'set-cookie')
    .map((h) => h.value)
    .find((c) => c.startsWith(`${GUEST_COOKIE}=`));
}

test('@security @privacy guest carrier is dormant by default — a document navigation does NOT mint the cookie', async ({
  request,
}) => {
  const response = await request.get('/en', {
    headers: { 'Sec-Fetch-Dest': 'document' },
    maxRedirects: 0,
  });
  expect(guestSetCookie(response.headersArray())).toBeUndefined();
});

test('@security @privacy no guest cookie on a portal navigation either (dormant)', async ({
  request,
}) => {
  const response = await request.get('/en/account', {
    headers: { 'Sec-Fetch-Dest': 'document' },
    maxRedirects: 0,
  });
  expect(guestSetCookie(response.headersArray())).toBeUndefined();
});
