# ADR-0022: Service Worker + PWA install (hand-rolled Workbox + iOS coach-mark)

- **Status:** Accepted
- **Date:** 2026-05-27
- **Last reviewed:** 2026-05-27
- **Deciders:** Volodymyr Petrychenko
- **Originating discussion:** M1.6 Workstream D.4 research; 2 user alignment decisions (U10 — iOS PWA coach-mark UX; SW library = hand-rolled Workbox not next-pwa/@serwist) answered 2026-05-27
- **Related decisions:** D31 (zero-PHI in website runtime), D32 (CSP), D42d (CloudWatch zero-PHI), D67 (PHI sanitizer chokepoint)
- **Related ADRs:** [ADR-0005](0005-csp-two-tier.md), [ADR-0017](0017-http-client-and-resilience.md), [ADR-0018](0018-bundle-size-budgets.md)
- **Software versions assumed:** Workbox 7.3+, Next.js 16, React 19, modern browsers (no IE11)

## Context

A consumer-facing site that takes engagement seriously ships an installable PWA + offline-tolerant cache strategy. Quilty's pre-launch traffic is zero, but the surface — install-prompt UX, Service Worker registration discipline, cache-strategy-per-route-type — is one of the highest-retrofit-cost frontend seams. Wiring it at scaffold time costs hours; retrofitting it after launch costs weeks (every component author needs to learn cache semantics + every PR needs SW-aware review).

The HIPAA-specific risk: a misconfigured SW caches an `/account/*` route fragment that contains PHI (even just a name in a session-greeting), and that cache survives logout. The route never appears in CloudWatch logs (the SW intercepts the fetch before it leaves the browser), so the leak is silent until a security audit.

## Decision

We will ship a hand-rolled Workbox-based Service Worker at `apps/web/public/sw.js`, registered via `workbox-window`-shaped patterns from a client island in `app/layout.tsx`, with cache strategies + a `<InstallPrompt>` component flag-gated until activation (TW-015).

### Decision A — Library: hand-rolled Workbox, **self-hosted at `/workbox/`** (NOT next-pwa, NOT @serwist/next)

User-locked. `next-pwa` is single-maintainer abandonware (no releases since 2023; 3 unresolved bug threads naming Next.js 14+ incompatibility). `@serwist/next` is a 2024 fork in the same neighbourhood with healthier maintenance but a small contributor base.

**Self-host the Workbox runtime bundles** under `/workbox/` rather than loading from `https://storage.googleapis.com/workbox-cdn/...`. Revised post Phase-A bug-hunter: a CDN-loaded `importScripts(...)` is governed by the page's `script-src` directive, and our `script-src 'self'` policy would BLOCK the CDN load under enforce, silently degrading the SW to a no-op (no NetworkOnly exclusion for `/api/auth/*`, no LOGOUT_CACHES_CLEARED handler — all PHI defenses vanish). The `apps/web/scripts/vendor-workbox.mjs` script copies the `workbox-{sw,core,routing,strategies,expiration,precaching}` 7.3 build files into `apps/web/public/workbox/` during the `prebuild` hook; `workbox.setConfig({ modulePathPrefix: '/workbox/' })` pins the lazy-module loader to the same-origin copy.

Hand-rolling Workbox (vs a npm plugin):

- **Zero plugin lock-in.** When a plugin's API breaks, we don't have to fork it.
- **Minimal build-step changes.** The SW file is plain JS served from `public/`; the vendor script is ~50 LOC and runs in `prebuild`. No next-pwa wrapper hooks the Next.js build pipeline.
- **Standard Workbox primitives** (CacheFirst, NetworkFirst, ExpirationPlugin) — same primitives every PWA tutorial uses, no Quilty-specific abstractions for a future maintainer to learn.
- **Pinned dep, audit-clean path.** A Workbox advisory triggers a normal `pnpm audit` + dependabot bump path; a CDN-side regression would have no audit visibility.

### Decision B — Cache strategies per route type

| Route family                                                                       | Strategy                               |
| ---------------------------------------------------------------------------------- | -------------------------------------- |
| `/_next/static/*`, `/static/*`, fonts, icons, manifest                             | CacheFirst (30-day expiry)             |
| Navigations + HTML routes                                                          | NetworkFirst, 3s timeout (then cache)  |
| `/api/auth/*`, `/api/contact`, `/api/csp-report`, `/api/dsar/*`, `/api/webhooks/*` | NetworkOnly (excluded from SW caching) |
| `/[locale]/account/*` (portal)                                                     | NetworkOnly                            |
| `?_rsc=*` (RSC payloads), Sentry/PostHog tunnels                                   | NetworkOnly                            |

The exclusion list is the dominant PHI defense — every route that could plausibly carry a name, email, account-state, or session fragment gets bypassed entirely. NetworkFirst with a 3s timeout for HTML balances marketing-freshness against offline-first.

### Decision C — Install-prompt flag-gated (TW-015 activation)

