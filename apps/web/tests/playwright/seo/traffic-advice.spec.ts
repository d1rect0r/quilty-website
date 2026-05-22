import { expect, test } from '@playwright/test';

/**
 * Chrome Private Prefetch Proxy hint per privacycg/private-prefetch-proxy.
 *
 * Chrome queries this file during navigation prefetch to determine
 * whether the proxy should engage on quilty traffic. Missing file =
 * 404 noise in CDN logs + lost LCP gain on prefetched navigations;
 * wrong Content-Type = Chrome falls back to defaults + ignores the
 * policy.
 */

test('@seo /.well-known/traffic-advice serves with status 200 + application/trafficadvice+json', async ({
  request,
}) => {
  const response = await request.get('/.well-known/traffic-advice');
  expect(response.status()).toBe(200);
  // Custom media type per the explainer. Plain `application/json` is
  // tolerated but causes Chrome to skip the policy lookup.
  expect(response.headers()['content-type']).toContain('application/trafficadvice+json');
});

test('@seo /.well-known/traffic-advice body is a valid JSON array with prefetch-proxy entry', async ({
  request,
}) => {
  const body = await (await request.get('/.well-known/traffic-advice')).text();
  const parsed = JSON.parse(body) as readonly {
    user_agent?: string;
    fraction?: number;
  }[];
  expect(Array.isArray(parsed)).toBe(true);
  expect(parsed.length).toBeGreaterThanOrEqual(1);

  const prefetchEntry = parsed.find((entry) => entry.user_agent === 'prefetch-proxy');
  expect(prefetchEntry).toBeDefined();
  // fraction is a 0..1 share allowing the proxy to engage. 1.0 means
  // "always engage when offered" — the default for sites with no
  // PHI on the marketing tier (D31).
  expect(typeof prefetchEntry?.fraction).toBe('number');
  expect(prefetchEntry?.fraction).toBeGreaterThanOrEqual(0);
  expect(prefetchEntry?.fraction).toBeLessThanOrEqual(1);
});
