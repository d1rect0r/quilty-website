import { sanitize } from '@/lib/observability/sanitize';
import { assertNoPHI } from '@/lib/observability/assertNoPHI';
import { logger } from '@/lib/observability/logger';
import type { ConsentState } from '@/lib/observability/consent';

/**
 * Typed analytics adapter (D42b + D43 + D67). Per ADR-0004:
 *   - Vendor: PostHog Cloud Boost activated at M3 once ConsentState ships.
 *     At M1 the adapter is a logger-only stub; events are emitted to
 *     CloudWatch via `logger.info('analytics:event', ...)` so we can
 *     observe what WOULD be tracked without sending to a vendor before
 *     consent is real.
 *   - Discriminated union of event names — any caller passing an unknown
 *     event name is a TS error. Adding events is cheap; refactoring
 *     string-typed events later is expensive.
 *   - Every payload runs through sanitize() + assertNoPHI() before send.
 *   - Consent-gated: tracking only happens when ConsentState.analytics is
 *     true (per D35 denial-by-default).
 */

export type AnalyticsEvent =
  | { name: 'page_view'; props: { route: string; locale: string } }
  | { name: 'cta_click'; props: { cta_id: string; location: string } }
  | { name: 'signup_started'; props: { source: string } }
  | { name: 'signup_completed'; props: { method: 'password' | 'passkey' | 'social' } }
  | { name: 'subscription_started'; props: { plan: string } }
  | {
      name: 'account_deleted';
      // Discriminated reason enum — free-form `reason: string` was rejected
      // by Round-5 HIPAA reviewer because a user could smuggle clinical
      // text ("stopped because my therapist changed my medication") into
      // a generic field. Callers must pre-classify server-side before
      // emitting the event. Add new enum values here; callers see compile
      // errors if they pass a non-listed reason.
      props: {
        reason:
          | 'too_expensive'
          | 'not_helpful'
          | 'privacy'
          | 'switched_provider'
          | 'other_specified'
          | 'unspecified';
      };
    };

export interface TrackContext {
  user_id_hash?: string;
  session_id?: string;
  consent: ConsentState;
}

export async function track<E extends AnalyticsEvent>(
  event: E,
  ctx: TrackContext,
): Promise<void> {
  // Consent gate — Cerebral-lesson defense (D35).
  if (!ctx.consent.analytics) return;

  // Runtime PHI assertion (dev only; production relies on the sanitize chokepoint).
  assertNoPHI(event.props, `track:${event.name}`);

  // Sanitize the payload before emission.
  const sanitizedProps = sanitize(event.props);

  // M1 stub: log to CloudWatch via the structured-JSON logger.
  // M3+: replace this with PostHog Cloud Boost emission. The function
  // signature stays — only the body changes — so every call site stays
  // untouched at vendor activation.
  logger.info('analytics:event', {
    event_name: event.name,
    ...(sanitizedProps as Record<string, unknown>),
    user_id_hash: ctx.user_id_hash,
    session_id: ctx.session_id,
  });
}
