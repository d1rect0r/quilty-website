#!/usr/bin/env node
/**
 * Icon raster build pipeline — single SVG source-of-truth (D108) +
 * Stripe/Linear lean output stack (D109).
 *
 * Inputs:  apps/web/public/icon.svg
 * Outputs (committed to git):
 *   - favicon.ico (multi-res 16/32/48)
 *   - icon-192.png + icon-512.png (modern shortcut icons, manifest tier)
 *   - icon-maskable-192.png + icon-maskable-512.png (PWA adaptive)
 *   - apple-touch-icon.png (180×180, flattened on opaque white)
 *   - og-default.jpg (1200×630 JPEG share card, ≤300 KB)
 *
 * Outputs are committed to git: keeps the Next.js build path free of
 * native image deps + the pipeline reproducible across machines.
 * Re-run after editing `icon.svg` via `pnpm --filter web icons:build`.
 *
 * Maskable safe zone: Android adaptive icons crop into the inner 80%
 * diameter disc (https://web.dev/articles/maskable-icon). 10% of total
 * size on each side leaves the inner 80% intact through every launcher
 * crop shape (circle, squircle, rounded square, teardrop).
 *
 * apple-touch-icon + raster manifest icons: Apple Springboard renders
 * any PNG alpha as black on iOS home screens. We flatten + strip the
 * alpha channel from every output PNG so a future tweak to the SVG
 * that introduces partial transparency cannot silently produce a
 * broken iOS icon.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pngToIco from 'png-to-ico';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');
const SOURCE_SVG = join(PUBLIC_DIR, 'icon.svg');

// Total padding around the maskable glyph, expressed as a fraction of
// the canvas side length. 0.2 == 10% per side, which yields the inner
// 80% safe disc the maskable spec requires.
const MASKABLE_TOTAL_PADDING_RATIO = 0.2;
// Manifest install splash + maskable background. Keep aligned with
// `apps/web/app/manifest.ts` `background_color`.
const INSTALL_BACKGROUND = { r: 255, g: 255, b: 255, alpha: 1 };
// Share-card backdrop. Distinct from INSTALL_BACKGROUND because OG
// cards legitimately use a warm off-white while install surfaces match
// the manifest's #ffffff.
const OG_BACKGROUND = { r: 250, g: 250, b: 250, alpha: 1 };

async function renderPng({ source, size, output }) {
  await sharp(source)
    .resize(size, size)
    .flatten({ background: INSTALL_BACKGROUND })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(output);
}

async function renderMaskablePng({ source, size, output }) {
  const innerSize = Math.round(size * (1 - MASKABLE_TOTAL_PADDING_RATIO));
  const inner = await sharp(source).resize(innerSize, innerSize).png().toBuffer();
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: INSTALL_BACKGROUND,
    },
  })
    .composite([{ input: inner, gravity: 'center' }])
    .flatten({ background: INSTALL_BACKGROUND })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(output);
}

async function renderAppleTouchPng({ source, output }) {
  await sharp(source)
    .resize(180, 180)
    .flatten({ background: INSTALL_BACKGROUND })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(output);
}

async function renderFavicon({ source, output }) {
  const sizes = [16, 32, 48];
  const buffers = await Promise.all(
    sizes.map((size) =>
      sharp(source)
        .resize(size, size)
        .flatten({ background: INSTALL_BACKGROUND })
        .removeAlpha()
        .png()
        .toBuffer(),
    ),
  );
  const ico = await pngToIco(buffers);
  await writeFile(output, ico);
}

async function renderOgImage({ source, output }) {
  const glyph = await sharp(source).resize(420, 420).png().toBuffer();
  await sharp({
    create: {
      width: 1200,
      height: 630,
      channels: 4,
      background: OG_BACKGROUND,
    },
  })
    .composite([{ input: glyph, gravity: 'center' }])
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(output);
}

async function main() {
  await mkdir(PUBLIC_DIR, { recursive: true });
  const source = await readFile(SOURCE_SVG);

  await renderPng({ source, size: 192, output: join(PUBLIC_DIR, 'icon-192.png') });
  await renderPng({ source, size: 512, output: join(PUBLIC_DIR, 'icon-512.png') });
  await renderMaskablePng({
    source,
    size: 192,
    output: join(PUBLIC_DIR, 'icon-maskable-192.png'),
  });
  await renderMaskablePng({
    source,
    size: 512,
    output: join(PUBLIC_DIR, 'icon-maskable-512.png'),
  });
  await renderAppleTouchPng({ source, output: join(PUBLIC_DIR, 'apple-touch-icon.png') });
  await renderFavicon({ source, output: join(PUBLIC_DIR, 'favicon.ico') });
  await renderOgImage({ source, output: join(PUBLIC_DIR, 'og-default.jpg') });

  // eslint-disable-next-line no-console -- build-time script, not runtime
  console.log('Icon raster build complete.');
}

main().catch((err) => {
  // eslint-disable-next-line no-console -- build-time script, not runtime
  console.error(err);
  process.exit(1);
});