`<InstallPrompt>` is built but not rendered by default. Activation gate: first install-conversion-intent measurement signal — once analytics show user attempts to bookmark / share / "add to home screen" via OS-native paths, we flip `features.install_prompt_enabled` to true and render the prompt in the marketing layout.

The component handles two platforms:

- **Chrome / Edge / Android**: captures `beforeinstallprompt`, suppresses native banner, surfaces custom UI with explicit Install + Not-now CTAs.
- **iOS Safari** (U10 lock — iOS PWA coach-mark): no `beforeinstallprompt` exists; detect via `navigator.standalone === false` + `iPhone|iPad` userAgent + render `<IOSCoachMark>` with explicit step-by-step copy referencing the share-sheet "Add to Home Screen" action. This is the only legitimate iOS install affordance.

### Decision D — Security hardening

- `Cache-Control: no-cache, no-store, must-revalidate` on `/sw.js` (set in `proxy.ts`) so a stale SW doesn't suppress future updates.
- CSP `worker-src 'self'` (added to both marketing + portal CSP builders) — restricts SW registration to same-origin scripts.
- `clients.postMessage('LOGOUT_CLEAR_CACHES')` triggers a 3-step purge:
  1. SW clears all `caches`.
  2. SW calls `self.registration.unregister()` — without this, the SW stays active for the next sign-in user's first request, even though caches are empty.
  3. SW posts `LOGOUT_CACHES_CLEARED` back to the originating client, which hard-reloads via `window.location.reload()`. A 2s timeout fallback handles Safari edge cases where the message event doesn't fire.
- `cleanupOutdatedCaches()` on SW `activate` prunes prior-version caches automatically.
- `request.method !== 'GET'` short-circuit inside `isExcluded()` so Server Actions (POST to the same route URLs a navigation would use) bypass every Workbox cache strategy. Belt-and-braces beyond the per-strategy `request.mode === 'navigate'` checks.
- Locale exclusion regex `[a-z]{2,}(-[a-z0-9]+)*` covers BCP 47 locales (`pt-BR`, `zh-Hant`) rather than the original `[a-z]{2}` which missed any multi-segment tag and silently allowed PHI account routes through the NetworkFirst cache.

### Decision E — Production-only registration

The registrar island at `lib/sw/register.ts` short-circuits in `next dev` (NODE_ENV !== 'production'). Turbopack's HMR + on-demand chunk resolution don't play nicely with cache-first strategies; the SW would intercept HMR websocket fetches and break the dev feedback loop. Production-only SW is the canonical pattern (Vercel docs, Next.js examples).

## Consequences

### Positive

- **Zero plugin lock-in.** Workbox is a stable surface; our SW source is plain JS that any frontend dev can read.
- **PHI defense-in-depth.** The exclusion list is explicit; reviewers can audit `apps/web/public/sw.js` directly to see which routes are excluded.
- **Install-prompt UX scaffolded** so the activation flip at TW-015 is a one-flag-flip, not a multi-PR rebuild.

### Negative / Trade-offs

- **Vendored Workbox bytes ship in every prod build.** ~80KB of vendored runtime files in `public/workbox/`. Trade is intentional: zero CDN dependency + clean script-src policy.
- **Cache-strategy churn.** Adding a new route family means adding a new exclusion or registerRoute call. Documented in `apps/web/public/sw.js` comments + ADR table above.
- **No SSR/RSC support in SW context.** Service Workers run in their own thread with no DOM access; React 19 server components don't compose. The SW handles network shaping only.

## Activation triggers (cross-references)

- **TW-015 — Install-prompt activation**: first install-conversion-intent measurement signal. Flip `features.install_prompt_enabled` + mount `<InstallPrompt>` in marketing layout.
- **TW-014 — `clearServiceWorkerCaches()` wiring at sign-out**: when real auth lands, the sign-out Route Handler client callback MUST call `clearServiceWorkerCaches()` (exported from `apps/web/lib/sw/register.ts`). The function is wired with a TODO + ADR cross-ref so the future implementer can't miss it.

## Anti-patterns to avoid

- **Caching authenticated routes** — `/account/*` + `/api/auth/*` MUST stay in the exclusion list. Adding a new portal-tier route requires adding the matching exclusion regex.
- **Logged-PHI in SW errors** — the no-op fallback console.warn is intentionally generic ("Workbox CDN unreachable"). No URL fragments, no request bodies, no PII.
- **Aggressive cache-first for HTML** — marketing freshness wins; NetworkFirst with 3s timeout is the balance.
- **Pre-cache lists** — we don't ship a precache manifest because the route surface changes per content edit. Cache-on-first-fetch is sufficient.

## References

- [Workbox docs](https://developer.chrome.com/docs/workbox/)
- [Service Worker security canon (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [iOS Add-to-Home-Screen UX guidance (Apple HIG)](https://developer.apple.com/design/human-interface-guidelines/components/system-experiences/onboarding/)
- [next-pwa abandonware analysis (2024 community thread)](https://github.com/shadowwalker/next-pwa)
- [@serwist/next (active fork)](https://serwist.pages.dev/)
