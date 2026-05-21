'use client';

import { makeSanitizer } from '@quilty/security';
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
 * Defence-in-depth: the route field reads `window.location.pathname`,
 * which by D31 + URL discipline must never carry PHI. The component
 * nonetheless passes the record through the PHI sanitizer before
 * emission — the sanitizer is the architectural chokepoint per D67,
 * and a future route that accidentally embeds a user identifier in
 * a path segment must not bypass it. The component does not compose
 * the Logger port directly (the Container's Logger isn't serializable
 * across the RSC boundary), but it composes the same sanitizer.
 */

const sanitizer = makeSanitizer();

function deviceClass(): 'mobile' | 'tablet' | 'desktop' {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  if (/iPad|Tablet/.test(ua)) return 'tablet';
  if (/Mobile|Android|iPhone/.test(ua)) return 'mobile';
  return 'desktop';
}

function safeRoute(): string {
  if (typeof window === 'undefined') return 'unknown';
  // Strip query strings (Next.js's pathname API excludes them today
  // but defensive — a future Next.js change or a client-side history
  // push that includes a `?` could surface them) + truncate to a
  // length the sanitizer would not flag, then scrub.
  const raw = window.location.pathname.split('?')[0] ?? '';
  return sanitizer.scrub(raw.slice(0, 200));
}

/**
 * Client Component that wires `useReportWebVitals` for the lifetime of
 * the page. Render once near the root layout.
 */
export function WebVitalsReporter(): null {
  useReportWebVitals((metric) => {
    const record = sanitizer.scrub({
      timestamp: new Date().toISOString(),
      level: 'info' as const,
      msg: 'web_vitals',
      vital: metric.name,
      value: metric.value,
      rating: metric.rating,
      route: safeRoute(),
      device_class: deviceClass(),
      navigation_type: metric.navigationType,
    });

    console.log(JSON.stringify(record));
  });

  return null;
}
