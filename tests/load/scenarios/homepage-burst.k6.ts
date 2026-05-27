/**
 * Homepage burst scenario — ramping-arrival-rate, 0 → 100 RPS in
 * 60s, hold 5 minutes. Validates the marketing-static cache hits
 * + CloudFront brotli + Tailwind utility-class CSS bundle under
 * sustained load.
 *
 * SLO source: `tests/load/lib/thresholds.ts` `static_html` tier.
 *
 * Run locally:
 *   k6 run tests/load/scenarios/homepage-burst.k6.ts \
 *     --env QUILTY_SITE_URL=http://localhost:3000
 */

import http from 'k6/http';
import { check } from 'k6';
import { thresholdsForRoute } from '../lib/thresholds';

const SITE_URL = __ENV['QUILTY_SITE_URL'] ?? 'http://localhost:3000';
const SCENARIO_NAME = 'homepage_burst';

export const options = {
  scenarios: {
    [SCENARIO_NAME]: {
      executor: 'ramping-arrival-rate',
      startRate: 0,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 200,
      stages: [
        { duration: '60s', target: 100 },
        { duration: '5m', target: 100 },
        { duration: '30s', target: 0 },
      ],
      gracefulStop: '30s',
    },
  },
  thresholds: thresholdsForRoute('static_html', SCENARIO_NAME),
};

export default function homepageBurst(): void {
  const res = http.get(`${SITE_URL}/en`, {
    tags: { scenario: SCENARIO_NAME },
    headers: { 'Accept-Encoding': 'br, gzip' },
  });
  check(res, {
    'status is 200': (r) => r.status === 200,
    'body contains layout root': (r) => typeof r.body === 'string' && r.body.includes('<html'),
  });
}
