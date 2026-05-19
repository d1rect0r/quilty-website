import { test, expect } from '@playwright/test';

/**
 * sitemap.xml coverage per D26 + U2 + U3.
 */

test('@seo sitemap.xml returns 200 + XML content type', async ({ request }) => {
  const response = await request.get('/sitemap.xml');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toMatch(/xml/);
});

test('@seo sitemap includes every reserved marketing route per U2 + U3', async ({ request }) => {
  const response = await request.get('/sitemap.xml');
  const body = await response.text();

  // U2: /science, /for-business, /customers — reserved at M1.
  expect(body).toContain('/en/science');
  expect(body).toContain('/en/for-business');
  expect(body).toContain('/en/customers');

  // U3: /help — both /help path + help. subdomain reserved.
  expect(body).toContain('/en/help');

  // Legal pages — must be indexable
  expect(body).toContain('/en/legal/privacy');
  expect(body).toContain('/en/legal/terms');
  expect(body).toContain('/en/legal/cookies');

  // Account routes — must NOT appear (noindex)
  expect(body).not.toContain('/en/account');
});
