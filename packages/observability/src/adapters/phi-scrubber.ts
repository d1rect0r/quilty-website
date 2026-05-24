import { sanitize } from '@quilty/security';
import type { PHIScrubber, SentryEventLike } from '../ports';

/**
 * PHIScrubber adapter — delegates to the @quilty/security sanitizer.
 *
 * Replaces the inline `beforeSend` hook that was previously duplicated
 * across `sentry.client.config.ts` + `sentry.server.config.ts` +
 * `sentry.edge.config.ts`. The same scrub now runs at the composition-
 * root chokepoint (D77 + ADR-0010) so a future Sentry SDK upgrade or
 * a swap to Datadog / Honeycomb is a single-adapter change instead of
 * a three-file sync.
 *
 * Scrub passes (order-sensitive):
 *   1. Sanitize `event.request` — strips query string from URL (URLs
 *      MUST NOT carry PHI per D31, but the strip defends against a
 *      future regression), runs the recursive sanitizer over headers
 *      (PHI denylist + value-pattern regex catches Authorization,
 *      Cookie, etc.).
 *   2. Null out `event.request.data` — Sentry's auto-instrumentation
 *      captures POST bodies. The website tier carries zero PHI by
 *      design (D31) but defense-in-depth: never let a POST body
 *      reach the SDK serializer.
 *   3. Sanitize `event.exception.values[].value` — `throw new Error(
 *      "user@example.com")` would otherwise emit the email in plain
 *      text. The sanitizer's value-pattern regex catches free-text
 *      PHI in error messages.
 *   4. Sanitize `event.message` — Sentry.captureMessage("…") path.
 *   5. Sanitize `event.breadcrumbs[].message` + `event.breadcrumbs[].data`.
 *      Note: the three `sentry.*.config.ts` files ALSO register a
 *      `beforeBreadcrumb` hook that scrubs each breadcrumb at enqueue
 *      time (before it ever enters Sentry's in-memory ring buffer);
 *      the pass here is intentionally redundant. The cost is two
 *      regex sweeps per breadcrumb on the per-error-event path
 *      (negligible at expected traffic) and the benefit is that the
 *      PHIScrubber port remains self-sufficient: a future Sentry
 *      config that omitted `beforeBreadcrumb` would still get
 *      breadcrumb-level PHI scrubbing from the port chokepoint.
 *      Single-chokepoint discipline > 30-vs-60-regex-pass micro-opt.
 *   6. Sanitize `event.extra` + `event.tags` + `event.contexts`.
 *   7. `event.user.email` + `event.user.ip_address` redacted at the
 *      field level (denylist catches them); `event.user.id` retained
 *      because we only set it to the HMAC-pseudonymised `quilty_sub`.
 *
 * The adapter never returns null — every event flows through scrubbed.
 * The port leaves room for a future denylist-detection path that
 * drops events outright; today the scrub is sufficient.
 */
export function makePhiScrubber(): PHIScrubber {
  return {
    scrubSentryEvent(event: SentryEventLike): SentryEventLike | null {
      const scrubbed: SentryEventLike = { ...event };

      // Request path scrub — strip query + sanitize headers, null body.
      if (scrubbed.request !== undefined) {
        const request = { ...scrubbed.request };
        if (typeof request.url === 'string') {
          const qIdx = request.url.indexOf('?');
          if (qIdx !== -1) request.url = request.url.slice(0, qIdx);
        }
        if (request.headers !== undefined) {
          request.headers = sanitize(request.headers);
        }
        // Defense-in-depth: POST bodies are auto-captured by Sentry's
        // request integration. Null them unconditionally.
        request.data = undefined;
        scrubbed.request = request;
      }

      // Exception messages — the `throw new Error("email@x.com")` path.
      // Both `value` (the message text) AND `type` (the Error subclass
      // name) are scrubbed: a domain error named `PatientEmailError`
      // would otherwise leak the PHI-shaped class name into Sentry's
      // exception.type field even though the ESLint rule blocks PHI
      // inside the constructor body. [D67 + D148 layered defense]
      if (scrubbed.exception?.values !== undefined) {
        scrubbed.exception = {
          values: scrubbed.exception.values.map((v) => ({
            ...v,
            value: typeof v.value === 'string' ? sanitize(v.value) : v.value,
            type: typeof v.type === 'string' ? sanitize(v.type) : v.type,
          })),
        };
      }

      // Top-level message — captureMessage("…") path.
      if (typeof scrubbed.message === 'string') {
        scrubbed.message = sanitize(scrubbed.message);
      }

      // Breadcrumbs — both the message + the data payload.
      if (scrubbed.breadcrumbs !== undefined) {
        scrubbed.breadcrumbs = scrubbed.breadcrumbs.map((b) => ({
          ...b,
          message: typeof b.message === 'string' ? sanitize(b.message) : b.message,
          data: b.data !== undefined ? sanitize(b.data) : b.data,
        }));
      }

      // Extra / tags / contexts — recursive sanitize handles each.
      if (scrubbed.extra !== undefined) {
        scrubbed.extra = sanitize(scrubbed.extra);
      }
      if (scrubbed.tags !== undefined) {
        scrubbed.tags = sanitize(scrubbed.tags);
      }
      if (scrubbed.contexts !== undefined) {
        scrubbed.contexts = sanitize(scrubbed.contexts);
      }

      // User-scope fields — `id` retained (HMAC quilty_sub by convention);
      // `email` + `ip_address` scrubbed because the key denylist names
      // them. We pass the whole user object through sanitize() so the
      // denylist enforces the policy without per-field branching.
      if (scrubbed.user !== undefined) {
        scrubbed.user = sanitize(scrubbed.user);
      }

      return scrubbed;
    },
  };
}
