/**
 * Bundle size budgets — size-limit config.
 *
 * Why: Next.js 16 deleted per-route build statistics (Vercel admitted
 * the numbers were unreliable). External bundle budgeting is the only
 * way to detect regressions before they ship.
 *
 * Four-tier route taxonomy (per ADR-0018):
 *
 *   Tier            Routes                                       Per-route gz   First-load gz
 *   ─────────────   ──────────────────────────────────────────   ────────────   ─────────────
 *   Lean marketing  11 non-legal marketing pages                 60 KB           180 KB
 *   Content legal   7 legal pages (privacy / terms / etc.)       30 KB           150 KB
 *   Portal          7 account pages                              150 KB          280 KB
 *   Error/utility   3 status pages (/410 /451 /503)              20 KB           130 KB
 *
 * Per-route budgets measure ONLY the route-specific chunk Next.js emits
 * under `chunks/app/[locale]/(marketing)/<route>/page-<hash>.js`. First-
 * load budgets combine the route chunk + framework + main + webpack
 * runtime chunks (what the browser actually downloads on cold visit).
 *
 * The Next.js 16 + React 19 baseline is ~70-90 KB gzipped BEFORE app
 * code (framework + main + runtime). First-load budgets accommodate
 * this floor + leave room for app code + heaviest deps.
 *
 * Aggregate budgets (lines below the factory output) catch global JS
 * bloat that per-route entries miss (shared chunk regressions).
 *
 * Run: `pnpm size`
 * CI:  fail-on-exceeded via `andresz1/size-limit-action@v2` in ci.yml
 *      with PR-blocking diff comments.
 *
 * Lighthouse CI is deferred to M4-M6 (TW-015) — needs preview URLs +
 * 3+ runs per URL for INP denoise. size-limit covers byte budgets
 * exclusively at M1.6.
 */

// Shared chunks loaded on every route. Used as part of the first-load
// glob for every per-route entry.
const SHARED_RUNTIME_GLOBS = [
  'apps/web/.next/static/chunks/framework-*.js',
  'apps/web/.next/static/chunks/main-*.js',
  'apps/web/.next/static/chunks/webpack-*.js',
];

// Lean marketing tier — non-legal marketing pages. Apex SEO surface +
// landing pages. 60 KB per-route ceiling tightens at Turnstile +
// Banner client-island activation per the M1.5 perf-bundle reviewer
// MEDIUM finding M1.
// Next.js route-group `(marketing)` and dynamic-segment `[locale]`
// brackets are glob metacharacters. The chunk path layout is:
//   apps/web/.next/static/chunks/app/[locale]/(marketing)/<route>/page-*.js
// tinyglobby (size-limit 12.x's glob library) treats `[…]` as a
// character class and `(…)` as an extglob group; escaping with `\\[`
// + `\\(` forces literal matching.
const MARKETING_BASE = 'apps/web/.next/static/chunks/app/\\[locale\\]/\\(marketing\\)';
const ACCOUNT_BASE = 'apps/web/.next/static/chunks/app/\\[locale\\]/\\(account\\)/account';
const ERRORS_BASE = 'apps/web/.next/static/chunks/app/\\(errors\\)';

const LEAN_MARKETING_ROUTES = [
  { name: 'home', glob: `${MARKETING_BASE}/page-*.js` },
  { name: 'about', glob: `${MARKETING_BASE}/about/page-*.js` },
  { name: 'contact', glob: `${MARKETING_BASE}/contact/page-*.js` },
  { name: 'customers', glob: `${MARKETING_BASE}/customers/page-*.js` },
  { name: 'features', glob: `${MARKETING_BASE}/features/page-*.js` },
  { name: 'for-business', glob: `${MARKETING_BASE}/for-business/page-*.js` },
  { name: 'help', glob: `${MARKETING_BASE}/help/page-*.js` },
  { name: 'pricing', glob: `${MARKETING_BASE}/pricing/page-*.js` },
  { name: 'science', glob: `${MARKETING_BASE}/science/page-*.js` },
  { name: 'security', glob: `${MARKETING_BASE}/security/page-*.js` },
  { name: 'trust', glob: `${MARKETING_BASE}/trust/page-*.js` },
];

// Content legal tier — legal pages. Static content + minimal client
// islands; 30 KB per-route is tight but realistic for prose pages.
// Catches a regression that pulls heavy client code into legal copy.
const CONTENT_LEGAL_ROUTES = [
  { name: 'legal-privacy', glob: `${MARKETING_BASE}/legal/privacy/page-*.js` },
  {
    name: 'legal-consumer-health-data-privacy',
    glob: `${MARKETING_BASE}/legal/consumer-health-data-privacy/page-*.js`,
  },
  { name: 'legal-terms', glob: `${MARKETING_BASE}/legal/terms/page-*.js` },
  { name: 'legal-subprocessors', glob: `${MARKETING_BASE}/legal/subprocessors/page-*.js` },
  { name: 'legal-accessibility', glob: `${MARKETING_BASE}/legal/accessibility/page-*.js` },
  { name: 'legal-cookies', glob: `${MARKETING_BASE}/legal/cookies/page-*.js` },
  { name: 'legal-privacy-choices', glob: `${MARKETING_BASE}/legal/privacy-choices/page-*.js` },
];

