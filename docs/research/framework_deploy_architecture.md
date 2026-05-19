# Research: Framework + Deploy Architecture at Enterprise Scale

> Source: general-purpose research agent, 2026-05-14 (Round 2).
> Lens: CORE (lock now, expensive to retrofit) / ADDITIVE (layer on later) / TRAP (right for enterprise, wrong for 1-founder scale).

---

## 1. Framework choice at scale

The 2026 picture is more nuanced than "Next.js always wins." **Next.js App Router is the dominant choice for consumer-facing sites that mix marketing + auth'd portal** — verifiable by adoption (NPM downloads, 300% enterprise growth since 2023, Next.js 16.2 stable with the Adapter API in Mar 2026). But there are visible structural regrets:

- **Railway moved off Next.js entirely** in 2025, citing 10-min builds, hacky shared layouts in Pages Router, and — critically — "**App Router leans heavily into server-first patterns, and our product is intentionally client-driven**." They migrated to Vite + TanStack Start and dropped builds to <2 min. ([Railway blog](https://blog.railway.com/p/moving-railways-frontend-off-nextjs))
- The structural lesson: **Next.js App Router is the right default when your site is content + SSR-rendered portal pages**. It is the _wrong_ default when your portal is essentially a stateful single-page client (real-time, WebSocket-heavy, "feels like an app").
- For Quilty's site (marketing pages + account portal that mostly displays data), App Router fits. If the portal ever becomes a real-time dashboard, that's when a split (`app.quilty.app` as SPA) becomes worth it.

CORE locks: framework, router style (App Router vs Pages Router), and "marketing same app vs separate SPA". All three are expensive to retrofit.

## 2. Deploy on AWS — SST vs OpenNext vs Amplify

**SST is the production answer in 2026** for Next.js on AWS, but it's a thin wrapper: SST uses OpenNext under the hood. ([SST docs](https://sst.dev/docs/component/aws/nextjs/), [OpenNext](https://opennext.js.org/))

Reality checks worth knowing now:

- OpenNext has documented production users — **Gymshark, Udacity, TUDN, NHS England** — and 5k stars / 138 releases. Production-viable but "not battle-tested as commercial alternatives." ([OpenNext GitHub](https://github.com/opennextjs/opennextjs-aws))
- **Next.js 16.2 stabilized the Adapter API** (March 2026). AWS/Cloudflare/Netlify are building unified adapters in a shared monorepo, expected end of 2026. ([3 Years of OpenNext](https://opennext.js.org/news/2026-03-25-3-years-of-opennext)) — this is the only "wait six months and re-evaluate" trigger I'd watch.
- SST limitations to know now: **CloudFront has a 25 cache-behaviors cap** (route structure is constrained), **1 MB request body cap on Lambda@Edge**, 60s default CloudFront timeout. None block Quilty; all are CORE to know before deciding on route layout.
- **No HIPAA guidance in SST docs.** You'll need to validate BAA coverage on each underlying primitive (Lambda, CloudFront, S3, DynamoDB cache) yourself.

CORE: pick SST or roll OpenNext directly. **Avoid Amplify Hosting** for HIPAA work — it's a managed deploy with limited primitive control.

## 3. Marketing + portal coexistence

Formcake's monorepo case study is the most honest data point: **same monorepo + same Next.js app for marketing + portal pays off** for tiny teams because (a) pricing pulls from the same source as the app, (b) feature + marketing ship in one PR, (c) one domain = SEO simplicity. Their explicit caveat: "this only works because we're four people — all developers." ([Formcake blog](https://formcake.com/blog/why-we-chose-a-marketing-and-app-monorepo))

The structural retrofit cost is _modest_ if you keep marketing under `/` and portal under `/account/*` in the same Next.js app — splitting later is a route-by-route copy. The retrofit cost is _high_ if you put marketing on a different domain and need to reunify URLs for SEO.

CORE: same-origin (quilty.app for both) with `/account/*` for portal. Auth on `auth.quilty.app` is correct — Cognito Hosted UI needs its own origin to keep cookies and CSP clean.

## 4. URL + routing — what to lock day one

This is the most under-appreciated CORE category. Things that are nearly free now and brutal to retrofit:

- **Trailing-slash policy**: pick one (Google: "doesn't matter which, must be consistent"; both 200ing is duplicate content). Next.js default is no-trailing-slash; lock via `trailingSlash: false` in `next.config.js` and never revisit. ([Google Search Central](https://developers.google.com/search/blog/2010/04/to-slash-or-not-to-slash))
- **Locale strategy**: developers in the wild describe non-default locale URL patterns as "really horrendous, cost us innumerable hours" ([Next.js Discussion #23419](https://github.com/vercel/next.js/discussions/23419)). Default Next.js sub-path routing (`/en/`, `/de/`) is the safe lock — domain routing (`de.quilty.app`) only pays off at translation-team scale.
- **Path conventions**: `/blog/<slug>` not `/posts/<slug>` (industry default; cheaper SEO link-building). `/account/*` not `/dashboard/*` (closer to user mental model for healthcare).
- **`auth.quilty.app` for Cognito** — locking it now means you'll never need to rewrite cookie scopes, CSP, or session-cookie domain logic.

CORE: trailing-slash, locale-prefix-vs-subdomain, blog vs posts slug, auth subdomain. **All on day one, all in one ADR.**

## 5. Monorepo

The 2026 verdict is clearer than the noise suggests:

- **Turborepo + pnpm workspaces for <50 packages / <50 engineers** ([daily.dev](https://daily.dev/blog/monorepo-turborepo-vs-nx-vs-bazel-modern-development-teams/))
- Nx is overkill until you have polyglot needs or strict architectural rules
- Bazel is for 1000+ engineer orgs

For Quilty: **a Turborepo with `apps/website` + `packages/shared-types` is the right lock**, even if Flutter app types live in Dart. The structural value is sharing TypeScript types between website and backend Lambdas (Track A) — that's already in scope. Sharing with Flutter via codegen from a single OpenAPI spec is better than monorepo-coupling.

CORE: Turborepo + pnpm. ADDITIVE: remote cache, codegen pipeline. TRAP: pulling Flutter into the same monorepo.

## 6. BFF pattern

Next.js docs (Next 16.2, May 2026) are explicit: **App Router _is_ the BFF** — Route Handlers + `proxy` are the official recommendation. ([Next.js BFF guide](https://nextjs.org/docs/app/guides/backend-for-frontend)) Important caveats from the same doc:

- "Fetch data in Server Components directly from its source, not via Route Handlers" — Route Handlers add an HTTP hop.
- "Server Actions are queued. Using them for data fetching introduces sequential execution."
- For HIPAA: "Remove sensitive or unnecessary data from responses and backend logs. Rotate credentials and API keys regularly."

For Quilty, the BFF layer is essentially free if you use App Router. The CORE decision is: **client never talks to AWS API Gateway directly — all PHI traverses the Next.js server-side**, where you can scrub logs, add idempotency keys, and enforce session checks. This is expensive to retrofit if you start with a SPA hitting API GW directly.

---

## CORE / ADDITIVE / TRAP table

| Decision                                                         | Verdict         | Why                                                                                       |
| ---------------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------- |
| Next.js 16+ App Router                                           | **CORE**        | Default for marketing+portal mix; only wrong if portal is real-time SPA-shaped            |
| SST (uses OpenNext) on AWS                                       | **CORE**        | Production-viable, only managed Next.js path that gives primitive control for HIPAA       |
| Same-app marketing + `/account/*` portal                         | **CORE**        | Cheap to split later, expensive to unify if started split                                 |
| `auth.quilty.app` subdomain                                      | **CORE**        | Cookie scope + CSP debt is permanent                                                      |
| Trailing-slash policy locked in `next.config.js`                 | **CORE**        | Retrofit = mass 301s + SEO loss                                                           |
| Locale strategy = sub-path `/en/`, `/de/`                        | **CORE**        | Even if you ship English-only first; lock the URL shape                                   |
| Turborepo + pnpm + `apps/` + `packages/`                         | **CORE**        | Day-one structure; refactoring directories later is days of pain                          |
| BFF via Next.js Route Handlers (no client→API GW direct)         | **CORE**        | PHI must traverse server; retrofitting client-direct calls is a rewrite                   |
| URL conventions ADR (slugs, paths, redirects)                    | **CORE**        | 30 min now, weeks later                                                                   |
| Remote Turborepo cache (Vercel free tier)                        | **ADDITIVE**    | Layer on when CI exceeds 3 min                                                            |
| ISR / on-demand revalidation                                     | **ADDITIVE**    | Operational, not structural                                                               |
| Server Actions for mutations                                     | **ADDITIVE**    | Can be added gradually; not architectural                                                 |
| Edge runtime / Lambda@Edge tricks                                | **ADDITIVE**    | Only when latency-budget forces it                                                        |
| OpenTelemetry on the website                                     | **ADDITIVE**    | Defer until launch traffic warrants it                                                    |
| WAF / Shield Advanced on website                                 | **ADDITIVE**    | CloudFront default + AWS Shield Standard is fine pre-launch                               |
| Domain-routed i18n (`de.quilty.app`)                             | **TRAP**        | Premature; only pays off with separate per-locale translation teams                       |
| Nx instead of Turborepo                                          | **TRAP**        | Overkill for solo founder                                                                 |
| Bazel                                                            | **TRAP**        | 1000+ engineer tool                                                                       |
| Separate marketing site (Astro) + separate portal (React SPA)    | **TRAP**        | Two deploys, two domains, double SEO/auth/analytics work for zero gain at 1-founder scale |
| Federated micro-frontends / Module Federation                    | **TRAP**        | Org-scaling pattern, not capability-adding                                                |
| Amplify Hosting                                                  | **TRAP**        | Loses primitive control; HIPAA boundary muddier than SST/OpenNext                         |
| Per-package CI pipelines                                         | **TRAP**        | Turborepo affected-graph is enough until headcount forces it                              |
| Custom BFF service (separate Express/Fastify) in front of Lambda | **TRAP**        | Next.js Route Handlers cover this; extra service = extra hop, extra cold start, extra ops |
| Switching to Vite + TanStack Start now                           | **TRAP-for-us** | Right call for Railway (real-time, client-heavy); wrong call for content + auth'd portal  |

**Bottom line:** Lock 9 things on day one (framework, deploy tool, same-app structure, auth subdomain, trailing slash, locale shape, monorepo layout, BFF discipline, URL ADR). Everything else can wait until traffic, headcount, or compliance audit makes it urgent.

## Sources

- [Railway: Moving Railway's frontend off Next.js](https://blog.railway.com/p/moving-railways-frontend-off-nextjs)
- [OpenNext: 3 Years of OpenNext (Mar 2026)](https://opennext.js.org/news/2026-03-25-3-years-of-opennext)
- [OpenNext AWS adapter (GitHub)](https://github.com/opennextjs/opennextjs-aws)
- [SST Next.js component docs](https://sst.dev/docs/component/aws/nextjs/)
- [Next.js: Backend for Frontend guide (Next 16.2, May 2026)](https://nextjs.org/docs/app/guides/backend-for-frontend)
- [Formcake: Why we chose a marketing and app monorepo](https://formcake.com/blog/why-we-chose-a-marketing-and-app-monorepo)
- [daily.dev: Monorepo in 2026 — Turborepo vs Nx vs Bazel](https://daily.dev/blog/monorepo-turborepo-vs-nx-vs-bazel-modern-development-teams/)
- [Google Search Central: To slash or not to slash](https://developers.google.com/search/blog/2010/04/to-slash-or-not-to-slash)
- [Next.js Discussion #23419: i18n locale URL suffix regrets](https://github.com/vercel/next.js/discussions/23419)
- [Next.js i18n routing docs](https://nextjs.org/docs/pages/building-your-application/routing/internationalization)
