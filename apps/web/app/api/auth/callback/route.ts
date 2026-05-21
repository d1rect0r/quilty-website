import { NextResponse } from 'next/server';

/**
 * OIDC callback Route Handler — reserved 501-stub.
 *
 * Per D5 + ADR-0002: this exchanges the OIDC code for tokens, creates
 * a DynamoDB session row, sets the `__Host-quilty_sid` cookie carrying an
 * opaque session ID. Implementation depends on:
 *   - Cognito app client (confidential, per U7) provisioned in quilty-aws/auth/
 *   - DynamoDB session table provisioned
 *   - PostHog/Sentry adapters wired (Commit 6)
 */
export async function GET() {
  return NextResponse.json(
    { error: 'Not implemented — reserved for the auth-integration activation.' },
    { status: 501 },
  );
}
