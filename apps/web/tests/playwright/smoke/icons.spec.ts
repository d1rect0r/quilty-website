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
    shortcuts?: readonly {
      name?: string;
      short_name?: string;
      description?: string;
      url?: string;
      icons?: readonly { src?: string }[];
    }[];
    launch_handler?: { client_mode?: unknown };
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
  // Filter undefined entries: `sizes` is typed `string | undefined`
  // so a maskable icon missing the sizes attribute would slip past
  // arrayContaining unnoticed. Narrow to the defined-string subset.
  const maskableSizes = maskable
    .map((icon) => icon.sizes)
    .filter((size): size is string => size !== undefined);
  expect(maskableSizes).toEqual(expect.arrayContaining(['192x192', '512x512']));

  const svg = icons.find((icon) => icon.type === 'image/svg+xml');
  expect(svg?.src).toBe('/icon.svg');

  // OS long-press shortcuts must each carry a name + url + at least
  // one icon — missing any of the three degrades the launcher UX
  // (Android renders a bullet, Chrome omits the entry, Windows shows
  // a generic placeholder).
  const shortcuts = manifest.shortcuts ?? [];
  expect(shortcuts.length).toBeGreaterThanOrEqual(2);
  for (const shortcut of shortcuts) {
    expect(shortcut.name).toBeTruthy();
    expect(shortcut.url).toBeTruthy();
    expect((shortcut.icons ?? []).length).toBeGreaterThanOrEqual(1);
  }
  // Pin the shortcut URL contract: the manifest is the only public
  // surface naming these portal paths, so a typo or relative-path
  // regression would route OS shortcut taps to a wrong destination.
  // A separate `noindex` posture per shortcut target is asserted at
  // the page-metadata layer (see account/page.tsx + subscription/
  // page.tsx).
  const shortcutUrls = shortcuts.map((s) => s.url);
  expect(shortcutUrls).toEqual(expect.arrayContaining(['/en/account', '/en/account/subscription']));

  // Pin the AT-announced label contract — TalkBack / VoiceOver /
  // Narrator read these verbatim on long-press surfaces. A future
  // refactor replacing these with empty strings or jargon would
  // otherwise pass the looser truthy check above.
  const shortcutNames = shortcuts.map((s) => s.name);
  expect(shortcutNames).toEqual(expect.arrayContaining(['My account', 'Subscription']));

  // launch_handler.client_mode === 'navigate-existing' is the
  // single-instance PWA contract. Anything else (a missing value, or
  // 'auto'/'navigate-new'/'focus-existing') would let an OS shortcut
  // spawn a duplicate window — the multi-window split-attention
  // failure mode every reference shop avoids.
  expect(manifest.launch_handler?.client_mode).toBe('navigate-existing');
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
