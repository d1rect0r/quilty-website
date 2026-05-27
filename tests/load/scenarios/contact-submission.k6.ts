/**
 * Contact-form submission scenario — constant-arrival-rate, 2 RPS
 * for 10 minutes. Exercises the full 8-piece form pattern at
 * `/api/contact` (CSRF triple-layer, captcha, rate-limit, email-
 * send-via-sanitizer-chokepoint). Uses the X-Load-Test-Bypass
 * header so the per-IP + per-email rate-limit doesn't fire on the
 * 6th iteration.
 *
 * Requires:
 *   - `RATELIMIT_BYPASS_TOKEN` env var (matches the staging/preview
 *     token configured at deploy time per TW-026 in
 *     docs/runbook/trigger-watchlist.md).
 *   - The test-fixtures factory from `@quilty/test-fixtures` exposed
 *     to k6 — fixture re-export at fixtures/contact-submissions.json
 *     (generated offline; k6 reads via SharedArray).
 *
 * SLO source: `tests/load/lib/thresholds.ts` `form_post` tier.
 */

import http from 'k6/http';
import { SharedArray } from 'k6/data';
import { check } from 'k6';
import { thresholdsForRoute } from '../lib/thresholds';
import { bypassHeader } from '../lib/bypass-token';

const SITE_URL = __ENV['QUILTY_SITE_URL'] ?? 'http://localhost:3000';
const SCENARIO_NAME = 'contact_submission';

interface ContactFixture {
  readonly name: string;
  readonly email: string;
  readonly subject: string;
  readonly message: string;
  readonly idempotency_key: string;
  readonly csrf_token: string;
  readonly time_token: string;
  readonly turnstile_token: string;
}

const fixtures = new SharedArray<ContactFixture>('contact_submissions', () => {
  // Loaded at scenario init from `@quilty/test-fixtures` export at
  // `tests/load/fixtures/contact-submissions.json`. The file is
  // generated offline by `pnpm --filter @quilty/test-fixtures
  // export:load-test` (TW-025 — until that activates, k6 expects
  // the file to exist or fails fast at the SharedArray load.
  return JSON.parse(open('../fixtures/contact-submissions.json'));
});

export const options = {
  scenarios: {
    [SCENARIO_NAME]: {
      executor: 'constant-arrival-rate',
      rate: 2,
      timeUnit: '1s',
      duration: '10m',
      preAllocatedVUs: 10,
      maxVUs: 50,
    },
  },
  thresholds: thresholdsForRoute('form_post', SCENARIO_NAME),
};

export default function contactSubmission(): void {
  const fixture = fixtures[__VU % fixtures.length] ?? fixtures[0];
  if (!fixture) {
    throw new Error('contact-submission: no fixtures loaded');
  }
  const res = http.post(`${SITE_URL}/api/contact`, JSON.stringify(fixture), {
    tags: { scenario: SCENARIO_NAME },
    headers: {
      'Content-Type': 'application/json',
      'X-Quilty-CSRF': fixture.csrf_token,
      Cookie: `__Host-quilty_csrf=${fixture.csrf_token}`,
      ...bypassHeader(),
    },
  });
  check(res, {
    'status is 200': (r) => r.status === 200,
    'envelope ok': (r) => typeof r.body === 'string' && r.body.includes('"ok":true'),
  });
}
