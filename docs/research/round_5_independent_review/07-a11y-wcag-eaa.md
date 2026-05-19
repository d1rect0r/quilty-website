# Quilty Website — A11y Architecture Review (May 2026)

> Senior web a11y architecture review for **quilty-website** at M1 pre-scaffold.
> Target: WCAG 2.2 AA, EU EAA-ready, US ADA / Section 504 OCR-ready, HIPAA-aligned reputational posture.
> Stack: Next.js 16 App Router + TS strict + Tailwind v4 + shadcn/ui + Radix.
>
> Verdict up front: the locked decisions (D17 3-layer tokens; D18 wrap-don't-edit shadcn; D22 axe-core CI fail-on-violation; D23 jsx-a11y in pre-commit) are correct. This document hardens them with current 2026 evidence and adds 7 retrofit-hostile items that must land at M1, not later.

---

## Anchor evidence (consulted live, May 2026)

- **Deque "57% by volume"** statistic remains the canonical figure; reaffirmed at axe-con 2025; AxeDevTools Pro IGTs claim ~80%. Public claim of "100% by end-2025" did **not** materialise (Adrian Roselli, 2026).
- **EAA enforcement** began 28 June 2025; no headline fines yet, but France (DGCCRF) has issued formal notices to Carrefour/Auchan/Leclerc; Ireland is the only EU state with **criminal** liability up to 18mo prison. Spain/Italy ceilings near €1M.
- **HHS OCR Section 504 (US)** — final 2024 rule mandates WCAG 2.1 AA for any HHS-funded entity. May 2026 IFR pushed compliance deadlines to **May 2027 (≥15 employees) / May 2028 (smaller)** — but underlying anti-discrimination obligation is **already in force, and OCR can open investigations today**.
- **WCAG 3.0** — March 2026 Working Draft with 174 requirements; Candidate Recommendation projected Q4 2027; final 2029+. No reason to defer WCAG 2.2 AA work today.
- **Web Almanac 2025 accessibility chapter** — `prefers-reduced-motion` adoption ~50%, `forced-colors` rising to 19%, `prefers-color-scheme` only ~13% — i.e. most sites still ignore user preference signals.
- **shadcn/ui April 2026 audit (TheFrontKit, 48 components vs WCAG 2.2 AA)** — Radix layer excellent; shadcn defaults fail focus-ring contrast on `ring-1 ring-ring/50` in default themes; Recharts has no a11y alternative; Input OTP doesn't announce paste; AlertDialog auto-focuses Cancel (per Radix design).
- **FTC v. accessiBe** — finalised April 2025, $1M order, 20-year ban on compliance claims. Overlays are settled: **do not adopt under any circumstance**.

---

## Question-by-question deliverable

### 1. `@axe-core/playwright` 2026

**Current 2026 enterprise practice.** `@axe-core/playwright` (built on axe-core 4.11+) is the de-facto a11y CI standard. WCAG 2.2 AA coverage requires `withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22a','wcag22aa'])` — note that `wcag22a`/`wcag22aa` tags must be added explicitly (many older guides only show 2.1). Enterprise pattern is a shared `makeAxeBuilder` Playwright fixture (DRY, single suppression list) + `expect(results.violations).toEqual([])` to fail builds + `.exclude()` for tracked legacy exceptions. Run with `--fail-on-flaky-tests` so retries that pass-on-second-try don't mask races where axe scanned before a spinner cleared. Per Deque's own 2025 reaffirmation, axe-core catches ~57 % of issues _by volume_ — useful in stakeholder comms, but never frame as "compliance".

**Reference URLs.**

- https://playwright.dev/docs/accessibility-testing
- https://www.deque.com/blog/automated-testing-study-identifies-57-percent-of-digital-accessibility-issues/
- https://www.npmjs.com/package/@axe-core/playwright

**Recommendation for M1/M2.** Lock at M1: install `@axe-core/playwright`, create `apps/web/tests/a11y/axe.fixture.ts` with the 2.2 AA tag set + a single `exclude()` list (empty at M1) + `disableRules()` list (empty), and add a per-page axe smoke test to every page scaffolded via `/scaffold-page`. CI gate is `expect(violations).toEqual([])` from day one — the marketing site has zero "legacy" to grandfather. **Tag tests `@a11y`** so they can be filtered.

**Retrofit cost if wrong.** **High** — adding fail-on-violation after 100 marketing pages and a portal exist means hundreds of pre-existing violations to triage; teams either weaken the rule or postpone forever. Land on green at M1.

---

### 2. `eslint-plugin-jsx-a11y` 2026

**Current 2026 enterprise practice.** Next.js 16 **removed `next lint`**; flat-config `eslint.config.mjs` is mandatory. The plugin remains the only static AST checker for JSX a11y (Biome's accessibility rules cover a subset — `noSvgWithoutTitle`, `useValidAriaProps`, etc. — but miss role-specific composition rules like `role-supports-aria-props` and `interactive-supports-focus`). It is **agnostic to RSC** (JSX-AST only), so works identically on Server and Client Components. shadcn/Radix handles primitive a11y but jsx-a11y still catches the _consumer_ mistakes — missing `alt`, invalid `aria-*`, label-control mismatch in custom forms, `tabIndex` on non-interactive, `onClick` without keyboard handler. Recommended: `jsx-a11y/strict` (not `recommended`) for greenfield + `polymorphicPropName: 'as'` setting for shadcn's `asChild` patterns.

**Reference URLs.**

- https://www.npmjs.com/package/eslint-plugin-jsx-a11y
- https://chris.lu/web_development/tutorials/next-js-16-linting-setup-eslint-9-flat-config

**Recommendation for M1/M2.** Adopt `jsxA11yPlugin.configs.strict.rules` in `apps/web/eslint.config.mjs` at scaffold. Run in **pre-commit via lint-staged** and as a CI job. Belt-and-suspenders with shadcn is correct — jsx-a11y catches _your_ composition mistakes; Radix protects _its_ primitives.

**Retrofit cost if wrong.** **Low–Medium** — auto-fixable rules are limited; manual rewrites needed. Cheaper at M1 than M5.

---

### 3. Lighthouse a11y vs axe-core

**Current 2026 enterprise practice.** Lighthouse's a11y category _uses_ axe-core under the hood, but runs only ~50–57 of the ~96 axe rules and folds them into a 0–100 score that mixes in "manual checks" placeholders, making the headline number misleading (90 ≠ compliant). It adds nothing axe-core via Playwright doesn't already cover for a11y. Lighthouse's actual value in CI is Core Web Vitals + SEO + best-practices, not a11y. The 57% Deque figure refers to axe-core's full rule set, not Lighthouse's subset — Lighthouse coverage is meaningfully lower.

**Reference URLs.**

- https://inclly.com/resources/axe-vs-lighthouse
- https://www.debugbear.com/blog/lighthouse-accessibility

**Recommendation for M1/M2.** Run Lighthouse CI for **performance + SEO + best-practices** only; treat its a11y category as informational, not a gate. Avoid dual-running axe and Lighthouse a11y in CI — pure noise. Use `lhci autorun --collect.settings.onlyCategories=performance,seo,best-practices` (or the equivalent assertion config) to mute a11y from the Lighthouse score.

**Retrofit cost if wrong.** **Low** — easy to toggle a category in lhci config later.

---

### 4. Pa11y / WAVE / AccessiBe overlays

**Current 2026 enterprise practice.** **Pa11y** has one defensible role: scanning _deployed_ sitemap pages (sitemap-driven crawler) on a cron in a separate workflow with axe + HTMLCS runners combined — catches things axe alone misses (~35% combined coverage vs ~27% axe-only in the abbott567 benchmark). **WAVE** is for manual spot-checks, not CI. **Overlays (accessiBe, UserWay, AudioEye, EqualWeb) are settled negative**: FTC $1M order against accessiBe April 2025 (20-year ban on compliance claims); UserWay class action survived motion to dismiss Feb 2026; 800+ accessibility professionals signed the Overlay Fact Sheet; European Disability Forum + IAAP joint statement says overlays do not satisfy EU law; 1,023+ ADA lawsuits in 2024 against overlay-equipped sites; ~25% of 2024 ADA lawsuits cited overlays as part of the problem. Plaintiff attorneys _target_ overlay-equipped sites because the widget proves prior knowledge.

**Reference URLs.**

- https://www.lflegal.com/2025/02/userway-overlay-lawsuit/
- https://overlayfactsheet.com (community fact sheet, 800+ signatories)
- https://www.tpgi.com/web-accessibility-audit/

**Recommendation for M1/M2.** **No overlay, full stop** — would actively _increase_ the website's reputational risk given Quilty's HIPAA-aligned consumer-health peer set. Pa11y is optional add-on at M4–M5 once we have a stable sitemap and deployed staging; **not** at M1. WAVE bookmarklet for spot-checks during manual review is fine.

**Retrofit cost if wrong.** **High** if an overlay ever ships — FTC enforcement + plaintiff-bar targeting both attach. Treat overlay procurement as a `NEVER` rule alongside `NEVER load analytics before consent` in CLAUDE.md.

---

### 5. shadcn/ui + Radix a11y (May 2026)

**Current 2026 enterprise practice.** Radix primitives remain best-in-class for ARIA composition, focus management in dialogs/popovers, and keyboard navigation. The shadcn _styling_ layer is where gaps appear — the April 2026 TheFrontKit audit of all 48 shadcn components found: (a) default `focus-visible:ring-1 ring-ring/50` fails 3:1 non-text contrast in most themes — must bump to `ring-2 ring-offset-2` with a token that contrasts against both light and dark surfaces; (b) **Recharts** has no a11y alternative (empty SVG to screen readers — WCAG 1.1.1 fail) — must provide a `<table>` alternative or `aria-describedby` data summary; (c) **Input OTP** doesn't announce when paste completes; (d) **AlertDialog** auto-focuses Cancel (by Radix design — fine, but document); (e) `asChild` is footgun #1 — wrapping a `<div>` around `<Tooltip.Trigger>` silently breaks keyboard support. shadcn now supports Base UI as an alternative engine; stay on Radix for now (more mature, more documentation).

**Reference URLs.**

- https://thefrontkit.com/blogs/shadcn-ui-accessibility-audit-2026
- https://www.radix-ui.com/primitives/docs/overview/accessibility
- https://eastondev.com/blog/en/posts/dev/20260329-dialog-sheet-popover-accessibility/

**Recommendation for M1/M2.** Hard requirements at scaffold:

1. Override shadcn's default focus ring globally to **2px solid + 2px offset** with a `--ring` token that hits 3:1 against both `--background` light and dark.
2. Ban Recharts at M1 — defer to M4+ and require accessible alternative table at adoption.
3. Lint rule (custom or via codeowners review) for `asChild` patterns that don't forward props.
4. Wrap shadcn primitives in `apps/web/components/app/` per D18 — already locked; the PreToolUse hook should error on direct edits to `components/ui/`.

**Retrofit cost if wrong.** **Medium** — focus-ring fix is a global token swap; the `asChild` trap and chart a11y are pattern-level rules that get expensive only if many violations accumulate.

---

### 6. Manual screen-reader cadence

**Current 2026 enterprise practice.** NVDA + Firefox on Windows + VoiceOver + Safari on macOS covers ~80–85% of real users; add JAWS only if enterprise/B2B traffic, TalkBack for mobile Android traffic. No public cadence from Stripe/Linear/Calm has been confirmed in my research; community guidance is **per-release manual SR sweep on critical flows + per-feature SR test for any new interactive component + ad-hoc on incidents**. Cal.com's open-source repo shows axe-core in Playwright but no documented manual SR cadence in their CONTRIBUTING.

**Reference URLs.**

- https://testparty.ai/blog/screen-reader-testing-guide
- https://www.deque.com/screen-reader-testing-cadence/

**Recommendation for M1/M2.** At M2 (skeleton with 7 pages), do a one-time NVDA + VoiceOver pass on the global layout (header, nav, footer, skip link, focus on route change). After M2, adopt cadence: **per-release manual SR pass on changed critical flows** (sign-in, account, subscription, sign-up CTA); **per-component when a new interactive primitive lands** in `components/app/`; full top-to-bottom SR sweep before any **EU launch** and before any **public press event** (reputational tail risk). Budget ~½ day per release.

**Retrofit cost if wrong.** **Low–Medium** — manual SR finds issues that axe doesn't (focus order, announcement coherence), but most are CSS / aria-label level fixes — not retrofit-hostile architecturally, just embarrassing if shipped.

---

### 7. Focus management on route change (App Router)

**Current 2026 enterprise practice.** Next.js 16 App Router announces page title on navigation (a step up from older versions) but **does not move focus** — open issue #49386 still unresolved. The canonical community pattern: a visually-hidden, focusable element near the top of `app/layout.tsx`, focused via `useEffect` keyed on `usePathname()`. Send focus to **`<main id="main" tabIndex={-1}>`** on POP-navigation or to the skip-link container on PUSH/REPLACE. Avoid `tabIndex={-1}` on the body — it disrupts mouse-click-then-Tab expectations. Critical conflict to know about: scroll restoration and focus restoration are mutually exclusive on browser back/forward — do focus only on PUSH/REPLACE; let the browser handle scroll on POP.

**Reference URLs.**

- https://github.com/vercel/next.js/issues/49386
- https://dev.to/itselftools/enhancing-accessibility-in-nextjs-with-usefocusonnavigation-custom-hook-3fj9
- https://www.oneuptime.com/blog/post/2026-01-15-focus-management-react-spa/view

**Recommendation for M1/M2.** Land at M1 in `apps/web/app/layout.tsx`:

- Skip link as first interactive element, visually-hidden until focused: `<a href="#main" className="sr-only focus:not-sr-only ...">Skip to main content</a>`.
- `<main id="main" tabIndex={-1}>` so it can be focus-targeted but isn't in tab order.
- A client wrapper component `<FocusOnNavigate />` in the root layout that reads `usePathname()` + `useSearchParams()` and, on PUSH/REPLACE only, calls `mainRef.current?.focus({ preventScroll: true })`.
- An `aria-live="polite"` region for route-change announcements if title alone is insufficient (verify with VoiceOver — Next.js's built-in announcer should suffice; only add a custom one if it doesn't).

**Retrofit cost if wrong.** **Medium** — route-change focus loss is invisible to sighted users and to axe; it surfaces only via SR users complaining. Bake it in at M1.

---

### 8. Skip links, landmarks, heading structure

**Current 2026 enterprise practice.** Enterprise convention: exactly one `<h1>` per page (per `next/metadata` page title), `<header>`, `<nav aria-label="Primary">`, `<main id="main">`, `<aside>`, `<footer>` landmarks all used (don't rely on roles when an HTML element exists). Logical heading order — no skipping `h2 → h4`. Skip link always first focusable, visible on focus. axe + jsx-a11y both lint missing landmarks and heading order — but neither catches _single-`h1`-per-page_ enforcement; that's a manual review rule.

**Reference URLs.**

- https://www.w3.org/WAI/tutorials/page-structure/headings/
- https://almanac.httparchive.org/en/2025/accessibility

**Recommendation for M1/M2.** Layout primitive at M1: `<RootLayout>` ships skip link + `<header>` + `<main id="main" tabIndex={-1}>` + `<footer>`. The `/scaffold-page` skill should enforce one `<h1>` (derived from page metadata) — wire this into the skill template. Add a single-`h1`-per-page Playwright assertion to every page's a11y test.

**Retrofit cost if wrong.** **High** — once 100 marketing pages exist with shifted heading hierarchies or missing landmarks, fixing them requires touching every page. Land the scaffold convention at M1.

---

### 9. Color contrast tooling

**Current 2026 enterprise practice.** Tailwind v4 ships **OKLCH** as the default color model; shadcn now uses OKLCH too. The perceptual uniformity of OKLCH lets you generate palettes algorithmically while keeping consistent contrast — but axe-core's contrast check has known gaps: gradient backgrounds, semi-transparent backgrounds, hover/focus states (it scans static state only), and dark mode in a light-mode scan. Tooling options for _generation-time_ contrast enforcement: `tailwind-merge` + custom CI script that parses `@theme` tokens and asserts WCAG ratios; Figma plugins like Stark/Able for design-time check; `oklch-contrast` npm packages for runtime guard. Steve Kinney's heuristic: **0.4+ lightness delta** between foreground/background in OKLCH gives a safe AA margin.

**Reference URLs.**

- https://www.maviklabs.com/blog/design-tokens-tailwind-v4-2026/
- https://stevekinney.com/courses/tailwind/oklch-colors
- https://ui.shadcn.com/docs/tailwind-v4

**Recommendation for M1/M2.** Three layers at M1:

1. **Token generation**: any semantic color token (`--color-fg-default`, `--color-fg-muted`, `--color-bg-default`, …) must have a documented contrast ratio target in `apps/web/app/globals.css` (`@theme` block) and a comment with the actual ratio.
2. **CI script**: a small Node script (`scripts/check-contrast.mjs`) parses `@theme` tokens, computes pairwise WCAG ratios for documented fg/bg pairs, fails build if any documented pair falls below target. Runs in `pnpm test`.
3. **Test-time**: axe handles state-dynamic contrast on rendered pages. Document the gradient/transparent caveat in a README so reviewers know what's _not_ being caught automatically.

**Retrofit cost if wrong.** **Medium** — refactoring a palette after components depend on it is annoying but not architectural. Doing it once at M1 with token discipline is much cheaper.

---

### 10. Forms a11y (shadcn Form + react-hook-form)

**Current 2026 enterprise practice.** shadcn's modern `<Field />` family is the recommended composition: `<Field data-invalid={...}><FieldLabel htmlFor={id}>` + `<Input aria-invalid={...} aria-describedby={errorId} />` + `<FieldDescription id={descId}>` + `<FieldError id={errorId}>`. ARIA wiring is automatic via `React.useId()` and field state. **Gap**: `FieldError` does NOT render in a live region by default — for async/server-side validation errors that arrive after first paint, screen readers won't announce them. Pattern: wrap top-of-form _summary_ errors in `role="alert"` (assertive) and per-field errors stay in `aria-describedby` for context. Required-field marking: visual asterisk + `aria-required="true"` + repeated text in label or description (asterisk alone fails SR comprehension). Group related controls in `<FieldSet><FieldLegend>`.

**Reference URLs.**

- https://ui.shadcn.com/docs/components/radix/field
- https://blog.openreplay.com/create-accessible-forms-shadcn-ui/

**Recommendation for M1/M2.** At M2 (when forms first appear): standardise on `<Field />`-family composition. Wrap form-level `<FormErrorSummary role="alert">` at top of every form (announced on submit failure). Required fields use visual asterisk + `aria-required` + `(required)` text in `FieldLabel` for SR. Required is non-negotiable for the sign-up form (M5–M6) and any future newsletter/contact form (M2).

**Retrofit cost if wrong.** **Medium** — fixing forms is form-by-form, but the form-summary live-region pattern is architectural and benefits from being a shared component from day one.

---

### 11. Dialog / modal / popover a11y

**Current 2026 enterprise practice.** Radix Dialog/Sheet/Popover handle focus trap, ESC dismiss, restore-focus-on-close, `aria-modal`, `role="dialog"`, and `aria-labelledby`/`aria-describedby` wiring correctly. Gotchas in Next.js 16 RSC: dialogs must render in a Client Component (Radix uses portal + state) — keep them in `'use client'` files. **DialogTitle and DialogDescription are required** for Radix to wire ARIA correctly; if you don't want a visible title, wrap it in `<VisuallyHidden>` from `@radix-ui/react-visually-hidden`. Portal target defaults to `document.body` — fine in App Router. Nested dialogs: focus restore chains correctly when both are Radix-managed. AlertDialog autofocuses Cancel deliberately (destructive-action safety) — document this so reviewers don't "fix" it.

**Reference URLs.**

- https://www.radix-ui.com/primitives/docs/components/dialog
- https://eastondev.com/blog/en/posts/dev/20260329-dialog-sheet-popover-accessibility/

**Recommendation for M1/M2.** No dialogs at M1 (marketing skeleton). When the first dialog lands (likely M3 or M5 portal): create one `Dialog` wrapper in `components/app/` that enforces (a) DialogTitle present (visually hidden allowed), (b) DialogDescription present or explicitly `null` with a code comment justifying it, (c) `'use client'` directive. Document the AlertDialog Cancel-focus behaviour in the component README.

**Retrofit cost if wrong.** **Low** — Radix gives this away; the risk is wrapper drift across teams. Lock the wrapper early.

---

### 12. Toast / live-region a11y

**Current 2026 enterprise practice.** **Sonner** is the de-facto choice (shadcn moved its default to Sonner). It's `aria-live="polite"` by default and handles dismiss focus correctly. Radix Toast offers more granular `foreground`/`background` (`assertive`/`polite`) control + `altText` for action buttons — but has an open bug (#3634) where `aria-live="off"` on `role="status"` prevents announcements in some configurations. Both libraries require manual verification with a real screen reader; toast announcement is fragile across browser/SR combinations.

**Reference URLs.**

- https://sonner.emilkowal.ski/
- https://github.com/radix-ui/primitives/issues/3634
- https://www.radix-ui.com/primitives/docs/components/toast

**Recommendation for M1/M2.** Sonner at M1, wrapped in `apps/web/components/app/Toaster.tsx`. Validate behaviour with VoiceOver at M2. For _critical_ announcements (form errors on submit, payment failures) **do not rely on toasts alone** — pair with inline error and an `aria-live` region near the trigger. Toast is fire-and-forget; critical info needs persistent surface.

**Retrofit cost if wrong.** **Low** — toast library swap is mechanical.

---

### 13. Image alt + `next/image` intersection

**Current 2026 enterprise practice.** `next/image` does NOT make `alt` optional — it's required at type level (TS will fail to build without it). Convention: meaningful `alt` for content images; `alt=""` for purely decorative; never `alt="image"`/`alt="photo"` filler. jsx-a11y's `alt-text` rule enforces presence; manual review enforces _quality_. `next/image` `priority` only for above-the-fold LCP image; `sizes` discipline for responsive — these are perf, not a11y, but degraded perf hurts users on assistive tech disproportionately (slower devices, screen-reader DOM parsing delays).

**Reference URLs.**

- https://nextjs.org/docs/app/api-reference/components/image
- https://www.w3.org/WAI/tutorials/images/decorative/

**Recommendation for M1/M2.** Already enforced by D21 (`next/image` priority/sizes) + jsx-a11y. Add a content-author convention doc in `docs/a11y/image-alt.md` (or inside the strategy doc) explaining decorative vs meaningful and giving 3 real examples. Required reading for anyone writing MDX content from M2 onward.

**Retrofit cost if wrong.** **Low** — image alts are mechanically fixable, but author muscle memory is hard to retrain after hundreds of pages.

---

### 14. Video / audio a11y (forward-looking — product demos)

**Current 2026 enterprise practice.** Captions are WCAG 1.2.2 Level A (not AA — mandatory). Audio descriptions for visual-only information are 1.2.3 Level A (alternative) or 1.2.5 Level AA. Transcripts strongly recommended (1.2.1 Level A for audio-only; supports search + i18n). Autoplay-with-sound is 1.4.2 Level A fail unless user-initiated. For Quilty: product demo videos will arrive M4+; plan host (Mux / Vimeo / self-hosted with `<video>`); both Mux and Vimeo Pro support captions via VTT and have decent player a11y. Avoid YouTube embed for primary product video — its iframe has known SR issues and forces third-party cookies (consent + privacy issues, D35).

**Reference URLs.**

- https://www.w3.org/WAI/WCAG22/quickref/#captions-prerecorded
- https://mux.com/blog/accessibility-in-our-video-player

**Recommendation for M1/M2.** Reserve M1 decision: when first product demo lands (M4+), use Mux Player or self-hosted `<video controls>` with required `<track kind="captions" srclang="en">` + transcript in the page below the video. No autoplay-with-sound, ever. Document in strategy doc as **D-future** placeholder.

**Retrofit cost if wrong.** **Medium** — if videos ship without captions, fixing means re-uploading transcripts and reprocessing. EAA captures captioning explicitly.

---

### 15. Reduced motion

**Current 2026 enterprise practice.** Web Almanac 2025: ~50% of pages now support `prefers-reduced-motion`. Pattern: `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }` as a baseline; library-level: Framer Motion respects it via `useReducedMotion()` hook; GSAP has `gsap.matchMedia()`; CSS `view-transition` API in Next.js 16 needs explicit handling. `next/font` doesn't animate by default — fine.

**Reference URLs.**

- https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion
- https://almanac.httparchive.org/en/2025/accessibility
- https://web.dev/learn/accessibility/motion

**Recommendation for M1/M2.** Add the baseline `@media (prefers-reduced-motion: reduce)` reset to `app/globals.css` at M1. When picking an animation library (M3 identity discovery), require `useReducedMotion`-aware patterns. Add Playwright test that toggles `emulateMedia({ reducedMotion: 'reduce' })` and asserts no animation runs beyond a duration threshold (sample assertion only — not perfect, but catches regressions).

**Retrofit cost if wrong.** **Low** — but Quilty's _mental-health_ peer set makes this reputationally weighted: a customer with vestibular disorder hitting a flashy landing page is a worst-case PR story.

---

### 16. Dark mode + contrast

**Current 2026 enterprise practice.** Tailwind v4 dark mode via `.dark` class on `<html>` + OKLCH `--color-*` tokens redefined in `.dark { ... }` block. Critical: every fg/bg pair must be re-checked in dark mode — axe scans whichever theme is active, so CI needs to test **both** themes. Pattern: a Playwright test that calls `page.emulateMedia({ colorScheme: 'dark' })` (or clicks the theme toggle) and re-runs axe. shadcn ships dark-mode-correct contrast out of the box for most components but verifies are needed for any custom palette tweaks. Storybook a11y addon helps at component-test time.

**Reference URLs.**

- https://ui.shadcn.com/docs/dark-mode/next
- https://tailwindcss.com/docs/dark-mode

**Recommendation for M1/M2.** Decide at M1 whether dark mode ships day-one. If yes: ship dark tokens at M1 and CI must axe-scan **both** themes per page (double the test count, accept it). If no: defer to M3 identity discovery and accept that retrofitting dark mode forces re-auditing all pages — also fine, but commit to the choice. Recommended: **defer dark mode to M3**, focus M1/M2 on shipping light-mode-clean baseline.

**Retrofit cost if wrong.** **Medium** — dark mode is mostly token-level; component-level dark bugs are tractable; the multiplier is in test maintenance, not retrofit.

---

### 17. EAA enforcement reality + manual audit budget

**Current 2026 enterprise practice.** EAA became enforceable 28 June 2025. Reality through May 2026: France leading visible action (Carrefour/Auchan/Leclerc formal notices late 2025); Spain/Italy aggressive penalty ceilings (~€1M); Ireland uniquely has _criminal_ penalties (up to 18 months prison for responsible individuals — directors). No headline fines yet, but pattern is "guidance first, fines later" mirroring GDPR. **Health-adjacent sites are higher reputational risk** even though Quilty isn't medical-device — consumer mental-health peers (Calm, Headspace) operate in regulator focus. Manual audit pricing (TPGi/Deque/Siteimprove all custom-quote; ranges from analyst reports): small scope $1.5K–$5K; mid-market pre-launch $10K–$40K; enterprise multi-property $50K–$150K. Includes manual SR testing, VPAT/ACR production, remediation guidance.

**Reference URLs.**

- https://www.pivotalaccessibility.com/2025/09/eaa-enforcement-in-europe-following-the-june-2025-deadline/
- https://commission.europa.eu/strategy-and-policy/policies/justice-and-fundamental-rights/disability/european-accessibility-act-eaa_en
- https://www.tpgi.com/web-accessibility-audit/

**Recommendation for M1/M2.** No EU launch at M1–M2 (English-only per D14/D25). When EU launch is contemplated (M8+): budget **$15K–$25K** for a TPGi or Deque pre-EU-launch manual audit covering the marketing site + sign-in + account portal (estimated 15–25 templates at this scope). Outputs: VPAT/ACR (EN 301 549 conformance statement) + remediation issue tracker + screen-reader test report. Schedule audit **6 weeks before** EU launch to allow remediation cycles. Do not rely on automated tools alone for EAA — EAA Article 14 demands documented conformity assessment, which a self-attestation backed only by axe-core is unlikely to survive scrutiny.

**Retrofit cost if wrong.** **High** if audit happens after launch and finds blockers — France's enforcement model is "fix or face notice + remediation deadline"; non-compliance can escalate quickly.

---

### 18. WCAG 3.0 timeline (May 2026)

**Current 2026 enterprise practice.** WCAG 3.0 March 2026 Working Draft introduced 174 "requirements" (renamed from "outcomes"). AG WG co-chair Rachael Bradley Montgomery (per Knowbility 2025) projects final Recommendation late 2029 with Candidate Recommendation Q4 2027. WCAG 2.2 will NOT be deprecated for "several years after" 3.0 finalises (W3C explicit). Nothing about today's WCAG 2.2 AA work needs to change — 3.0 is additive in spirit (more outcome-based, less success-criterion-based) but not yet testable. APCA (the new contrast algorithm in 3.0) is _not yet adopted_ even within 3.0 draft.

**Reference URLs.**

- https://www.w3.org/TR/wcag-3.0/
- https://knowbility.org/blog/2025/be-a-digital-ally-wcag-3-update
- https://www.w3.org/WAI/standards-guidelines/wcag/wcag3-intro/

**Recommendation for M1/M2.** Target **WCAG 2.2 AA**, period. Do not chase WCAG 3.0 Working Draft requirements — they will shift, and 2.2 conformance is the legally referenced standard everywhere that matters (EAA via EN 301 549 v3.2.1, US Section 504, ADA Title II). Revisit annually (March 2027, March 2028) to see if 3.0 transition planning starts.

**Retrofit cost if wrong.** **Low** — chasing 3.0 today is the bigger risk (wasted work). 2.2 conformance is durable.

---

### 19. Accessibility statement

**Current 2026 enterprise practice.** EAA Article 13 + EN 301 549 v3.2.1 require: commitment + scope; conformance status (full/partial/none) with explicit standard (WCAG 2.1 or 2.2 AA + EN 301 549 v3.2.1); list of non-accessible content with rationale categorised as `non-compliance`, `disproportionate burden` (strict legal test), or `out-of-scope`; date of last assessment + method; working feedback mechanism with response window; link to national enforcement authority. US side (ADA Title III civil suits + Section 504 OCR) doesn't legally require a statement, but having one demonstrates good-faith effort and gets cited in plaintiff settlements. The EU's own statement is a worked template. **Honest "partially conforms" is far less risky than claiming "fully conforms"** — false declaration is its own violation under EAA.

**Reference URLs.**

- https://www.levelaccess.com/blog/eaa-accessibility-statement/
- https://european-union.europa.eu/accessibility-statement_en
- https://commission.europa.eu/strategy-and-policy/policies/justice-and-fundamental-rights/disability/european-accessibility-act-eaa_en

**Recommendation for M1/M2.** Ship `app/(legal)/accessibility/page.tsx` at **M2** (the legal/about milestone or earlier) with a template that includes: commitment, "partial conformance to EN 301 549 v3.2.1 / WCAG 2.2 AA" (after audit makes this honest), known issues list, feedback email `accessibility@my-quilty.com` + response-window commitment (e.g., "we respond within 10 business days"), assessment date + method (self-eval at M2, third-party at M8). Make the page maintained — add a CODEOWNERS rule + a monthly review reminder. **Do not** claim full conformance until a third-party audit confirms it.

**Retrofit cost if wrong.** **Medium** — statement omission is a documented EAA non-compliance category in EU; adding it is mechanical, but the assessment-date and known-issues maintenance are operational. Adding the email inbox + response process at M2 saves scrambling at M8.

---

### 20. Section 508 Refresh + HIPAA-aligned posture

**Current 2026 enterprise practice.** Section 508 still officially references WCAG 2.0 AA, but the Section 508 Refresh Act (proposed) and the 2024 DOJ ADA Title II rule both point to WCAG 2.1 / 2.2 AA — federal procurement is already requiring 2.2 in many RFPs. **HHS OCR Section 504 (May 2024 final rule + May 2026 IFR extension)** is the more immediate vector for Quilty: any entity receiving HHS funding (Medicaid, Medicare, federal grants) must meet WCAG 2.1 AA across web, mobile, patient portals, kiosks — deadlines now May 2027 (≥15 emp) / May 2028 (smaller). Quilty's website itself is in Workloads-NonHIPAA OU and is marketing/account-mgmt only — but if Quilty _the company_ ever takes HHS funding (research grants, public-health partnerships, Medicaid managed-care contracts), the website is in scope. **Reputational posture for a HIPAA-aligned consumer-health brand is asymmetric** — Cerebral/Monument-style media attention attaches to a11y complaints faster than to non-health peers.

**Reference URLs.**

- https://www.hhs.gov/sites/default/files/new-requirements-accessibility-web-content-mobile-apps-kiosks.pdf
- https://www.section508.gov/manage/program-roadmap/
- https://www.hhs.gov/press-room/hhs-extends-mobile-and-web-accessibility-deadline.html
- https://katten.com/hhs-web-accessibility-rule-key-requirements-and-fast-approaching-compliance-deadlines

**Recommendation for M1/M2.** Treat **WCAG 2.2 AA** as the floor (not the ceiling); selectively apply AAA where clinical or sensitive-content surfaces appear (e.g., crisis-resource pages: AAA contrast for body text 7:1; this is the only AAA criterion that's cheap to enforce). Add `docs/a11y/regulatory-posture.md` documenting: (a) website is marketing/account-mgmt only, not PHI-handling; (b) HHS Section 504 not currently in scope but would attach if Quilty takes federal funding; (c) EAA in scope at EU launch (M8+); (d) Section 508 in scope only via federal procurement / contractor relationships; (e) ADA Title III private litigation is the highest-frequency US risk (~8,667 lawsuits in 2025).

**Retrofit cost if wrong.** **Medium–High** — if HHS funding ever attaches and the website is non-compliant, OCR can investigate proactively without a complaint. The cheapest insurance is meeting WCAG 2.2 AA at M1 and producing a VPAT before any partnership conversation.

---

## TOP-7 retrofit-hostile a11y items (MUST land in M1 scaffold)

1. **`@axe-core/playwright` fail-on-violation with 2.2 AA tags + shared fixture.** Adding it after pages exist creates a compounding suppression list. _(Q1)_
2. **`<main id="main" tabIndex={-1}>` + skip link + `<FocusOnNavigate />` route-change focus pattern in root layout.** Adding focus management after 100 pages exist requires per-page testing. _(Q7)_
3. **Single-`h1`-per-page convention enforced by `/scaffold-page` skill + Playwright assertion.** Heading-order retrofits touch every page. _(Q8)_
4. **OKLCH token system with documented contrast ratios + CI contrast script.** Palette retrofits cascade through every component. _(Q9)_
5. **Reduced-motion baseline reset in `globals.css` + animation-library policy.** Easy to add now, embarrassing to discover broken at launch — esp. for mental-health peer set. _(Q15)_
6. **Custom focus-ring override of shadcn defaults (2px solid + 2px offset, contrast-correct token).** shadcn default ring-1 fails 3:1 in most themes; fixing it once at M1 vs after every component lands. _(Q5)_
7. **`/scaffold-page` skill enforces `generateMetadata` + landmarks + a11y smoke test + accessibility-statement awareness.** This is the structural lock that makes every future page comply by default. _(Q8, Q19)_

Plus an **8th honourable mention** that's process not code: **document an overlay-prohibition rule in CLAUDE.md NEVER list.** Cheaper than recovering from a future "let's just buy AccessiBe to ship faster" instinct. _(Q4)_

---

## CI a11y pipeline shape (`.github/workflows/a11y.yml`)

Trigger: `pull_request` on any branch + `push` to `main` + manual `workflow_dispatch`.

```yaml
name: a11y
on:
  pull_request:
  push:
    branches: [main]
  workflow_dispatch:
jobs:
  lint-a11y:
    name: ESLint jsx-a11y/strict
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter web lint
  contrast-tokens:
    name: OKLCH contrast token check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter web run check:contrast
  playwright-a11y:
    name: Playwright + axe-core (WCAG 2.2 AA)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter web exec playwright install --with-deps chromium
      - run: pnpm --filter web exec playwright test --grep @a11y --fail-on-flaky-tests
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-a11y-report
          path: apps/web/playwright-report/
```

What it runs:

- `lint-a11y` — `eslint-plugin-jsx-a11y/strict` rules across `apps/web/**/*.{ts,tsx}` (also runs in pre-commit via lint-staged for fast feedback).
- `contrast-tokens` — Node script parses `@theme` block in `globals.css`, computes WCAG contrast ratios for documented fg/bg pairs, fails on any below target.
- `playwright-a11y` — Runs every `@a11y`-tagged Playwright test (one per scaffolded page + per critical interactive component). Each test does `expect(violations).toEqual([])` with the 2.2 AA tag set. Uploads HTML report on failure.

**Deferred to M5+**:

- Pa11y-CI sitemap scan against deployed staging (separate workflow `a11y-sitemap.yml` triggered nightly via `schedule`).
- Lighthouse CI for **non-a11y** categories.
- Dark-mode parallel axe runs (added when dark mode ships, expected M3).

---

## Decisions that change from baseline

The CLAUDE.md baseline already locks: axe-core in CI fail-on-violation; jsx-a11y in pre-commit; WCAG 2.2 AA target (not AAA). These are **correct as locked**. This review adds the following sharper decisions:

- **D22 clarification** — axe `withTags` must include `wcag22a` + `wcag22aa` explicitly (not just 2.1) and the `@axe-core/playwright` integration uses a shared fixture with empty `.exclude()` and empty `disableRules()` lists. Document in `docs/a11y/axe-config.md` at M1.
- **D23 clarification** — `eslint-plugin-jsx-a11y` uses the **`strict` preset**, not `recommended`, with `polymorphicPropName: 'as'` for shadcn `asChild`.
- **New: overlay prohibition** — add to CLAUDE.md `NEVER` list: "Adopt any accessibility overlay product (accessiBe, UserWay, AudioEye, EqualWeb, etc.) — FTC ban and disability-community consensus settle this."
- **New: scoped AAA** — apply WCAG 2.2 AAA contrast (7:1) to crisis-resource and clinically sensitive content surfaces (when they ship) — cheap to enforce via token, high reputational upside.
- **New: dark-mode timing** — defer to M3 identity-discovery; commit at M1 to "no dark mode at scaffold" so CI test surface doesn't double prematurely.
- **New: manual SR cadence** — per-release sweep of changed critical flows on NVDA + VoiceOver; full sweep before EU launch + before any major press event.
- **New: regulatory posture doc** — `docs/a11y/regulatory-posture.md` summarising EAA, ADA Title III, Section 504/508 scope at M2.

---

## Manual audit budget (pre-EU-launch)

**Vendor**: TPGi or Deque (both have W3C working-group representation; both produce regulator-credible VPAT/ACRs). Avoid Siteimprove for one-off pre-launch — strong continuous-monitoring platform but heavier sales motion for a single audit.

**Scope**: marketing site (top ~15 page templates after content stabilises at M4) + sign-in flow + account portal critical screens (~5–8 screens). Excludes: blog (deferred), help center (deferred to third-party Zendesk/Intercom which has its own a11y posture).

**Deliverables required from vendor**:

1. VPAT/ACR aligned to **EN 301 549 v3.2.1** explicitly (not just WCAG 2.2 AA — EAA references EN 301 549).
2. Issue tracker export (CSV or Jira-importable) categorised by WCAG SC + severity.
3. Manual screen-reader test report (NVDA + VoiceOver minimum; add JAWS if budget allows).
4. Remediation consultation hours (typically 4–8 included).

**Cost band**: **$15K–$25K USD** for this scope, single audit, English-only. EAA-targeted (EN 301 549) framing adds nothing material to cost.

**Timing**: 6 weeks before EU launch. Allow 3 weeks vendor delivery + 3 weeks internal remediation. Budget a second mini-audit (~$5K) post-remediation to verify and update VPAT.

**Annual cadence post-launch**: One audit refresh per year ($10K–$15K) + an EAA accessibility-statement review (1 day internal work). Tracks the EAA expectation of _ongoing_ monitoring, not one-shot conformance.

---

## Sources (all live, May 2026)

- [Deque: Automated Testing Identifies 57% of Accessibility Issues](https://www.deque.com/blog/automated-testing-study-identifies-57-percent-of-digital-accessibility-issues/)
- [Adrian Roselli: Be Wary of Accessibility Guarantees from Anyone (2026)](https://adrianroselli.com/2025/03/be-wary-of-accessibility-guarantees-from-anyone.html)
- [Playwright Accessibility Testing Docs](https://playwright.dev/docs/accessibility-testing)
- [@axe-core/playwright on npm](https://www.npmjs.com/package/@axe-core/playwright)
- [eslint-plugin-jsx-a11y on npm](https://www.npmjs.com/package/eslint-plugin-jsx-a11y)
- [chris.lu: Next.js 16 ESLint 9 flat config setup](https://chris.lu/web_development/tutorials/next-js-16-linting-setup-eslint-9-flat-config)
- [Pivotal Accessibility: EAA Enforcement Following the June 2025 Deadline](https://www.pivotalaccessibility.com/2025/09/eaa-enforcement-in-europe-following-the-june-2025-deadline/)
- [European Commission: EAA Overview](https://commission.europa.eu/strategy-and-policy/policies/justice-and-fundamental-rights/disability/european-accessibility-act-eaa_en)
- [Web-accessibility-checker: EAA Fines by Country 2026](https://web-accessibility-checker.com/en/blog/eaa-fines-by-country)
- [Level Access: EAA Accessibility Statement Requirements](https://www.levelaccess.com/blog/eaa-accessibility-statement/)
- [EU Accessibility Statement template](https://european-union.europa.eu/accessibility-statement_en)
- [HHS: Web Accessibility Rule Final](https://www.hhs.gov/sites/default/files/new-requirements-accessibility-web-content-mobile-apps-kiosks.pdf)
- [HHS: OCR Extends Web Accessibility Compliance Deadline (May 2026 IFR)](https://www.hhs.gov/press-room/hhs-extends-mobile-and-web-accessibility-deadline.html)
- [Katten: HHS Web Accessibility Rule Compliance Deadlines](https://katten.com/hhs-web-accessibility-rule-key-requirements-and-fast-approaching-compliance-deadlines)
- [Section508.gov: 508 Roadmap](https://www.section508.gov/manage/program-roadmap/)
- [Lainey Feingold: UserWay Overlay Lawsuit (Feb 2025)](https://www.lflegal.com/2025/02/userway-overlay-lawsuit/)
- [FTC Order vs accessiBe (April 2025)](https://www.ftc.gov/news-events/news/press-releases/2025/04/ftc-finalizes-order-accessibe-deceptive-claims) (cited in adirondackwebsitedesign reference)
- [TheFrontKit: shadcn/ui WCAG 2.2 AA Audit April 2026](https://thefrontkit.com/blogs/shadcn-ui-accessibility-audit-2026)
- [Radix Primitives: Accessibility Overview](https://www.radix-ui.com/primitives/docs/overview/accessibility)
- [Radix Toast accessibility issue #3634](https://github.com/radix-ui/primitives/issues/3634)
- [BetterLink Blog: Dialog/Sheet/Popover A11y (March 2026)](https://eastondev.com/blog/en/posts/dev/20260329-dialog-sheet-popover-accessibility/)
- [shadcn Field component docs](https://ui.shadcn.com/docs/components/radix/field)
- [shadcn React Hook Form docs](https://ui.shadcn.com/docs/forms/react-hook-form)
- [shadcn Tailwind v4 docs](https://ui.shadcn.com/docs/tailwind-v4)
- [Next.js 16 focus on navigation discussion #65231](https://github.com/vercel/next.js/discussions/65231)
- [Next.js issue: moving focus after navigations #49386](https://github.com/vercel/next.js/issues/49386)
- [Web Almanac 2025: Accessibility chapter](https://almanac.httparchive.org/en/2025/accessibility)
- [W3C: WCAG 3.0 Working Draft (March 2026)](https://www.w3.org/TR/wcag-3.0/)
- [W3C WAI: WCAG 3 Intro](https://www.w3.org/WAI/standards-guidelines/wcag/wcag3-intro/)
- [Knowbility: WCAG 3 Update 2025](https://knowbility.org/blog/2025/be-a-digital-ally-wcag-3-update)
- [Mavik Labs: Design Tokens That Scale (Tailwind v4)](https://www.maviklabs.com/blog/design-tokens-tailwind-v4-2026/)
- [Steve Kinney: OKLCH Colors in Tailwind](https://stevekinney.com/courses/tailwind/oklch-colors)
- [TPGi: Web Accessibility Audit](https://www.tpgi.com/web-accessibility-audit/)
- [DigitalA11Y: Audit Cost Guide 2026](https://www.digitala11y.com/how-much-does-a-web-accessibility-audit-cost/)
- [MDN: prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion)
- [web.dev: Animation and motion](https://web.dev/learn/accessibility/motion)
