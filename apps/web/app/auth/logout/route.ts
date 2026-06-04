import { NextResponse } from 'next/server';

/**
 * Logout Route Handler — reserved 501-stub. Hand-rolled BFF token handler
 * (ADR-0029), NOT Auth.js — `/auth/*` is apex-level (relocated from
 * `/api/auth/*`); don't move it back.
 *
 * Per D9 + ADR-0002: deletes the DynamoDB session row, clears the
 * `__Host-quilty_sid` cookie, calls `AdminUserGlobalSignOut` on Cognito,
 * publishes `quilty.auth.sessions_revoked` to EventBridge (cross-device
 * fan-out — Cognito does NOT support OIDC Back-Channel Logout natively).
 */
export async function POST() {
  return NextResponse.json(
    { error: 'Not implemented — reserved for the auth-integration activation.' },
    { status: 501 },
  );
}
