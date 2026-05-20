/**
 * Server-runtime composition root.
 *
 * Invoked from Server Components, Route Handlers, server actions, and the
 * proxy.ts handler. Wires server-only adapters: AWS SES (EmailSender),
 * Sentry server SDK (ErrorReporter), CloudWatch (Logger), DynamoDB-backed
 * stores (ConsentStore, RateLimiter), Turnstile (Captcha verify endpoint),
 * etc. See ADR-0010 for the composition-root rationale.
 *
 * Discipline:
 *   - Adapter modules are imported here and ONLY here in apps/web. Other
 *     modules consume the typed ports through the Container returned by
 *     getContainer(). ESLint's no-restricted-imports rule + dep-cruiser's
 *     cross-package-imports-must-use-barrel rule enforce this together.
 *   - All cross-cutting concerns (PHI sanitization, consent gate, default-
 *     deny, replay mask-class floor) compose HERE, not at call sites.
 *
 * The Container is empty at the scaffold commit; subsequent extraction
 * commits add ports as their packages land.
 */

import 'server-only';

import { makeCspBuilder, makeHeadersBuilder, makeSanitizer } from '@quilty/security';
import type { Container } from './lib/get-container';

export function makeServerContainer(): Container {
  return {
    sanitizer: makeSanitizer(),
    cspBuilder: makeCspBuilder(),
    headersBuilder: makeHeadersBuilder(),
    // Filled as remaining @quilty/* packages land:
    //   observability — Sentry server SDK + Amplitude server SDK +
    //                   CloudWatch logger; each adapter wrapped with the
    //                   sanitizer above per D67
    //   consent       — DynamoDB-backed ConsentStore
    //   email         — AWS SES EmailSender wrapped with PHI sanitizer per D67
    //   captcha       — Turnstile verifyToken endpoint
    //   rate-limit    — DynamoDB-backed RateLimiter
  };
}
