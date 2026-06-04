/**
 * OpenTelemetry vendor adapter — reads the current active span from
 * `@opentelemetry/api` and surfaces the W3C-canonical `traceparent`
 * value the request adapter injects on every outbound HTTP call.
 *
 * Vendor isolation per ADR-0014 Rule 5: this is the ONLY file in
 * `@quilty/api-client` that imports `@opentelemetry/api`. The pure
 * formatters (`formatTraceparent`, `parseTraceparent`) stay in
 * `domain/traceparent.ts` (no SDK dependency); only the active-span
 * READ is vendor-bound.
 *
 * The OpenTelemetry tracer provider + W3C-canonical propagators are
 * configured by `@sentry/nextjs` v10, which OWNS OpenTelemetry in the
 * website runtime (see `apps/web/instrumentation.ts`; revises D56's
 * `@vercel/otel` mechanism). This module reads the active span context
 * and delegates formatting to the domain layer.
 *
 * `baggage` injection is OPTIONAL per ADR-0017 Decision F; today's
 * scope ships traceparent only. Baggage adapter lands at the
 * identity-context propagation trigger (tenant_id / experiment cohort).
 */

import { trace } from '@opentelemetry/api';
import { formatTraceparent } from '../domain/traceparent';

/**
 * Read the active span via the OTel global tracer + format its
 * SpanContext into the traceparent header value. Returns undefined
 * when no span is active (e.g., the call sits outside any tracer
 * scope, or the OTel provider — Sentry, v10 — hasn't initialized).
 *
 * The fetch adapter uses this directly in its request pipeline:
 *
 *   const tp = currentTraceparent();
 *   if (tp) merged[TRACEPARENT_HEADER] = tp;
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

function isValidSpanContext(traceId: string, spanId: string): boolean {
  // W3C reserves all-zero trace + span IDs as "invalid".
  if (/^0+$/.test(traceId)) return false;
  if (/^0+$/.test(spanId)) return false;
  return true;
}
