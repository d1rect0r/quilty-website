import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { CONSENT_COOKIE_NAME } from '@quilty/consent';
import { getServerContainer } from '@/lib/get-container';
import { makeServerContainer } from '@/composition.server';

/**
 * OIDC callback Route Handler — reserved 501-stub.
 *
 * Per D5 + ADR-0002: this exchanges the OIDC code for tokens, creates
 * a DynamoDB session row, and sets the `__Host-quilty_sid` cookie
 * carrying an opaque session ID. Implementation depends on:
 *   - Cognito app client (confidential, per U7) provisioned in
 *     `quilty-aws/auth/`
 *   - DynamoDB session table provisioned
 *   - Analytics + error-reporting adapters wired
 *
 * Pre-implementation, the handler also wires the
 * `ConsentStore.migrate(cookie → user)` call so when the real token
 * exchange lands, the anonymous cookie-tier consent record is already
 * being promoted to the signed-in user identifier (D87 + D100 Disney
 * $2.75M Feb 2026 enforcement precedent — cross-device opt-out must
 * follow the user, not just the device).
 *
 * Identifier semantics (D87): the anonymous user is keyed by a stable
 * cookie-tier identifier. At the scaffold stage, no such record has
 * been written to the `ConsentStore` itself (the cookie write happens
 * in proxy.ts via `Set-Cookie` directly, NOT through
 * `ConsentStore.set`). The migrate call here therefore exercises the
 * port shape but always hits the `fromState === undefined` no-op
 * branch in the in-memory adapter — by design, since the in-memory
 * store has no entry. The full migrate flow activates when the real
 * token exchange lands and the cookie-tier `ConsentStore.set` write
 * lands alongside it at the auth-integration milestone.
 *
 * The placeholder `user_id_hash` `'pending-auth-integration'` is a
 * single-key sentinel — every callback invocation today writes to
 * the same in-memory bucket. Acceptable while the store is in-memory
 * + the destination state is never read by other code; the DynamoDB
 * adapter activation MUST be gated on the real `quilty_sub`-derived
 * hash landing first (D11 + D67) so production records are
 * per-user-keyed.
 */
export async function GET(): Promise<NextResponse> {
  const cookieStore = await cookies();
  const consentCookieValue = cookieStore.get(CONSENT_COOKIE_NAME)?.value;

  const PLACEHOLDER_USER_ID_HASH = 'pending-auth-integration';

  if (consentCookieValue !== undefined) {
    const container = getServerContainer(makeServerContainer);
    await container.consentStore.migrate(
      { type: 'cookie', cookie_id: consentCookieValue },
      { type: 'user', user_id_hash: PLACEHOLDER_USER_ID_HASH },
    );
  }

  return NextResponse.json(
    { error: 'Not implemented — reserved for the auth-integration activation.' },
    { status: 501 },
  );
}
