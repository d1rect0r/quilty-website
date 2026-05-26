/**
 * W3C `traceparent` injection (Decision F in ADR-0017).
 *
 * Reads the current active span from `@opentelemetry/api` and
 * composes the canonical `traceparent` header per the W3C-Trace-Context
 * spec:
 *
 *   00-{trace-id}-{parent-id}-{trace-flags}
 *
 * Where:
 *   - version is always `00` (W3C bound the field to two hex chars;
 *     `00` is the current spec version).
 *   - trace-id is 32 lowercase hex chars (128 bits).
 *   - parent-id is 16 lowercase hex chars (64 bits).
 *   - trace-flags is 2 lowercase hex chars (`01` if recording / `00`
 *     if not).
 *
 * `@vercel/otel` 2.1.x configures W3C-canonical propagators by
 * default per D56; this module reads the active span context and
 * formats the header. The adapter (`fetch.ts`) injects the result
 * on every outbound request via openapi-fetch middleware.
 *
 * `baggage` is OPTIONAL per ADR-0017 Decision F; today ships
 * traceparent only. Baggage injection lands at the identity-context
 * context propagation trigger.
 */

import { trace } from '@opentelemetry/api';

export const TRACEPARENT_HEADER = 'traceparent';

/**
 * Format an OpenTelemetry SpanContext into a W3C-canonical
 * traceparent header value. Exposed as a pure function so the
 * adapter test surface can pass in a known SpanContext (no global
 * tracer setup required).
 */
export function formatTraceparent(spanContext: {
  traceId: string;
  spanId: string;
  traceFlags: number;
}): string {
  // The traceFlags field is a uint8 in OTel; the W3C spec takes the
  // lower 8 bits formatted as 2 lowercase hex chars. The bit at 0x01
  // is the "sampled" flag — when set, downstream services should
  // record the span. We pass the full byte; W3C parsers tolerate
  // unknown upper bits per spec §3.2.1.
  const flagsHex = (spanContext.traceFlags & 0xff).toString(16).padStart(2, '0');
  return `00-${spanContext.traceId}-${spanContext.spanId}-${flagsHex}`;
}

/**
 * Read the active span via the OTel global tracer + format its
 * SpanContext into the traceparent header value. Returns undefined
 * when no span is active (e.g., the call sits outside any tracer
 * scope, or `@vercel/otel` hasn't initialized).
 *
 * The adapter uses this directly in its openapi-fetch middleware:
 *
 *   const tp = currentTraceparent();
 *   if (tp) req.headers.set('traceparent', tp);
 */
export function currentTraceparent(): string | undefined {
  const span = trace.getActiveSpan();
  if (!span) return undefined;
  const ctx = span.spanContext();
  // OTel SpanContext.isValid() is the canonical way to check the
  // context is non-invalid (00000... trace IDs are reserved).
  if (!isValidSpanContext(ctx.traceId, ctx.spanId)) return undefined;
  return formatTraceparent(ctx);
}

/**
 * Parse a traceparent header value into its constituent parts.
 * Useful at the BFF when forwarding an inbound traceparent rather
 * than starting a fresh trace (rare today; reserved for the
 * cross-mobile-web tracing trigger).
 *
 * Returns undefined when the header is missing or malformed.
 */
export function parseTraceparent(headerValue: string | null | undefined):
  | {
      version: string;
      traceId: string;
      parentId: string;
      traceFlags: number;
    }
  | undefined {
  if (!headerValue) return undefined;
  const parts = headerValue.trim().toLowerCase().split('-');
  if (parts.length !== 4) return undefined;
  const [version, traceId, parentId, flagsHex] = parts;
  if (version !== '00') return undefined;
  if (!traceId || traceId.length !== 32 || !/^[0-9a-f]+$/.test(traceId)) return undefined;
  if (!parentId || parentId.length !== 16 || !/^[0-9a-f]+$/.test(parentId)) return undefined;
  if (!flagsHex || flagsHex.length !== 2 || !/^[0-9a-f]+$/.test(flagsHex)) return undefined;
  const traceFlags = Number.parseInt(flagsHex, 16);
  if (!Number.isFinite(traceFlags)) return undefined;
  if (!isValidSpanContext(traceId, parentId)) return undefined;
  return { version, traceId, parentId, traceFlags };
}

function isValidSpanContext(traceId: string, spanId: string): boolean {
  // W3C reserves all-zero trace + span IDs as "invalid".
  if (/^0+$/.test(traceId)) return false;
  if (/^0+$/.test(spanId)) return false;
  return true;
}
