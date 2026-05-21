import { NextResponse } from 'next/server';

/**
 * Session info Route Handler — reserved 501-stub.
 *
 * Per ADR-0002: returns session metadata (user id hash, MFA factors,
 * elevated_until step-up flag, locale, consent state) for client consumption.
 * Validates the `__Host-quilty_sid` cookie against the DynamoDB session row.
 */
export async function GET() {
  return NextResponse.json(
    { error: 'Not implemented — reserved for the auth-integration activation.' },
    { status: 501 },
  );
}