// Portal tier — authenticated account pages. Forms + interactive
// state. 150 KB per-route accommodates form libraries (react-hook-form
// + Zod) + auth-aware client islands. 280 KB first-load covers the
// portal-tier nonce-CSP overhead.
const PORTAL_ROUTES = [
  { name: 'account-home', glob: `${ACCOUNT_BASE}/page-*.js` },
  { name: 'account-data', glob: `${ACCOUNT_BASE}/data/page-*.js` },
  { name: 'account-delete', glob: `${ACCOUNT_BASE}/delete/page-*.js` },
  { name: 'account-notifications', glob: `${ACCOUNT_BASE}/notifications/page-*.js` },
  { name: 'account-privacy', glob: `${ACCOUNT_BASE}/privacy/page-*.js` },
  { name: 'account-security', glob: `${ACCOUNT_BASE}/security/page-*.js` },
  { name: 'account-subscription', glob: `${ACCOUNT_BASE}/subscription/page-*.js` },
];

// Error/utility tier — status pages + dev diagnostics. These pages
// surface at outage time + Googlebot scrapes them on 4xx/5xx
// crawls; bloat here directly impacts user trust at the worst
// moment. Tight 20 KB per-route catches Sentry-init / error-overlay
// bloat leaking into the (errors) route group. 130 KB first-load
// accommodates the same shared-runtime floor every page carries.
const ERROR_ROUTES = [
  { name: 'error-410', glob: `${ERRORS_BASE}/410/page-*.js` },
  { name: 'error-451', glob: `${ERRORS_BASE}/451/page-*.js` },
  { name: 'error-503', glob: `${ERRORS_BASE}/503/page-*.js` },
];

/**
 * Produce a pair of size-limit entries (per-route + first-load) for a
 * single route. Per-route measures the chunk in isolation; first-load
 * measures the same chunk PLUS the framework/main/webpack-runtime
 * chunks the browser loads alongside it on a cold visit.
 */
function routeEntries({ name, glob, tier, perRouteLimit, firstLoadLimit }) {
  return [
    {
      name: `${tier} :: ${name} (per-route gz)`,
      path: [glob],
      limit: perRouteLimit,
      gzip: true,
    },
    {
      name: `${tier} :: ${name} (first-load gz)`,
      path: [glob, ...SHARED_RUNTIME_GLOBS],
      limit: firstLoadLimit,
      gzip: true,
    },
  ];
}

const perRouteEntries = [
  ...LEAN_MARKETING_ROUTES.flatMap((r) =>
    routeEntries({ ...r, tier: 'marketing', perRouteLimit: '60 KB', firstLoadLimit: '180 KB' }),
  ),
  ...CONTENT_LEGAL_ROUTES.flatMap((r) =>
    routeEntries({ ...r, tier: 'legal', perRouteLimit: '30 KB', firstLoadLimit: '150 KB' }),
  ),
  ...PORTAL_ROUTES.flatMap((r) =>
    routeEntries({ ...r, tier: 'portal', perRouteLimit: '150 KB', firstLoadLimit: '280 KB' }),
  ),
  ...ERROR_ROUTES.flatMap((r) =>
    routeEntries({ ...r, tier: 'error', perRouteLimit: '20 KB', firstLoadLimit: '130 KB' }),
  ),
];

module.exports = [
  // Aggregate budgets — catch global JS bloat that per-route entries
  // alone would miss. Calibrated to the webpack-build baseline (the
  // measurement surface size-limit consumes; see ADR-0018 for the
  // Turbopack-vs-webpack chunk-structure rationale). Webpack vendor
  // splitting produces a ~1.4 MB OpenTelemetry-instrumentation chunk +
  // a ~600 KB Sentry-vendor chunk that Turbopack used to merge into
  // a single tighter graph; the trade-off bought per-route subdirectory
  // chunks (required for the per-route budget surface below).
  //
  // Ratchet down only after webpack vendor-chunk graph stabilises (no
  // additional vendor SDKs landing in M2-M3); first re-baseline at the
  // first explicit ADR-0018 review trigger.
  {
    name: 'Total static JS (gzip)',
    path: 'apps/web/.next/static/chunks/**/*.js',
    limit: '2.5 MB',
    gzip: true,
  },
  {
    name: 'Total static JS (brotli)',
    path: 'apps/web/.next/static/chunks/**/*.js',
    limit: '2.0 MB',
    brotli: true,
  },
  {
    name: 'Total static CSS (gzip)',
    path: 'apps/web/.next/static/css/**/*.css',
    limit: '20 KB',
    gzip: true,
  },
  // Shared runtime + framework chunks (loaded on every route). 110 KB
  // ceiling catches a framework upgrade regression before it lands on
  // every page's first-load measurement.
  {
    name: 'Shared runtime + framework (gzip)',
    path: SHARED_RUNTIME_GLOBS,
    limit: '110 KB',
    gzip: true,
  },
  // 28 routes × 2 entries (per-route + first-load) = 56 per-route entries.
  // 11 marketing + 7 legal + 7 portal + 3 error = 28 total routes.
  ...perRouteEntries,
];
