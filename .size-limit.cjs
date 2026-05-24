/**
 * Bundle size budgets — size-limit config.
 *
 * Why: Next.js 16 deleted per-route build statistics (Vercel admitted
 * the numbers were unreliable). External bundle budgeting is the only
 * way to detect regressions before they ship.
 *
 * M1 baseline (calibrated against the first green build on 2026-05-19):
 *   - Total .next/static/chunks/*.js raw   ~650 KB
 *   - Gzip                                  ~200 KB
 *   - Brotli                                ~165 KB
 *
 * Initial budgets are 30% above baseline — room for M2 content but
 * tight enough that adding @posthog/posthog-js or @next/script bloat
 * trips a CI failure. Ratchet down as M2 lands real content.
 *
 * Run: `pnpm size`
 * CI:  fail-on-exceeded via the GitHub Actions job in ci.yml.
 *
 * NOTE on Turbopack chunk hashing: Next.js 16 emits content-hashed
 * filenames at every build (e.g., `0qci-._tftn0w.js`). The glob below
 * targets the directory, not specific files, so the budget stays
 * stable across content changes.
 */
module.exports = [
  {
    name: 'Total static JS (gzip)',
    path: 'apps/web/.next/static/chunks/**/*.js',
    limit: '260 KB',
    gzip: true,
  },
  {
    name: 'Total static JS (brotli)',
    path: 'apps/web/.next/static/chunks/**/*.js',
    limit: '215 KB',
    brotli: true,
  },
  {
    name: 'Total static CSS (gzip)',
    path: 'apps/web/.next/static/chunks/**/*.css',
    limit: '20 KB',
    gzip: true,
  },
  // Per-route shared-runtime budget. The framework + main + webpack-
  // runtime chunks load on EVERY route — landing-page latency depends
  // on this shared payload + the route-specific chunk. Target floor
  // is < 100 KB gzipped for the shared runtime, well under the
  // industry-rule-of-thumb 130 KB first-load JS ceiling. Catches a
  // landing-route regression that the aggregate-only budget above
  // would only catch much later (when the full chunks dir crosses
  // 260 KB).
  //
  // The pattern targets the framework + main shared chunks Next.js
  // emits at build time. Turbopack hashes filenames so the glob
  // matches the chunk directory; the framework chunks are the
  // largest contributors + the only ones loaded on the apex marketing
  // route.
  {
    name: 'Shared runtime + framework (gzip)',
    path: [
      'apps/web/.next/static/chunks/framework-*.js',
      'apps/web/.next/static/chunks/main-*.js',
      'apps/web/.next/static/chunks/webpack-*.js',
    ],
    limit: '100 KB',
    gzip: true,
  },
  // Per-route landing-page chunk budget. The aggregate budget at line
  // 27 catches global JS bloat but a regression that adds 20 KB to a
  // single landing route's `'use client'` graph would not trip it
  // until the full chunks dir crosses 260 KB. The (marketing) route
  // group is the apex SEO surface — its chunk should stay lean.
  // 60 KB is a generous ceiling that accommodates today's Banner +
  // CopyReference Client Components + the locale prelude; tighten as
  // M2 content lands.
  {
    name: '(marketing) route chunk (gzip)',
    path: ['apps/web/.next/static/chunks/app/**/(marketing)/**/*.js'],
    limit: '60 KB',
    gzip: true,
  },
];
