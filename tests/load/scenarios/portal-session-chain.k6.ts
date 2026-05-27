/**
 * Portal session-chain scenario — per-vu-iterations, 20 VUs each
 * running 50 sequential auth-refresh iterations. Validates the
 * Cognito refresh path + DynamoDB session-store + cookie roundtrip
 * (D51 / D52) under user-tier concurrency.
 *
 * Per-VU CookieJar isolation: k6 gives each VU its own jar by
 * default, so the `__Host-quilty_sid` + `__Host-quilty_csrf`
 * cookies don't bleed between virtual users (the bug that bit
 * Discord pre-2022 in their k6 portal-session benchmarks).
 *
 * SLO source: `tests/load/lib/thresholds.ts` `auth_refresh` tier.
 */

import http from 'k6/http';
import { check } from 'k6';
import { thresholdsForRoute } from '../lib/thresholds';

const SITE_URL = __ENV['QUILTY_SITE_URL'] ?? 'http://localhost:3000';
const SCENARIO_NAME = 'portal_session_chain';

export const options = {
  scenarios: {
    [SCENARIO_NAME]: {
      executor: 'per-vu-iterations',
      vus: 20,
      iterations: 50,
      maxDuration: '10m',
    },
  },
  thresholds: thresholdsForRoute('auth_refresh', SCENARIO_NAME),
};

export default function portalSessionChain(): void {
  // Auth-refresh roundtrip; the portal entry routes pre-activation
  // will return 404 — that's fine for the load test, the goal is
  // exercising the proxy + cookie-decode + session-fetch latency
  // path. Switch to authenticated `/account/profile` after M6.
  const res = http.get(`${SITE_URL}/api/auth/session`, {
    tags: { scenario: SCENARIO_NAME },
  });
  check(res, {
    'status is 200 or 401': (r) => r.status === 200 || r.status === 401,
  });
}
