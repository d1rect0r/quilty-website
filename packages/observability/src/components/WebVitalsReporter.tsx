'use client';

import { useReportWebVitals } from 'next/web-vitals';

/**
 * Core Web Vitals reporter — emits INP / LCP / CLS / FCP / TTFB to a
 * structured CloudWatch log line (D28). Sentry OTel auto-consumes the
 * underlying `useReportWebVitals` events too via the SDK's RUM hooks.
 *
 * Per D28: 75th percentile thresholds (Google CrUX scoring):
 *   - LCP <= 2.5s
 *   - INP <= 200ms
 *   - CLS <= 0.1
 *   - TTFB <= 0.8s (supporting)
 *
 * Dimensions: route, device_class, navigation_type. p75 by route is where
 * regressions hide — a sitewide p75 that's green can mask a single
 * pricing-page route that's red.
 *
 * The metric payload is route + device-class + numeric vitals — no PHI
 * shape possible — so the component writes directly via `console.log`
 * (the CloudWatch Logger adapter's chokepoint) without composing the
 * Logger port. ESLint's `no-console` rule has this file as an
 * exception alongside the CloudWatch adapter; the package's eslint
 * override matches both.
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
export function WebVitalsReporter(): null {
  useReportWebVitals((metric) => {
    const record = {
      timestamp: new Date().toISOString(),
      level: 'info' as const,
      msg: 'web_vitals',
      vital: metric.name,
      value: metric.value,
      rating: metric.rating,
      route: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
      device_class: deviceClass(),
      navigation_type: metric.navigationType,
    };

    console.log(JSON.stringify(record));
  });

  return null;
}
