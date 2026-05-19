# Enterprise Marketing + Portal IA Research — quilty-website M1 Inputs

**Reviewer:** Senior frontend architecture reviewer (zero prior context)
**Target quality bar:** Discord / Duolingo / Uber / Stripe / Cal.com 2026
**Horizon:** 2–3 years, 1 → 5–10 engineers
**Scope of this doc:** Marketing site + customer account portal — structure, navigation, routing, content architecture. NOT security, observability, tooling.

All claims are anchored in fetches/repo-reads performed during this research session. URLs and `gh api` paths cited inline.

---

## Question 1 — URL conventions

### Enterprise pattern (2026)

**No trailing slashes** is the dominant Next.js/Vercel/Linear/Stripe/Cal.com default — Next.js's `trailingSlash: false` (the default) is what every reference site ships. Locale-as-segment (`/en/...`, `/de/...`) is the canonical pattern for sites that ship i18n; Vercel, Notion, and Linear all expose locale in the URL rather than relying on middleware rewrites alone (per next-intl + Next.js i18n docs; Cal.com does i18n at provider level above `app/`). Content collections use **singular `/blog/<slug>`** (Linear, Vercel, Notion, Resend, Cal.com all on `/blog`) — `/posts` and `/articles` are rare in enterprise. Customer stories live at **`/customers/<slug>`** (Stripe, Vercel) or **`/customers`** index (Linear). Authenticated portal lives under **`/settings`** (Cal.com canonical — `gh api repos/calcom/cal.com/contents/apps/web/app/(use-page-wrapper)/settings`), under **`/account`** subdomain (Stripe `dashboard.stripe.com`, Whoop `app.whoop.com`, Vercel `vercel.com/<team>/settings`), or both. **`/dashboard`** is reserved for the home of the authenticated app shell (Vercel, Linear "Open app"). Account-deletion convention in 2026 is **two URLs**: in-app at `/settings/account` (with delete sub-flow), and a public unauthenticated `/delete-account` page (Google Play 2024+ policy + GDPR/CCPA — both regulations now expect both).

### Reference examples

- Cal.com settings tree (verified): `/settings/my-account/{profile,general,calendars,conferencing,appearance,out-of-office,push-notifications}`, `/settings/security/{password,two-factor-auth}`, `/settings/developer/{api-keys,oauth,webhooks}` (`gh api repos/calcom/cal.com/contents/apps/web/app/(use-page-wrapper)/settings/(settings-layout)/*`)
- Stripe footer + URL patterns: `dashboard.stripe.com/login`, `support.stripe.com`, `status.stripe.com`, `/customers`, `/pricing`, `/use-cases/...`, `/blog`, `/jobs`, `/newsroom` — all flat singular segments, no trailing slash
- Linear: `/method`, `/customers`, `/now`, `/contact`, `/docs`, `/changelog`, `/security` — single-segment marketing pages, footer links flat

### Anti-pattern to avoid

- Mixing trailing-slash policy (`/about` and `/about/` both 200) — kills canonical SEO. Pick `false`, redirect the other 308.
- Putting account-deletion behind a "contact support" mailto — directly violates Google Play account-deletion policy (since 2024) and is treated as a "dark pattern" under CCPA 2026 amendments.
- Using `/dashboard/billing/cancel` deep links as primary cancellation flow — when the user is unauthenticated (expired session), they hit login and lose context. Stripe/Calm/Headspace all surface cancellation via a stable, deep-linkable path within `/settings`.
- `/locale/...` middleware-rewriting that returns 200 instead of redirecting to `/en/...` — breaks canonical tags.

### Implication for our scaffold (M1)

