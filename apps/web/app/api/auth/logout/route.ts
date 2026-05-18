import { NextResponse } from 'next/server';

/**
 * Logout Route Handler — reserved 501-stub.
 *
 * Per D9 + ADR-0002 at M6: deletes the DynamoDB session row, clears the
 * `__Host-quilty_sid` cookie, calls `AdminUserGlobalSignOut` on Cognito,
 * publishes `quilty.auth.sessions_revoked` to EventBridge (cross-device
 * fan-out — Cognito does NOT support OIDC Back-Channel Logout natively).
 */
export async function POST() {
  return NextResponse.json(
    { error: 'Not implemented — reserved for M6 auth integration.' },
    { status: 501 },
  );
}
