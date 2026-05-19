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
];
