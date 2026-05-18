'use client';

import { useReportWebVitals } from 'next/web-vitals';
import { logger } from '@/lib/observability/logger';

/**
 * Core Web Vitals reporter — emits INP / LCP / CLS / FCP / TTFB to a
 * structured CloudWatch log line at M1 (D28). Sentry OTel auto-consumes
 * the underlying `useReportWebVitals` events too via the SDK's RUM hooks.
 *
 * Per D28: 75th percentile thresholds (Google CrUX scoring):
 *   - LCP ≤ 2.5s
 *   - INP ≤ 200ms
 *   - CLS ≤ 0.1
 *   - TTFB ≤ 0.8s (supporting)
 *
 * Dimensions: route, device_class, navigation_type. p75 by route is where
 * regressions hide — a sitewide p75 that's green can mask a single
 * pricing-page route that's red.
 *
 * OTel histogram metrics are NOT instantiated at M1 — `@opentelemetry/api`
 * `metrics` namespace requires a registered MeterProvider (which Sentry's
 * Next.js SDK doesn't expose at the v8 line; the OTel-native pivot is on
 * the Sentry roadmap). Until then, CloudWatch Insights queries against
 * the structured `web_vitals` log lines are the primary surface. When
 * Sentry exposes a Meter, swap the logger.info call for a histogram
 * record without changing the function signature. Round-5 TS reviewer
 * flagged the original draft's `as Meter` cast as hiding 5 missing
 * interface methods — removed entirely.
 */

function deviceClass(): 'mobile' | 'tablet' | 'desktop' {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  if (/iPad|Tablet/.test(ua)) return 'tablet';
  if (/Mobile|Android|iPhone/.test(ua)) return 'mobile';
  return 'desktop';
}

/**
 * Client Component that wires `useReportWebVitals` for the lifetime of
 * the page. Render once near the root layout.
 */
export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    logger.info('web_vitals', {
      vital: metric.name,
      value: metric.value,
      rating: metric.rating,
      route: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
      device_class: deviceClass(),
      navigation_type: metric.navigationType,
    });
  });

  return null;
}
