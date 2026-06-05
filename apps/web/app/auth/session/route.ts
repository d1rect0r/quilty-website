import { NextResponse } from 'next/server';

/**
 * Session info Route Handler — reserved 501-stub. Hand-rolled BFF token
 * handler (ADR-0029), NOT Auth.js — `/auth/*` is apex-level (relocated
 * from `/api/auth/*`); don't move it back.
 *
 * Per ADR-0002: returns session metadata (user id hash, MFA factors,
 * elevated_until step-up flag, locale, consent state) for client consumption.
 * Validates the `__Host-quilty_sid` cookie against the DynamoDB session row.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { error: 'Not implemented — reserved for the auth-integration activation.' },
    { status: 501 },
  );
}
