import { NextResponse } from 'next/server';

/**
 * Token refresh Route Handler — reserved 501-stub.
 *
 * Per D52 + ADR-0002: server-side refresh via Cognito's
 * `GetTokensFromRefreshToken` with rotation enabled. Access-token TTL 5 min,
 * refresh-token TTL 8h. Old refresh-token revoked on rotation — detects
 * refresh-token theft (Cognito returns error if a revoked token is replayed).
 */
export async function POST() {
  return NextResponse.json(
    { error: 'Not implemented — reserved for the auth-integration activation.' },
    { status: 501 },
  );
}
