import { test, expect } from '@playwright/test';

/**
 * .well-known files must serve as `application/json` regardless of file
 * extension (S8 + Round-5 audit). iOS silently fails universal-link
 * verification on `application/octet-stream`.
 */

test('@smoke .well-known/apple-app-site-association serves as application/json', async ({
  request,
}) => {
  const response = await request.get('/.well-known/apple-app-site-association');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/json');
});

test('@smoke .well-known/assetlinks.json serves as application/json', async ({ request }) => {
  const response = await request.get('/.well-known/assetlinks.json');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/json');
});