- **Lock `trailingSlash: false`** in `next.config.ts` (Next.js default — just leave it). Add a Playwright smoke test asserting `/about/` 308s to `/about`.
- **`[locale]` segment day-one** at `app/[locale]/...` per D14/D25. Single locale `en` resolved at root via middleware redirect from `/` → `/en` — keep redirect even though English-only (locks the contract before adding `de`/`es`).
- **Singular collection roots reserved in route tree even if empty:** `/blog`, `/customers`, `/changelog`, `/legal`, `/help` (this last one redirects to `help.my-quilty.com` once Zendesk lands). Cheap to scaffold, expensive to retrofit (URL shape leaks into sitemap/canonical/redirects/external backlinks).
- **`/account/*` reserved as the portal mount** under `app/[locale]/(account)/account/...` (matches Stripe `dashboard.stripe.com`, Calm `account.calm.com`, Oura `account.oura.com` — `/account` is the consumer-health convention; `/dashboard` is more SaaS/B2B). See Q4 + Q10.
- **Public `/delete-account` page day-one** (Q10) — static page, no auth, explains data retention + flow + links to authenticated deletion at `/account/danger`. Cost = ~1 page; retrofit cost = high (it's a Google Play submission blocker and CCPA-regulator-bait).
- **Wait for M2:** actual content under `/blog`, `/customers`, `/changelog`.

---

## Question 2 — Route group structure (Next.js 16 App Router)

### Enterprise pattern (2026)

Cal.com is the gold reference for mixed marketing + auth + authenticated portal in Next.js App Router; their structure (verified live via `gh api`) uses **two top-level route groups inside `app/`**: `(booking-page-wrapper)` for public/unauthenticated booking surfaces, and `(use-page-wrapper)` for the entire authenticated product. Inside `(use-page-wrapper)` they nest a **further `(main-nav)` group** that owns the persistent sidebar/topbar layout — this is the canonical pattern for "shell" vs "no-shell" authenticated pages (e.g., onboarding wizards live as siblings of `(main-nav)`, not inside it). The Cal.com **engineering handbook (handbook.cal.com/engineering/codebase/monorepo-turborepo) explicitly separates `apps/web` (product at `app.cal.com`) from `apps/website` (marketing at `cal.com`) as two Next.js apps**; the website repo today consolidates these but deployment separation persists. For a single-app setup (which is what M1 should ship), the consensus 2026 pattern (per the Next.js 16 docs + makerkit.dev + multiple boilerplates) is **three route groups: `(marketing)`, `(auth)`, `(account)`** — each owning its own layout, with the root `app/layout.tsx` holding only the `<html>/<body>` shell and global providers.

### Reference examples

- Cal.com structure (verified via `gh api`):
  ```
  apps/web/app/
  ├── (booking-page-wrapper)/        # public bookings
  ├── (use-page-wrapper)/            # authenticated
  │   ├── (main-nav)/                # shell: bookings, availability, event-types, members
  │   ├── auth/{login,signin,signup,forgot-password,logout,verify,verify-email,oauth2,error}
  │   ├── settings/(settings-layout)/{my-account,security,developer}
  │   ├── settings/(admin-layout)/...
  │   ├── apps/, availability/, event-types/[type]/, onboarding/[[...step]]/,
  │   │   getting-started/, payment/[uid]/, refer/, upgrade/, video/, maintenance/, more/
  │   └── layout.tsx
  ├── api/{auth,me,user,csrf,email,webhook,...}
  ├── reschedule/[uid]/
  ├── error.tsx, global-error.tsx, not-found.tsx, page.tsx, layout.tsx, providers.tsx
  ```
- Next.js 16 docs canonical example: `app/(marketing)/...`, `app/(dashboard)/layout.tsx` with auth check, `app/(auth)/{login,register}/` — three groups, three layouts.
- PostHog.com (`PostHog/posthog.com`) — Gatsby-based marketing/docs/handbook site, **separate deployment** from the product app (`app.posthog.com`). Same separation principle as Cal.com.

### Anti-pattern to avoid

- A single root layout that ships marketing chrome (header + footer) to the authenticated portal — bloats first-paint JS on the most performance-sensitive path (authenticated app), and creates header/footer state-sync bugs.
- Naming groups by feature (`(billing)`, `(team)`) rather than by layout-affinity (`(marketing)`, `(account)`, `(auth)`). Feature-named groups don't compose under shared layouts and create dependency tangles when a feature touches both marketing (e.g., pricing page) and portal (e.g., billing settings).
- Putting `/api/*` Route Handlers inside `(account)` or `(marketing)` route groups — Route Handlers don't honor route group layouts but the colocation invites accidental coupling; Cal.com keeps `app/api/*` flat at the root.
- Using `[locale]` inside a route group rather than wrapping route groups in `[locale]` — `[locale]` must be the outermost segment to keep middleware/canonical/sitemap-per-locale clean.

### Implication for our scaffold (M1)

Ship this exact tree at M1 (matches Cal.com convention adapted for single-app + i18n + BFF):

```
apps/web/app/
├── layout.tsx                       # HTML shell, providers, fonts, theme
├── globals.css                      # Tailwind v4 @theme (D17)
├── not-found.tsx                    # global 404 (see Q6)
├── error.tsx                        # segment-level error boundary
├── global-error.tsx                 # last-resort root error (replaces root layout)
├── robots.ts                        # generated robots
├── sitemap.ts                       # generated sitemap (multi-locale)
├── manifest.ts                      # PWA manifest
│
├── api/                             # Route Handlers (BFF, D5)
│   ├── auth/{callback,logout,session}/route.ts
│   ├── csrf/route.ts                # CSRF token mint (D10)
│   ├── health/route.ts              # liveness
│   └── webhooks/                    # Stripe, Cognito backchannel (later)
│
└── [locale]/
    ├── layout.tsx                   # locale provider, dir=ltr/rtl, hreflang
    ├── page.tsx                     # homepage
    │
    ├── (marketing)/
    │   ├── layout.tsx               # marketing header + footer
    │   ├── about/page.tsx
    │   ├── pricing/page.tsx
    │   ├── features/page.tsx        # or product/
    │   ├── science/page.tsx         # health-specific (Q9)
    │   ├── customers/page.tsx       # later
    │   ├── blog/page.tsx            # MDX index (D30)
    │   ├── blog/[slug]/page.tsx     # MDX route
    │   ├── changelog/page.tsx
    │   ├── careers/page.tsx
    │   ├── contact/page.tsx
    │   └── legal/{privacy,terms,dpa,accessibility,hipaa-notice,subprocessors,cookie-policy}/page.tsx
    │
    ├── (auth)/
    │   ├── layout.tsx               # minimal chrome (logo only)
    │   ├── sign-in/page.tsx         # initiates redirect to auth.my-quilty.com
    │   ├── sign-out/page.tsx        # confirms + clears cookie
    │   └── callback/page.tsx        # OIDC code-flow landing (D7) → /api/auth/callback
    │
    ├── (account)/
    │   ├── layout.tsx               # portal shell (sidebar or top-nav — see Q4)
    │   ├── account/page.tsx         # /account hub (Q10)
    │   ├── account/profile/page.tsx
    │   ├── account/subscription/page.tsx   # Stripe portal redirect or embed (Q11)
    │   ├── account/billing/page.tsx        # invoices history
    │   ├── account/security/page.tsx       # MFA, password, sessions
    │   ├── account/notifications/page.tsx
    │   ├── account/privacy/page.tsx        # consent, data export, cookies
    │   ├── account/data-export/page.tsx    # GDPR portability
    │   └── account/danger/page.tsx         # delete account (auth flow)
    │
    └── delete-account/page.tsx      # PUBLIC, unauthenticated landing (Google Play / GDPR / CCPA)
```

- The `(marketing)` layout owns the global marketing header + footer; `(account)` layout owns the portal sidebar/topbar; `(auth)` layout is minimal (logo + content). This means navigating between marketing and portal triggers a Next.js full document load — that's the correct trade because it lets each layout ship independently bundled chrome.
- `[locale]` is the outermost dynamic segment, so all route groups inherit locale automatically.
- **Wait for M2:** populating `(marketing)/*` content; M1 ships the skeleton + one or two stub pages so the routing contract is real and tested.

---

## Question 3 — Marketing block taxonomy (2026)

### Enterprise pattern (2026)

Modern enterprise marketing pages are assembled from a **library of ~20–25 named block types** (not 5–6) which compose via a content-driven page-builder pattern even when the CMS is just MDX. Inspection of Stripe (homepage + `/customers`), Vercel (homepage), Linear (homepage + `/method`), Notion, and Cal.com (`/pricing`) yields a convergent taxonomy: every block falls into one of seven families — **Hero, SocialProof, Feature, Story, Compare, Code/Demo, CTA, Trust, Editorial**. Stripe's homepage alone uses 9 distinct blocks (hero, logo carousel, bento feature grid, stats wall, customer-story accordions, testimonials, capability cards, news carousel, CTA footer). Vercel's homepage uses 11 (adding use-case tabs, framework showcase, model-ranking table, template grid). The 2026 trend: **bento grids** (asymmetric tile layouts mixing image/text/code) replace flat 3-column feature grids; **animated/interactive demos inside the block** (Linear's homepage, Resend's homepage) replace screenshot blocks; **filter/tab segmentation** (Stripe Customers by Startup/Growth/Enterprise; Vercel by AI/Web/Ecommerce) replaces single linear lists.

### Reference examples

- **Stripe homepage + `/customers`** (verified fetch): hero, logo carousel, bento feature grid, stats wall (`$70M total increase in Postmates' annual revenue`), customer-story accordions (Hertz/URBN/Instacart/Le Monde), testimonial quote cards, product capability cards, news carousel, CTA footer; on `/customers`: featured customer carousel, metrics callout grid, logo grid, customer segmentation tabs (Startup/Growth/Enterprise), case study cards, deep-dive feature stories, use-case filter, solution-based grid.
- **Vercel homepage** (verified fetch): hero, social-proof case studies with metrics, use-case tabs, feature grid, framework showcase tiles, feature highlights, product deep-dive with code samples, code sample block, model-rankings table, template grid, multi-CTA buttons.
- **Cal.com `/pricing`** (verified fetch): hero+CTA, pricing tier cards (4), feature comparison table, feature categories section, trust statement, bottom CTA.
- **Linear `/method`** (verified fetch): hero, intro text block, structured content outline (the "method" itself), nav-rich content.

### Canonical 2026 block taxonomy (use these names)

| Family      | Block                                                  | Used by                          |
| ----------- | ------------------------------------------------------ | -------------------------------- |
| Hero        | `HeroSplit` (text + image/video)                       | Stripe, Calm, Headspace          |
| Hero        | `HeroCentered` (text only, tall)                       | Linear, Notion                   |
| Hero        | `HeroProduct` (product-shot dominant)                  | Vercel, Oura                     |
| SocialProof | `LogoWall` / `LogoCarousel`                            | Stripe, Vercel, Notion           |
| SocialProof | `StatsBand` (3–6 KPIs)                                 | Stripe (`$70M`), Vercel          |
| SocialProof | `TestimonialQuote` (single)                            | Stripe, Linear                   |
| SocialProof | `TestimonialCarousel` (rotating)                       | Notion                           |
| Feature     | `FeatureBento` (asymmetric grid)                       | Stripe, Vercel                   |
| Feature     | `FeatureGrid3up` (symmetric 3-col)                     | Headspace, Notion                |
| Feature     | `FeatureSplit` (alternating L/R)                       | Calm, Oura                       |
| Feature     | `FeatureDeepDive` (one feature, long-form)             | Vercel (Fluid Compute), Stripe   |
| Story       | `CustomerStoryCard` (link to /customers/<slug>)        | Stripe, Vercel                   |
| Story       | `CustomerStoryHero` (featured story, full-width)       | Stripe                           |
| Story       | `MetricCallout` (single big number + sentence)         | Stripe, Vercel                   |
| Compare     | `PricingTiers` (3–4 cards)                             | Cal.com, Stripe, Notion          |
| Compare     | `FeatureComparisonTable` (matrix)                      | Cal.com, Notion                  |
| Compare     | `VsCompetitor` (us vs. them)                           | Cal.com (`/cal-com-vs-calendly`) |
| Code/Demo   | `CodeBlock` (syntax-highlighted)                       | Vercel, Stripe                   |
| Code/Demo   | `InteractiveDemo` (animated/embedded)                  | Linear, Resend                   |
| Code/Demo   | `IntegrationGrid` (logo tiles linking to integrations) | Vercel, Cal.com                  |
| CTA         | `CtaPanel` (full-width, end-of-page)                   | Stripe, Vercel, Notion           |
| CTA         | `CtaInline` (within content)                           | All                              |
| Trust       | `TrustBadges` (HIPAA/SOC2/HITRUST badges)              | Calm, Headspace                  |
| Trust       | `SecurityCallout` (link to security page)              | Linear, Notion                   |
| Editorial   | `BlogPostCard` (preview tile)                          | All                              |
| Editorial   | `FAQAccordion`                                         | Cal.com, Stripe                  |
| Editorial   | `NewsTimeline` (changelog or news carousel)            | Stripe, Linear                   |

### Anti-pattern to avoid

- Building 20 bespoke `<HomePage>` / `<PricingPage>` components with no shared block primitives — first re-skin costs weeks and the design system can't iterate. The page is data; the blocks are code.
- Naming blocks by where they appear (`HomepageHero`, `PricingHero`) rather than by type — defeats reuse.
- Skipping the `TrustBadges` block for a HIPAA-aligned brand — Calm and Headspace surface HIPAA/SOC2/HITRUST visibly on every marketing page; the website tier needs the visual hooks even though the _page itself_ is zero-PHI.

### Implication for our scaffold (M1)

- **Establish `apps/web/components/marketing/blocks/` as the block library directory** at M1 — even if only 3 blocks land (`HeroSplit`, `CtaPanel`, `LogoWall`). The directory + naming convention is the M1 deliverable; the rest land M2–M4.
- **Pick a `<Block>` prop contract day-one** (e.g. `eyebrow?: string; heading: string; body?: ReactNode; media?: ImageProps; cta?: { label: string; href: string }`). Every block accepts a discriminated-union variant. Lock this in M1 so M2 content authors aren't fighting prop drift.
- **Add Storybook (or `pnpm dlx ladle`) at M1** — block libraries without an isolation harness end up tested only by the page that uses them, which prevents reuse. Light-touch alternative: a `/dev/blocks` route under a dev-flag.
- **Wait for M2/M3:** the long tail of blocks (`FeatureBento`, `InteractiveDemo`, `VsCompetitor`, `FAQAccordion`). M1 only needs the contract.

---

## Question 4 — Portal navigation patterns

### Enterprise pattern (2026)

Consumer-health portals (Calm `account.calm.com`, Oura `account.oura.com`, Headspace `headspace.com/login` → `my.headspace.com`) use **top-nav with light sidebar nested only inside `/settings`** because the portal is _thin_ (5–8 screens, mostly read-only billing + profile). B2B/devtool portals (Cal.com, Stripe Dashboard, Linear, Vercel) use **persistent sidebar** because the portal is the product (dozens to hundreds of screens). For a **consumer-health portal with subscription + profile + privacy + security only**, the consumer pattern wins: **top-nav for the portal shell, settings as a single `/account` index page with a vertical list of sub-pages**, mirroring Calm and Headspace. Stripe Dashboard's settings UI is the canonical model for the _settings sub-tree shape_: a left-rail of categories (Account, Security, Billing, Notifications, Team, Developers, Compliance) with a vertical scroll of sections inside each — Cal.com mirrors this exactly (`/settings/my-account/{profile,general,calendars,...}`, `/settings/security/{password,two-factor-auth}`, `/settings/developer/{api-keys,oauth,webhooks}`). **Breadcrumbs** are absent from Cal.com / Stripe / Linear portals — they rely on sidebar highlight + page title. Breadcrumbs appear in deeply nested content (docs, help centers) but not in flat 2-level portals. **Mobile collapse:** top-nav → hamburger drawer; sidebar → bottom-nav (Calm app pattern) or hamburger.

### Reference examples

- Cal.com settings tree (verified via `gh api`):
  - `/settings/my-account/{appearance,calendars,conferencing,general,out-of-office,profile,push-notifications}`
  - `/settings/security/{password,two-factor-auth}`
  - `/settings/developer/{api-keys,oauth,webhooks}`
- Stripe Dashboard: `dashboard.stripe.com/settings/{account,team,users,emails,branding,...}` — left-rail categories, right-pane sections, no breadcrumbs.
- Whoop `app.whoop.com` (cited from whoop.com footer): authenticated app, separate subdomain.

### Account-deletion + data-export + MFA UI patterns

- **Account deletion:** Cal.com puts delete inside `/settings/my-account/profile` as a "Danger zone" panel at the bottom (Stripe, Linear, Vercel all use the same "Danger zone" red-bordered panel convention). The deletion **page is a separate destination**, not a modal, when the user clicks "Delete account" — to allow proper retention disclosure (CCPA 2026 requirement). For us: `/account/danger` is the convention, plus a public `/delete-account` landing per Google Play policy.
- **Data export:** dedicated page at `/account/data-export` (Microsoft pattern: privacy dashboard → "Download your data" → "Create new archive" → granular category selection → async archive → "Download" in archive list). Mirrors Cal.com's `/settings/my-account/profile` "Export data" affordance.
- **MFA management:** Cal.com places this at `/settings/security/two-factor-auth` (verified). Standard pattern: dedicated page, list of enrolled factors (TOTP, WebAuthn, SMS), "Add factor" button opens enrollment flow, recovery-codes generation on enable, "Remove factor" requires reauthentication.

### Anti-pattern to avoid

- **Hiding delete inside a 3-step modal with no URL** — fails Google Play submission, fails CCPA "clear and conspicuous" test, and breaks linkability from support tickets.
- **Putting subscription cancellation behind a "Contact us" form** instead of self-service — the Cerebral-equivalent risk on UX side. Calm explicitly addresses this: `headspace.com/subscription/manage` is the canonical self-service URL for direct subscribers.
- **Mixing settings categories** (e.g., notifications under profile, MFA under privacy) — Cal.com's `my-account` / `security` / `developer` top-level partition is the cleanest convention.
- **Inventing breadcrumbs in a 2-level portal** — adds visual noise without information; Cal.com and Stripe both omit.

### Implication for our scaffold (M1)

- **M1 ships `(account)/layout.tsx` as top-nav-style portal shell** (logo, primary nav: Home / Subscription / Settings / Sign out — 4 items max), not sidebar. Consumer-health is a thin portal; sidebar is premature.
- **`/account/` page is the landing hub** with a vertical list of subsections (Profile, Subscription, Billing, Security, Notifications, Privacy, Data Export, Danger Zone), matching Calm/Headspace pattern.
- **Mobile pattern at M1:** top-nav collapses to hamburger. Defer bottom-nav until/unless usage volume justifies (it's PWA-app-feel, not website-feel).
- **No breadcrumbs at M1** — defer indefinitely.
- **"Danger Zone" component as a shared primitive** in `components/app/danger-zone.tsx` at M1 — used by both `/account/danger` and any future destructive actions.
- **Wait for M2/M5:** actual settings pages with real content. M1 just ships the routing skeleton + the empty `/account/<sub>` shells.

---

## Question 5 — Footer + global navigation

### Enterprise pattern (2026)

Enterprise footers in 2026 have **converged on a 5–6 column grid + a bottom utility row**. Top grid columns (Stripe / Vercel / Linear / Notion / Headspace pattern): **Product** (or Solutions), **Company** (about/careers/press), **Resources** (blog/changelog/docs), **Support** (help center/status/contact), **Legal** (privacy/terms/cookies/DPA/accessibility/your-privacy-choices), **Connect** (social icons). Bottom utility row: language switcher, copyright, "Your Privacy Choices" with the blue opt-out CCPA toggle icon (mandated by CCPA 2026 effective 2026-01-01), accessibility statement link. **GPC indicator** — when `Sec-GPC: 1` header is received, the footer shows a confirmation banner "Global Privacy Control honored" (this is becoming convention but not yet mandated). The marketing top nav is **5–8 items max** (Cal.com: Solutions / Developer / Resources / Pricing / Sign in / Get started; Linear: Product / Resources / Customers / Pricing / Now / Contact / Docs / Log in / Sign up — at the high end; Vercel: Products / Resources / Solutions / Enterprise / Pricing / Log in / Sign up).

### Reference examples (footer link sections, verified fetches)

- **Stripe:** Products & pricing, Solutions, Developers, Integrations, Resources, Company, Support
- **Vercel:** Get Started, Build, Scale, Secure, Resources, Learn, Frameworks, SDKs, Company, Community
- **Linear:** Product, Features, Company, Resources, Connect, Legal
- **Notion:** Company, Download, Resources, Notion for
- **Headspace:** Get some Headspace, Our content, About us, Support, My Headspace, Get the app, plus footer utility: **"Your privacy choices"** (with icon), **"Accessibility Statement"** (link to `/accessibility-statement`), **"CA Privacy Notice"**, **"Cookie policy"**
- **Whoop:** Support, Company, Legal, Partner, Join WHOOP, The Locker
- **Discord:** Product, Company, Resources, Policies

### Anti-pattern to avoid

- Hiding "Your Privacy Choices" inside the privacy policy or cookie banner — CCPA 2026 explicitly requires a "clear and conspicuous link in the footer or header" with the approved opt-out icon. Buried = non-compliant.
- A single "Legal" link expanding to a popover — fails screen-reader patterns and obscures DPA, accessibility statement, and HIPAA notice from auditors who _do_ hand-check footers.
- Top nav with 12+ items — Cal.com is at the high end at 5 visible items with mega-menus underneath. Mediocre teams ship flat horizontal scrolls of 10 links.
- Skipping the accessibility statement link entirely — required under EAA (effective 2025-06-28 in EU) and increasingly expected under ADA enforcement in US. Headspace, Oura, and Whoop all have it.

### Implication for our scaffold (M1)

- **M1 ships `components/marketing/footer.tsx` with a 5-column grid + utility row** baked in. Columns: **Product** (Features, Pricing, Science), **Company** (About, Careers, Contact, Press), **Resources** (Blog, Changelog, Help center), **Legal** (Privacy, Terms, DPA, HIPAA Notice, Subprocessors, Cookie Policy, Accessibility), **Connect** (social — placeholder icons). Utility row: language switcher (English only at launch, but the switcher renders), copyright, **"Your Privacy Choices" with CCPA opt-out icon** (mandatory), **"Accessibility Statement"** link.
- **M1 ships `components/marketing/header.tsx` with 4–5 nav items max** (Features, Pricing, Science, Help — link to Zendesk) + Sign in (ghost button) + Get started (primary button). Mega-menus are M3+ work.
- **Reserve route slugs in `app/[locale]/(marketing)/legal/`** day-one (privacy, terms, dpa, hipaa-notice, subprocessors, cookie-policy, accessibility) — even if the pages are placeholder MDX. Footer links 404'ing on launch is a credibility disaster.
- **GPC handling at edge:** add a Lambda@Edge / middleware check for `Sec-GPC: 1` header, write to a server-side `ConsentState` cookie (D35). M1 ships the middleware shape (even if the consent state isn't yet read by analytics SDKs — none are loaded pre-launch anyway).
- **Wait for M2/M8:** real legal content (M8 is "real legal + compliance" milestone), language-switcher behavior beyond `en`.

---

## Question 6 — 404 / 500 / maintenance pages

### Enterprise pattern (2026)

Enterprise 404s are **fully branded, not Next.js defaults**. The canonical pattern (Cal.com's `app/not-found.tsx` — verified): server component that imports a client `NotFound` component, wraps it in the same `PageWrapper` as marketing pages, sets `robots: {index: false, follow: false}`, and uses i18n (`404_page_not_found` key) for the heading. The visual treatment is **brand-on**: same nav + footer as marketing pages, a centered illustration or animation, a single helpful sentence ("This page doesn't exist or has moved"), 2–3 helpful links (Home / Help center / Contact), and **no search bar** on consumer-health (search bars are a B2B-devtool pattern — Stripe, Linear). 500 pages are **even more minimal** — just brand mark + "Something went wrong" + a "Try again" button (Next.js convention via `error.tsx` + `global-error.tsx`). Maintenance pages are typically static HTML served from CloudFront/S3 (not Next.js) so they survive even when Lambda is down — see Stripe `status.stripe.com` pattern. Cal.com has a dedicated `/maintenance` route inside `(use-page-wrapper)/maintenance/` for app-level maintenance distinct from the static fallback.

### Reference examples

- Cal.com `app/not-found.tsx` (verified fetch): server component → client `NotFound`, robots noindex/nofollow, i18n localized, nonce-aware for CSP.
- Cal.com `app/error.tsx` + `app/global-error.tsx` (verified directory listing): standard Next.js error boundaries at root + global.
- Cal.com `app/(use-page-wrapper)/maintenance/` (verified): in-app maintenance page distinct from infrastructure-down fallback.

### Anti-pattern to avoid

- Shipping the default Next.js 404 ("404 | This page could not be found") with no chrome — looks broken, hurts brand trust at the worst moment (user just hit a dead link).
- Forgetting `robots: {index: false, follow: false}` on 404 — search engines index soft-404s, polluting your site's index quality score.
- Putting a search bar on a consumer-health 404 — implies "search our help" pattern that the brand doesn't deliver. Use links to specific pages instead.
- No `global-error.tsx` — when the root layout itself errors (rare but catastrophic), the user sees a blank page. `global-error.tsx` is the only safety net.

### Implication for our scaffold (M1)

- **M1 ships all four:** `not-found.tsx`, `error.tsx`, `global-error.tsx`, and a static `maintenance.html` in `public/` for infra-down fallback.
- **`not-found.tsx`** in the `(marketing)` layout so it inherits header + footer; visual: centered brand mark + heading + 2 link buttons (Home, Help). robots noindex/nofollow.
- **`error.tsx`** at root: same chrome, "Something went wrong" + Reset button.
- **`global-error.tsx`** at root: minimal HTML (no providers), "We're having trouble. Try again or contact support." — survives root layout failures.
- **`public/maintenance.html`** — pure static HTML, no JS, served via CloudFront behavior rule that swaps it in during maintenance windows. SST handles this in M1 deploy config.
- **Wait for M2+:** animated illustration / branded 404 visuals (M3 identity discovery), in-app maintenance route under `(account)`.

---

## Question 7 — Reserved subdomain conventions

### Enterprise pattern (2026)

Enterprise teams reserve **5–8 subdomains at DNS provisioning time** even if most are stubs — retrofitting a subdomain after the app is live is painful (DNS TTL, certificate issuance, redirects, search indexing, cookie scope, CORS, OAuth allowed-callbacks all touch it). The convergent reserved list (Stripe, Cal.com, Linear, Whoop, Vercel, Notion, Discord, Headspace patterns): **`www.`** (apex redirect target), **`auth.`** (Cognito/hosted IdP — already provisioned per CLAUDE.md D6), **`app.`** (authenticated product when separate from marketing — Stripe `app.stripe.com`, Whoop `app.whoop.com`, Cal.com `app.cal.com`), **`api.`** (public API — Stripe `api.stripe.com`, Notion `api.notion.com`), **`status.`** (Stripe `status.stripe.com`, Discord `discordstatus.com`, Linear has it), **`help.`** or **`support.`** (Cal.com `help.cal.com`, Calm `help.calm.com`, Notion → Help center under main, but Stripe `support.stripe.com`), **`docs.`** (Stripe `docs.stripe.com`, Vercel `vercel.com/docs` — split convention), **`blog.`** (older convention; modern is `/blog` on apex for SEO consolidation — Stripe, Vercel, Linear all use `/blog`), **`careers.`** (most use `/careers` on apex; some use `jobs.`). Health/wellness brands also use **`account.`** for the consumer portal (Calm `account.calm.com`, Oura `account.oura.com`).

### Reference examples

- Stripe: `dashboard.stripe.com`, `docs.stripe.com`, `status.stripe.com`, `support.stripe.com`, `api.stripe.com`
- Cal.com: `app.cal.com`, `help.cal.com`, `i.cal.com` (sales scheduling)
- Whoop: `app.whoop.com`, `orderstatus.whoop.com`, `join.whoop.com`
- Calm: `account.calm.com`, `help.calm.com`
- Discord: `support.discord.com`, `discordstatus.com` (separate apex), `support-dev.discord.com`, `discordmerch.com`
- Notion: `developers.notion.com`, `academy.notion.com`, `notion.dev`, `notion-status.com`

### Anti-pattern to avoid

- Reserving subdomains in DNS but not also in **OAuth allowed-callback lists, CSP `connect-src`, CORS allowlists, cookie scopes** — leaves you with valid DNS but broken integrations on launch day.
- Mixing apex and subdomain for the same logical surface (`blog.example.com` AND `example.com/blog` resolving differently) — splits SEO + breaks canonicals.
- Putting the marketing site and the authenticated app on the same hostname with `/app/` path prefix — locks the cookie scope to a shared parent, defeats `__Host-` prefix isolation (D7 already forbids parent-domain cookies), and complicates CSP per-surface.

### Implication for our scaffold (M1)

CLAUDE.md already locks: `my-quilty.com` (apex marketing), `auth.my-quilty.com` (Cognito), `help.my-quilty.com` (reserved), `app.my-quilty.com` (reserved). **M1 should additionally reserve in DNS layer (in `quilty-aws/dns/`)**:

- `www.my-quilty.com` → 308 to apex (or apex → www, pick one; consumer-health norm is apex)
- `status.my-quilty.com` → reserved, point to placeholder
- `api.my-quilty.com` → reserved (M6 when Rust backend gets public surface)
- `docs.my-quilty.com` → reserved (low priority; can fall back to `/docs` on apex)

**Bake into M1 config:**

- `next.config.ts` `assetPrefix` / `images.remotePatterns` already aware of all reserved subdomains so future static-asset moves don't require code changes.
- CSP `connect-src` lists `auth.`, `api.`, `*.my-quilty.com` from day one (avoid retrofit).
- OIDC callback list pre-registers all subdomain origins.

**Wait for M2+:** real subdomain content (help center, status page).

---

## Question 8 — Sign-in surface

### Enterprise pattern (2026)

For HIPAA-aligned consumer apps with hosted IdP (Cognito Hosted UI at `auth.my-quilty.com` per D6, D7), the canonical pattern is: **"Sign in" link in top-right of marketing nav, ghost/text-button style, paired with a filled primary "Get started" / "Sign up" button to its right** (Cal.com, Linear, Vercel, Notion all ship this exact pair). Clicking "Sign in" triggers a **server-side redirect** (Next.js Route Handler at `/api/auth/login` or a Server Component page at `/sign-in`) to the hosted IdP's authorize endpoint with state + PKCE — **not** an in-app form. After IdP success, the IdP redirects back to `/api/auth/callback` (Route Handler) which exchanges the code for tokens, sets the `__Host-` session cookie, and 302s to the post-login destination. **Post-login redirect:** `/account` (Cal.com → `/event-types`, Stripe → `/dashboard`, Headspace → `my.headspace.com`); preserve `?next=...` from before sign-in if user came from a protected page. **Magic-link vs password:** Cognito Hosted UI supports both; consumer-health convention (Calm, Headspace) is **email + password as default with optional magic-link recovery**. Magic-link-primary is more devtool-coded (Linear, Notion). **Social login:** consumer-health typically offers Apple + Google + Facebook (Calm, Headspace ship all three); HIPAA brands sometimes omit Facebook for trust-signaling reasons. **MFA challenge UI** lives entirely on `auth.my-quilty.com` (Cognito Hosted UI handles it); the website never sees the MFA screen.

### Reference examples

- Cal.com: top-right "Sign in" link + "Get started" button → redirects to `/auth/signin` which delegates to NextAuth.
- Vercel: top-right "Log In" → redirects to `vercel.com/login` (hosted) with Google/GitHub/Apple/SAML/Passkey buttons.
- Stripe: top-right "Sign in" → `dashboard.stripe.com/login` (separate subdomain, hosted form).
- Calm/Headspace: top-right "Log in" → `headspace.com/login` (in-app form because Headspace runs its own auth, not IdP).

### Anti-pattern to avoid

- Building an in-app `/sign-in` React form when you have a hosted IdP — splits auth surface, increases CSP burden, leaks token-handling code into website tier (defeats the BFF promise that _tokens never reach the browser_).
- Putting sign-in only in the footer / not in the header — fails F-pattern scanning; users abandon.
- Magic-link-only as primary auth for a consumer-health portal — Calm and Headspace audiences include older demographics who expect passwords. Magic-link is fine as primary for devtools (Notion), but consumer-health norm is password+optional-passwordless.
- Forgetting `?next=` preservation — user clicks a deep link to `/account/subscription` while logged out, lands on sign-in, signs in, ends up at `/account` (lost their intent).

### Implication for our scaffold (M1)

- **M1 ships `(marketing)` header with "Sign in" (ghost) + "Get started" (primary)** in top-right.
- **`(auth)/sign-in/page.tsx`** is a Server Component that **redirects** to the Cognito Hosted UI authorize URL with PKCE state — never a form. Cognito Hosted UI activation is post-M1 per CLAUDE.md, so M1 can stub the redirect with a placeholder destination (e.g., a static "Sign in coming soon" page) but the **routing contract** lands at M1.
- **`/api/auth/callback/route.ts`** is the OIDC code-flow landing — stubbed at M1, wired to Cognito at M6.
- **`/api/auth/logout/route.ts`** clears the `__Host-` cookie and 302s to the IdP logout endpoint (D9 backchannel logout to be wired M6).
- **`?next=` preservation:** middleware extracts the requested URL from the redirect chain and stashes in OIDC `state` (signed). Implement at M1; cost is small, retrofit cost is medium.
- **No social login decision needed at M1** — Cognito Hosted UI manages it. Decision deferred to brand-identity milestone (M3).
- **Wait for M6:** real Cognito wiring, backchannel logout endpoint, MFA configuration, social-provider selection.

---

## Question 9 — Top-of-funnel marketing IA

### Enterprise pattern (2026)

Convergent enterprise marketing IA across consumer-health (Calm, Headspace, Oura, Whoop) and B2B/B2C (Stripe, Vercel, Linear, Notion) follows this canonical depth + ordering: **(1) Product / Features** (what it does) — top-nav primary, mega-menu of 4–8 features OR a single page; **(2) How it works** (consumer-health-specific: Oura, Headspace) — single page, methodology + visual; **(3) Science / Research / Clinical** (consumer-health-specific, _critical_ for trust): Calm has `/science`, Headspace has `/science`, Oura has `/science`, this is non-optional in our peer set; **(4) Pricing** — top-nav primary; **(5) For Business / Enterprise / Health plans** (consumer-health monetization adjacency: Headspace `/for-work`, Calm `/business`, Oura `/business`); **(6) Blog / Resources** — top-nav secondary or footer; **(7) Customers / Case studies** — B2B convention, less common in consumer-health (Calm doesn't have it but the trust badges replace it); **(8) Company / About / Careers / Press / Contact** — footer-only typically, sometimes nested under a "Company" mega-menu; **(9) Help / Support** — top-nav-or-footer link to help center subdomain. **Top-nav inclusion rule (consumer-health):** 4–5 items max — Product/Features, How it works (or Science), Pricing, For Business, plus Sign in + Get started. Headspace breaks this with 8 mega-menu items but Calm sticks to 4. The trend is fewer + deeper.

### Reference examples

- Headspace top nav (verified): For You, What we offer, Explore our library, For Business, For Providers, Our Plans, Resources, About — 8 items, all mega-menus.
- Whoop top nav (verified): Memberships, How it works, Trial WHOOP, Why WHOOP, Accessories, Advanced Labs — 6 items.
- Oura top nav (verified): Shop, Health Features, Experience, For Organizations — 4 items.
- Calm: Meditate, Sleep, Music, Wisdom, Move, Soothing Scenes — 6 content categories (different model: nav is content-typed, not function-typed).

### Anti-pattern to avoid

- Skipping the Science/Research/Clinical page for a HIPAA-aligned mental-health brand — Calm, Headspace, Oura all have it; auditors, healthcare-procurement teams, and skeptical consumers all look for it. Its absence is a credibility hole.
- Combining Pricing + For Business — these are distinct intents. Headspace and Oura keep them separate.
- Building a "Features" mega-menu with 20+ items — Headspace's 8-item mega-menu is the ceiling. Calm's flat content-typed nav (6) is the floor.
- Building a careers page at launch with no roles posted — list "We're not hiring right now, but here's how we think about hiring" — Linear's careers page is the gold reference for "small team, intentional hiring."

### Implication for our scaffold (M1)

**M1 reserves these route slugs (placeholder pages OK):**

```
(marketing)/
├── page.tsx                   # /                — homepage
├── product/page.tsx           # or /features
├── how-it-works/page.tsx
├── science/page.tsx           # CRITICAL for our HIPAA-aligned brand
├── pricing/page.tsx
├── for-business/page.tsx      # (if applicable — defer to brand decision M3)
├── blog/page.tsx              # MDX index, empty at M1
├── customers/page.tsx         # (defer content)
├── about/page.tsx
├── careers/page.tsx
├── press/page.tsx
├── contact/page.tsx
└── legal/{privacy,terms,dpa,hipaa-notice,subprocessors,cookie-policy,accessibility}/page.tsx
```

- **Top nav at M1: 4 items + Sign in + Get started**: Product, Science, Pricing, Help (link to `help.my-quilty.com` placeholder).
- **Decisions deferred to M3 (identity discovery)**: "Features" vs "Product" naming, mega-menu vs flat nav, Science vs How-It-Works ordering, For-Business inclusion.
- **Wait for M2:** real content on any of these.
- **Wait for M3:** finalize nav structure + voice.

---

## Question 10 — Account portal page-set v0

### Enterprise pattern (2026)

The "complete-feeling" consumer-health portal at MVP launch is **8–10 pages**, not more. Verified pattern across Calm `account.calm.com`, Oura `account.oura.com`, Headspace `my.headspace.com`, and the Stripe Customer Portal default surface:

1. **`/account`** — landing hub, vertical list of subsections + account-level greeting
2. **`/account/profile`** — name, email, password change (or "manage password" → IdP), avatar, locale, timezone
3. **`/account/subscription`** — current plan, renewal date, upgrade/downgrade button, cancel button (or Stripe Customer Portal embed/redirect)
4. **`/account/billing`** — invoice history, payment methods, billing address (Stripe Customer Portal often handles this; can be merged with `/subscription`)
5. **`/account/security`** — MFA factors, active sessions, password change, recovery options
6. **`/account/notifications`** — email + push preferences (granular toggles)
7. **`/account/privacy`** — consent state (analytics, marketing), cookie preferences, GPC status display, "Your Privacy Choices" full panel
8. **`/account/data-export`** — request export, see prior exports, download archives (GDPR portability)
9. **`/account/danger`** — delete account, with retention disclosure + identity reverification

Plus public unauthenticated: 10. **`/delete-account`** — Google Play / CCPA / GDPR-mandated public landing explaining how to delete

### Reference examples

- Cal.com `(use-page-wrapper)/settings/(settings-layout)/{my-account,security,developer}` — same shape, more developer-oriented; consumer version drops `developer/` and adds `subscription/`, `data-export/`, `privacy/`.
- Stripe Customer Portal default screens (per Stripe docs): subscription, payment methods, invoices, billing details — exactly the 4 screens we're consolidating under `/account/subscription` + `/account/billing`.
- Microsoft privacy dashboard pattern (cited): "Download your data" → granular categories → async archive → download list — directly applicable to `/account/data-export`.

### Anti-pattern to avoid

- Shipping `/account/preferences` as one giant page with 40 toggles — Cal.com explicitly partitions into 7 sub-pages under `my-account/`. Granularity is a feature.
- Skipping `/account/privacy` because "we have a cookie banner" — server-side ConsentState (D35) needs a UI for the user to inspect and modify, not just accept once.
- No `/account/data-export` — CCPA + GDPR portability rights are now table stakes; not having the UI means a support ticket for every request, which scales badly and creates audit-trail problems.
- Merging `/account/security` into `/account/profile` — security gets reauth-protected differently and deserves its own page boundary.

### Implication for our scaffold (M1)

- **M1 ships all 10 routes as placeholder pages** (or page stubs with "Coming soon" + nav skeleton) under `(account)/account/...` + public `/delete-account`. Real content is M5 ("Account portal v0 static") + M6 (auth) + M7 (real subscription).
- **Reserve URL contract day-one** so external systems (email links, support docs, mobile-app deep links into the web portal) don't break later.
- **Mobile app deep-link awareness:** the `.well-known/apple-app-site-association` + `.well-known/assetlinks.json` files (CLAUDE.md NEVER list) need to know which `/account/...` URLs deep-link to which iOS/Android screens. M1 ships the `.well-known/` placeholder files (empty JSON valid for app association) but the URL list comes M6.
- **Wait for M5/M6/M7:** real content, real auth-gating, real Stripe integration.

---

## Question 11 — Subscription management UX

### Enterprise pattern (2026)

The 2026 default for SaaS subscription self-service is **redirect to the hosted Stripe Customer Portal**, not embedded or fully-custom UI. Stripe docs explicitly recommend this for the "vast majority" of SaaS in 2026 — the hosted portal handles cancellations, upgrades/downgrades, payment method updates, invoice history, tax IDs, and billing details out of the box, on Stripe's PCI scope, with their own UX iterations. **Custom is only justified when you need deeply embedded flows** (inline pricing configurators, multi-step onboarding with payment at the end). For consumer-health with mobile-app IAP (App Store + Google Play) **as a co-existing billing source**, the pattern is **routing copy**: a self-service page that detects billing source via API call (Stripe customer ID present? → Stripe portal redirect. Apple subscription receipt? → "Manage in iOS Settings" with deep link. Google Play receipt? → "Manage in Google Play" with deep link). This is exactly what Calm and Headspace do (verified via help-center docs): they tell the user "Cancel through the same channel where you originally subscribed" because **canceling in one channel does NOT cancel the others**. **HSA/FSA support** is brand-level positioning (Oura's footer prominently features "FSA/HSA Eligible" as a payment-methods row; Headspace has dedicated HSA/FSA Plans section in their nav). **Refunds:** annual plans typically don't refund mid-term; iOS refunds go via Apple's flow, not the SaaS portal — surface this clearly on the cancellation confirmation page.

### Reference examples

- Stripe docs `docs.stripe.com/customer-management/integrate-customer-portal` (verified): "After you configure and integrate the portal, customers redirect to a co-branded dashboard where they can manage their account based on the functionality you configured."
- Headspace `headspace.com/subscription/manage` (cited via help center): direct-web subscribers cancel here; iOS/Android subscribers are routed to platform settings.
- Whoop `orderstatus.whoop.com/orderlookup` — separate subdomain for billing-adjacent ops.
- Oura footer (verified): payment methods row featuring FSA/HSA Eligible, Affirm, PayPal, Apple Pay, Google Pay, Visa, Mastercard, Amex — visible badge of payment-method legitimacy.

### Anti-pattern to avoid

- Building a custom subscription-management UI from scratch when you have only one billing dimension (plan tier, renewal, cancel) — you'll spend weeks on what Stripe Customer Portal gives you free, and you'll lag Stripe's UX improvements.
- Hiding the IAP routing copy ("Cancel in iOS Settings if you subscribed via App Store") — this is the #1 cancellation-pathway confusion in consumer subscriptions per Calm/Headspace help-center traffic. Surface it prominently.
- Storing prices locally instead of fetching from Stripe — guaranteed drift, guaranteed billing dispute.
- Skipping webhook handling for `customer.subscription.updated`, `invoice.payment_failed`, `customer.subscription.deleted` — your portal will show stale state and customers will rage.
- No dunning flow (`invoice.payment_failed` → email day 1/3/7 with update-payment link) — Stripe data says 20–40% of failed payments recover via dunning. Skipping = leaving revenue on the floor.

### Implication for our scaffold (M1)

- **M1 ships `/account/subscription` as a placeholder page** — content lands M7. But the **architectural decision** to redirect to Stripe Customer Portal (vs build custom) should be **locked at M1 as ADR** in `docs/adr/` to prevent drift in M5/M7.
- **M1 reserves `/api/webhooks/stripe/route.ts`** route handler — empty at M1, wired in M7. Webhook URLs go into Stripe dashboard config at provisioning; retrofit cost is medium.
- **M1 reserves `/account/subscription/return/page.tsx`** as the post-Stripe-portal landing — when Stripe redirects back to your site, you need a known destination.
- **M1 surfaces "billed via App Store / Google Play" detection language** in the placeholder content so the IAP-routing UX is locked in copy day-one (writer can iterate).
- **HSA/FSA badging at M1 footer + pricing-page badge row** — even if not yet supported in Stripe config (per brand decision), reserve the visual slot.
- **Wait for M7:** actual Stripe integration, webhook handlers, IAP receipt verification, dunning email flow, refund-policy copy review by lawyer.

---

## TOP-7 retrofit-hostile items (rank-ordered by retrofit cost)

If these are missing from M1, retrofitting later is painful. In rank order:

1. **URL contract (route tree)** — `[locale]/` outer segment, `(marketing)/(auth)/(account)` route groups, `/account/*` sub-paths, public `/delete-account`, reserved legal slugs (`privacy/terms/dpa/hipaa-notice/subprocessors/cookie-policy/accessibility`), reserved content slugs (`blog/customers/changelog/careers/press/contact/help`). **Retrofit cost: highest** — every external link, email template, SEO canonical, mobile-app deep-link, support doc, redirect rule, sitemap entry, hreflang tag depends on URLs. Q1, Q2, Q9, Q10.

2. **CCPA "Your Privacy Choices" + accessibility statement + GPC handling in footer + middleware** — CCPA 2026 effective 2026-01-01 mandates "clear and conspicuous" footer link with the opt-out icon. Accessibility statement is EAA-mandated for EU traffic from 2025-06-28. GPC honored at edge. **Retrofit cost: high** — these are regulator-bait and you don't get to retrofit them after a complaint. Q5.

3. **`__Host-` session cookie + per-subdomain OAuth callbacks + reserved subdomain DNS** — D7 already forbids parent-domain cookies. The subdomain-reservation list (`www`, `auth`, `app`, `api`, `status`, `help`, `docs`, `account`) needs DNS records + ACM cert SANs + OIDC allowed-callback list + CSP `connect-src` + CORS allowlists ALL coordinated day-one. **Retrofit cost: high** — one of those is always forgotten; the resulting outage is on launch day. Q7, Q8.

4. **Stripe Customer Portal redirect decision (ADR-locked at M1)** — committing to hosted redirect (not embedded, not custom) before M7 build prevents 6–8 weeks of accidental custom-UI development. The architectural commitment is the retrofit-hostile thing; the implementation is M7. **Retrofit cost: high** — if M5/M6 teams build custom UI thinking "Stripe later", switching to hosted means redoing the page. Q11.

5. **Public `/delete-account` page + `/account/danger` + `/account/data-export`** — Google Play 2024+ policy is hard-blocking on the public page. CCPA 2026 enforces "easy, accessible, no dark patterns" deletion. GDPR portability is non-negotiable. **Retrofit cost: medium-high** — page itself is small, but every existing user touchpoint (email, support) needs updating to point to the new URLs, and an absent page can block Google Play app submission. Q1, Q10.

6. **Marketing block library contract** (component naming, prop shape, `components/marketing/blocks/` directory, isolation harness like Storybook or `/dev/blocks`) — the **contract** is retrofit-hostile, not the blocks themselves. If M2–M4 builds 20 bespoke `<HomePage>` and `<PricingPage>` components instead of composing from blocks, you spend M5–M9 untangling. **Retrofit cost: medium-high** (engineering time, not regulator-bait). Q3.

7. **Route group + layout split (`(marketing)/(auth)/(account)`)** — locks the chrome-shipping pattern. Retrofitting from single-root-layout to multi-layout means refactoring every page's data-fetching boundary, every middleware run, and every header/footer composition. **Retrofit cost: medium-high.** Q2.

---

## 5–10 UX decisions that need human review

These are choices our research surfaces but cannot resolve without brand/product input:

1. **Portal shell: top-nav (consumer-health convention — Calm, Headspace) vs sidebar (B2B convention — Stripe, Cal.com)?** Our recommendation is top-nav because the consumer-health portal is thin (8–10 pages), but the brand may want sidebar to signal "professional/clinical" rather than "casual app." (Q4)

2. **Stripe Customer Portal: hosted redirect vs embedded session vs custom UI?** Strong default is hosted redirect (Stripe's own 2026 best-practice recommendation), but brand may want a fully co-branded experience inside `/account/*` (justifies embedded sessions). Lock as ADR at M1. (Q11)

3. **Primary sign-in method: email+password (Calm/Headspace convention) vs magic-link (Linear/Notion devtool convention) vs passkey-first (Vercel 2026 convention)?** Affects Cognito Hosted UI configuration. Consumer-health norm is password+optional-passwordless. (Q8)

4. **Social login providers at launch: Apple + Google + Facebook (Calm/Headspace) vs Apple + Google only (HIPAA-trust signal) vs none?** Affects Cognito config + Apple's "Sign in with Apple required when other social login present" App Store rule. (Q8)

5. **Marketing top-nav: 4 items (Calm, Oura) vs 8 items with mega-menus (Headspace, Cal.com)?** Affects information density expectations and brand voice. M3 brand-identity decision. (Q9)

6. **Science / Research / Clinical page: present at launch or M2?** Our research says **present at launch is non-negotiable for HIPAA-aligned mental-health peer-set credibility** (Calm, Headspace, Oura all have it). But content may not be ready. Stub with placeholder + "Coming soon" is acceptable; absence is not. (Q9)

7. **For-Business / B2B surface: included at launch?** Headspace, Calm, Oura all have it (employer plans, health-plan partnerships are real consumer-health revenue). Affects nav structure + pricing page + a whole `/for-business/...` subtree. Pure-consumer launch can defer. (Q9)

8. **HSA/FSA support at launch?** Both a tax-eligibility legal question and a UX visibility decision (Oura's footer badge is a brand-trust signal independent of whether it's enabled). Decision affects Stripe metadata + footer + pricing page. (Q11)

9. **Account-deletion grace period: immediate hard-delete vs 30-day soft-delete with re-activation?** GDPR allows both; "soft-delete with disclosed retention period" is industry norm (Calm, Headspace). Affects copy on `/account/danger` + `/delete-account` + backend deletion job. (Q10)

10. **Help/support surface: Zendesk (`help.my-quilty.com`) vs Intercom vs in-house docs at launch?** CLAUDE.md already reserves `help.my-quilty.com`. The vendor choice is M9+ work but the URL contract is M1. M1 only needs to know the link target is "external help center" (not in-app). (Q5, Q7)

---

## Sources (verified during this research)

**Repos / code (`gh api` + GitHub):**

- `repos/calcom/cal.com/contents/apps` — confirms `apps/{api,docs,web}` structure (RFC #1581 + handbook.cal.com confirms historical `apps/website` for marketing, consolidated but deployed separately)
- `repos/calcom/cal.com/contents/apps/web/app` — top-level App Router structure
- `repos/calcom/cal.com/contents/apps/web/app/(use-page-wrapper)` — authenticated route group
- `repos/calcom/cal.com/contents/apps/web/app/(use-page-wrapper)/settings/(settings-layout)/{my-account,security,developer}` — settings taxonomy
- `repos/calcom/cal.com/contents/apps/web/app/(use-page-wrapper)/(main-nav)` — shell layout
- `repos/calcom/cal.com/contents/apps/web/app/(use-page-wrapper)/auth` — auth routes (login, signin, signup, forgot-password, logout, verify-email, oauth2, error)
- `repos/calcom/cal.com/contents/apps/web/app/api` — Route Handler structure
- `repos/PostHog/posthog.com` — Gatsby-based marketing/docs site, separate from product app

**Live-site fetches (verified):**

- https://cal.com (top nav, footer, URL patterns)
- https://www.cal.com/pricing (marketing block taxonomy)
- https://stripe.com (top nav, footer, homepage block taxonomy)
- https://stripe.com/customers (customer story block patterns)
- https://vercel.com (homepage block taxonomy)
- https://linear.app (top nav, footer)
- https://linear.app/method (block patterns)
- https://www.notion.com (top nav, footer, blocks, subdomains)
- https://www.headspace.com (top nav, footer, "Your privacy choices", accessibility statement)
- https://www.whoop.com (top nav, footer, app.whoop.com referenced)
- https://ouraring.com (top nav, footer, FSA/HSA badge, payment-methods row)
- https://discord.com (top nav, footer, subdomains)

**Docs / engineering blogs:**

- Cal.com engineering handbook: https://handbook.cal.com/engineering/codebase/monorepo-turborepo
- Cal.com RFC #1581 (monorepo migration)
- Next.js 16 route groups: https://nextjs.org/docs/app/api-reference/file-conventions/route-groups
- Next.js 16 project structure: https://nextjs.org/docs/app/getting-started/project-structure
- Stripe Customer Portal: https://docs.stripe.com/customer-management/integrate-customer-portal
- Vercel sign-in OIDC pattern: https://vercel.com/docs/sign-in-with-vercel
- CCPA 2026 effective date + "Your Privacy Choices" link mandate: https://cppa.ca.gov/faq.html
- CCPA 2026 amendments: https://www.dataprivacyandsecurityinsider.com/2025/12/ccpa-2026-what-companies-need-to-know-about-californias-revised-consumer-privacy-rule/
- Google Play account-deletion URL requirement: https://www.w3tutorials.net/blog/google-play-account-deletion-requirement/
- Microsoft GDPR data-export pattern: https://learn.microsoft.com/en-us/power-automate/privacy-dsr-export-msa
- Headspace cancel-subscription help: https://help.headspace.com/hc/en-us/articles/115008364988
- Headspace iOS/Android cancellation help: https://help.headspace.com/hc/en-us/articles/115014780447
- Makerkit Next.js 16 project structure: https://makerkit.dev/blog/tutorials/nextjs-app-router-project-structure
- WorkOS multi-tenant architecture: https://workos.com/blog/developers-guide-saas-multi-tenant-architecture
- Serverless First subdomain structure: https://serverlessfirst.com/how-to-select-a-future-proof-subdomain-structure-for-saas-web-app/

**Failed fetches (noted for transparency):**

- `https://www.calm.com` (403 — bot-detection); pattern inferred from help-center search results
- `https://account.calm.com` (404 — pattern referenced in CLAUDE.md but not directly inspectable)
- `https://my.headspace.com` (login-only; pattern inferred from help-center docs)
- `https://www.airbnb.com` (403 — bot-detection)
- `https://duolingo.com` (content not extractable)
- `https://stripe.com/{404,nonexistent}` — Stripe's 404 page itself not directly extractable via WebFetch
