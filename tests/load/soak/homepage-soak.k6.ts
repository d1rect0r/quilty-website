/**
 * Homepage soak — 50 RPS sustained for 4 hours. NOT a CI scenario;
 * run pre-launch + post-launch baseline only.
 *
 * The soak surface catches the failures that don't show up in 5-min
 * burst scenarios: TLS session cache growth, Lambda cold-start
 * tail under steady load, CloudFront edge cache eviction churn,
 * DynamoDB read-throttling at the per-table partition limit.
 *
 * Cadence (TW-018 in docs/runbook/trigger-watchlist.md):
 *   - Pre-launch: run once against a staging deploy that mirrors
 *     production capacity. SLO breach blocks launch.
 *   - Post-launch: nightly cron once a real-traffic baseline exists
 *     (activates the TW-018 trigger).
 */

import http from 'k6/http';
import { check } from 'k6';
import { thresholdsForRoute } from '../lib/thresholds';

const SITE_URL = __ENV['QUILTY_SITE_URL'] ?? 'http://localhost:3000';
const SCENARIO_NAME = 'homepage_soak';

export const options = {
  scenarios: {
    [SCENARIO_NAME]: {
      executor: 'constant-arrival-rate',
      rate: 50,
      timeUnit: '1s',
      duration: '4h',
      preAllocatedVUs: 100,
      maxVUs: 300,
    },
  },
  thresholds: thresholdsForRoute('static_html', SCENARIO_NAME),
};

export default function homepageSoak(): void {
  const res = http.get(`${SITE_URL}/en`, { tags: { scenario: SCENARIO_NAME } });
  check(res, { 'status is 200': (r) => r.status === 200 });
}
