import { NextResponse } from 'next/server';

/**
 * Stripe webhook Route Handler — reserved 501-stub.
 *
 * Per D44: real subscription event handling (checkout.session.completed,
 * customer.subscription.updated, invoice.paid, charge.dispute.created, etc.)
 * lands at the subscription activation. Verifies the Stripe webhook signature, dispatches to the Rust
 * backend over authenticated HTTPS, mirrors subscription state in DDB.
 *
 * Reserving the URL at scaffold time lets the Stripe activation flow
 * (test-mode webhook registration) work as a no-op while the real
 * handler is being built.
 */
export async function POST() {
  return NextResponse.json(
    { error: 'Not implemented — reserved for the subscription activation.' },
    { status: 501 },
  );
}
