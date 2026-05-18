import { NextResponse } from 'next/server';

/**
 * OIDC Back-Channel Logout Route Handler — reserved 501-stub.
 *
 * Per D9 + ADR-0002: Cognito does NOT currently support OIDC Back-Channel
 * Logout (the `/.well-known/openid-configuration` does not advertise
 * `backchannel_logout_supported`; ID tokens do not emit the `sid` claim).
 * Cross-device sign-out is implemented via EventBridge fan-out instead
 * (see /api/auth/logout).
 *
 * This endpoint is RESERVED for the day Cognito ships native OIDC BCL.
 * When that happens, flip this from 501 to: verify the signed `logout_token`
 * from the IdP, extract `sid`, invalidate the matching DynamoDB session row,
 * publish to EventBridge for consistency.
 *
 * Reserving the URL now avoids painful Route-Handler restructuring later.
 */
export async function POST() {
  return NextResponse.json(
    { error: 'Cognito does not support OIDC BCL yet. Use EventBridge fan-out via /api/auth/logout.' },
    { status: 501 },
  );
}
