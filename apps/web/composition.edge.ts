/**
 * Edge-runtime composition root.
 *
 * Invoked from the Next.js 16 proxy.ts handler (which runs in the Edge
 * runtime). Wires only the ports that have edge-runtime-compatible
 * adapters: CspBuilder + HeadersBuilder (string composition, no Node APIs),
 * Sec-GPC detection helpers, RedirectValidator, and Sentry edge SDK.
 *
 * Discipline: no Node-only APIs (no `fs`, no `Buffer`, no `crypto` Node
 * module — the Edge runtime exposes the Web Crypto API instead). Vendor
 * SDKs imported here must publish an Edge-compatible build.
 *
 * The Container is empty at the scaffold commit; widened as the relevant
 * @quilty/* packages land.
 */

import { makeCspBuilder, makeHeadersBuilder, makeSanitizer } from '@quilty/security';
import type { Container } from './lib/get-container';

export function makeEdgeContainer(): Container {
  return {
    sanitizer: makeSanitizer(),
    cspBuilder: makeCspBuilder(),
    headersBuilder: makeHeadersBuilder(),
    // Filled as remaining @quilty/* packages land:
    //   observability — Sentry edge SDK
    //   consent       — Sec-GPC detector (cookie write is server-side; edge only reads)
  };
}
