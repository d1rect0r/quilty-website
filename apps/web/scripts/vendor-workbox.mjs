#!/usr/bin/env node
/**
 * Vendor Workbox runtime files into apps/web/public/workbox/ at
 * build time.
 *
 * The Service Worker at apps/web/public/sw.js calls
 * `importScripts('/workbox/workbox-sw.js')` per ADR-0022 Decision A
 * (revised post-Phase-A) — the CDN approach was reverted because the
 * `script-src 'self'` CSP directive blocks cross-origin importScripts,
 * which silently degrades the SW to a no-op when CSP enforces.
 *
 * Self-hosting:
 *   - Removes the third-party CDN dependency (`storage.googleapis.com`
 *     was a privacy + BAA-scope concern even though it carries no
 *     cookies).
 *   - Aligns with `script-src 'self'` AND `worker-src 'self'` directives
 *     without weakening either.
 *   - Pins the Workbox version via `workbox-sw` npm dep so a
 *     downstream advisory triggers a normal npm-audit + dependabot
 *     bump path rather than a silent CDN-side change.
 */

import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appWebRoot = resolve(__dirname, '..');
const publicDir = join(appWebRoot, 'public', 'workbox');

// Resolve each workbox package's build/ directory via
// `import.meta.resolve('<pkg>/package.json')` (returns a file:// URL
// we convert to a path). We use the package.json (not main entry)
// because workbox modules are SW-context bundles referencing
// `self`, which throws at Node evaluation time. createRequire
// returned the parsed JSON object on Node 24, making dirname()
// fail; import.meta.resolve returns a string URL regardless.
const WORKBOX_PACKAGES = [
  'workbox-sw',
  'workbox-core',
  'workbox-routing',
  'workbox-strategies',
  'workbox-expiration',
  'workbox-precaching',
];

async function buildDirOf(pkgName) {
  const pkgUrl = import.meta.resolve(`${pkgName}/package.json`);
  const pkgPath = fileURLToPath(pkgUrl);
  const root = dirname(pkgPath);
  const buildDir = join(root, 'build');
  if (!existsSync(buildDir)) {
    throw new Error(
      `vendor-workbox: ${pkgName} build dir missing at ${buildDir}; fix: pnpm --filter web install`,
    );
  }
  return buildDir;
}

await mkdir(publicDir, { recursive: true });

const copied = [];
for (const pkgName of WORKBOX_PACKAGES) {
  const buildDir = await buildDirOf(pkgName);
  const files = await readdir(buildDir);
  for (const file of files) {
    // Prod-only filter: skip `*.dev.js`, `*.dev.js.map`, and ALL
    // `.map` files. The dev variants are 6x larger and would be
    // served from /public/ if any client requested them directly;
    // the SW only ever loads the .prod variants at runtime per
    // `workbox-sw.js`'s `debug: "localhost" === self.location.hostname`
    // gate. Source maps add no end-user debugging value (Workbox
    // library internals) but ship Workbox source bytes to anyone
    // who fetches them. Phase-C perf Warning #4 + #5.
    if (file.endsWith('.dev.js') || file.endsWith('.dev.js.map')) continue;
    if (file.endsWith('.map')) continue;
    if (!file.endsWith('.js')) continue;
    const src = join(buildDir, file);
    const dst = join(publicDir, file);
    await copyFile(src, dst);
    copied.push(file);
  }
}

console.log(`vendor-workbox: copied ${copied.length} file(s) to ${publicDir}`);
