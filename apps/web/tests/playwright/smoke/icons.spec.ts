import { expect, test } from '@playwright/test';

/**
 * Icon stack reachability + manifest contract per D108/D109/D110.
 *
 * A missing favicon / apple-touch / maskable icon surfaces as a silent
 * 404 in browser DevTools + a Lighthouse PWA-installability warning;
 * neither breaks the page, both degrade share-preview + install-prompt
 * UX. The smoke pass asserts the full lean stack reaches a 200 with
 * the expected MIME type so a regression that re-deletes one of the
 * assets fails CI before it ships.
 */

interface IconAssertion {
  readonly path: string;
  readonly acceptedContentTypes: readonly string[];
}

// Node + Next.js + CloudFront have all historically labeled .ico files
// with one of two MIME types per RFC 2361 (`image/vnd.microsoft.icon`)
// vs. the de-facto `image/x-icon`. Accept either, but reject anything
// that doesn't look ICO at all.
const ICON_ASSETS: readonly IconAssertion[] = [
  {
    path: '/favicon.ico',
    acceptedContentTypes: ['image/vnd.microsoft.icon', 'image/x-icon', 'image/ico'],
  },
  { path: '/icon.svg', acceptedContentTypes: ['image/svg+xml'] },
  { path: '/icon-192.png', acceptedContentTypes: ['image/png'] },
  { path: '/icon-512.png', acceptedContentTypes: ['image/png'] },
  { path: '/icon-maskable-192.png', acceptedContentTypes: ['image/png'] },
  { path: '/icon-maskable-512.png', acceptedContentTypes: ['image/png'] },
  { path: '/apple-touch-icon.png', acceptedContentTypes: ['image/png'] },
  { path: '/og-default.jpg', acceptedContentTypes: ['image/jpeg'] },
];

for (const { path, acceptedContentTypes } of ICON_ASSETS) {
  test(`@smoke ${path} serves with status 200 + valid image MIME`, async ({ request }) => {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    const contentType = response.headers()['content-type'] ?? '';
    expect(acceptedContentTypes.some((accepted) => contentType.includes(accepted))).toBe(true);
  });
}

test('@smoke /manifest.webmanifest is valid JSON with maskable icons + D110 forward-claim fields', async ({
  request,
}) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/manifest+json');

  const manifest = (await response.json()) as {
    id?: unknown;
    scope?: unknown;
    start_url?: unknown;
    display_override?: unknown;
    lang?: unknown;
    dir?: unknown;
    orientation?: unknown;
    categories?: unknown;
    icons?: readonly { src?: string; sizes?: string; type?: string; purpose?: string }[];
  };

  expect(manifest.id).toBe('/');
  expect(manifest.scope).toBe('/');
  expect(manifest.start_url).toBe('/');
  expect(manifest.lang).toBe('en');
  expect(manifest.dir).toBe('ltr');
  expect(manifest.orientation).toBe('portrait');
  expect(Array.isArray(manifest.display_override)).toBe(true);
  expect(Array.isArray(manifest.categories)).toBe(true);

  const icons = manifest.icons ?? [];
  const maskable = icons.filter((icon) => icon.purpose === 'maskable');
  expect(maskable.length).toBeGreaterThanOrEqual(2);
  expect(maskable.map((icon) => icon.sizes)).toEqual(
    expect.arrayContaining(['192x192', '512x512']),
  );

  const svg = icons.find((icon) => icon.type === 'image/svg+xml');
  expect(svg?.src).toBe('/icon.svg');
});

test('@smoke og-default.jpg fits the 300 KB share-preview budget', async ({ request }) => {
  const response = await request.get('/og-default.jpg');
  expect(response.status()).toBe(200);
  const body = await response.body();
  // Twitter Card + LinkedIn + Facebook all sample below ~5 MB but
  // social-share latency degrades sharply past ~300 KB. Tight budget
  // keeps the placeholder honest until the designer-authored JPEG lands.
  expect(body.byteLength).toBeLessThanOrEqual(300 * 1024);
});

test('@smoke homepage emits og:image:alt + twitter:image:alt (WCAG 1.1.1 social-share context)', async ({
  page,
}) => {
  // Default-locale redirect from `/` lands on `/en`, which inherits the
  // root layout's metadata fragment. Social crawlers fetch the
  // post-redirect HTML, so we assert the alt attributes there.
  await page.goto('/en');
  const ogImageAlt = await page
    .locator('meta[property="og:image:alt"]')
    .first()
    .getAttribute('content');
  const twitterImageAlt = await page
    .locator('meta[name="twitter:image:alt"]')
    .first()
    .getAttribute('content');
  const ogImageType = await page
    .locator('meta[property="og:image:type"]')
    .first()
    .getAttribute('content');
  expect(ogImageAlt ?? '').not.toBe('');
  expect(twitterImageAlt ?? '').not.toBe('');
  expect(ogImageType).toBe('image/jpeg');
});
