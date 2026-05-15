# Research: Design System + Accessibility Infrastructure

> Source: general-purpose research agent, 2026-05-14 (Round 2).
> Lens: CORE / ADDITIVE / TRAP.

---

## The big structural lesson from 6 enterprise design systems

Every one of Primer, Polaris, Carbon, Spectrum, Geist, and Material 3 converged on a **three-layer token hierarchy** (primitives → semantic/functional → component) and every one of them publishes engineering blog posts about wishing they had done it earlier. Primer's primitives package even uses W3C-compliant JSON specifically so it can re-export to web, iOS, and Android — a structural choice that is invisible at month one and decisive at month twenty-four. ([Primer DESIGN_TOKENS_GUIDE](https://github.com/primer/primitives/blob/main/DESIGN_TOKENS_GUIDE.md), [Polaris tokens monorepo](https://github.com/Shopify/polaris-tokens))

Tailwind v4's `@theme` directive lands exactly on this seam. Every token you declare with `@theme` becomes both a utility class (`bg-primary-500`) and a runtime CSS custom property (`var(--color-primary-500)`) in one stroke. That means the cheapest possible day-one setup — Tailwind v4 + shadcn — already gives you the structural surface to evolve into a Primer-style system later, **provided** you treat `@theme` as a 3-layer namespace from day one rather than a flat color bag. ([Tailwind v4 announcement](https://tailwindcss.com/blog/tailwindcss-v4), [Mavik Labs token architecture](https://www.maviklabs.com/blog/design-tokens-tailwind-v4-2026/))

## Findings by dimension

**1. Tokens architecture (CORE).** Declare three layers in CSS now even if you only fill two: `--color-brand-purple-600` (primitive) → `--color-action-primary` (semantic) → component-local. The Mavik Labs writeup names this explicitly: "Never skip semantic tokens — they're what makes refactors safe." Style Dictionary is overkill for a web-only Flutter-companion site; only adopt it the day you need to share tokens with the Flutter app, which you eventually will. That's the trigger to extract `@quilty/tokens` as a JSON-first package consumable by both. Tokens Studio + Figma sync is ADDITIVE — wait until you have a designer.

**2. shadcn → owned design system migration (CORE seam, ADDITIVE execution).** shadcn isn't a library you install; it's source code you own from minute one. The migration story is therefore "rename the folder." The real seam is putting shadcn output into a `packages/ui` workspace path (even in a single-app repo) using shadcn's monorepo support — `@workspace/ui/components` alias works in a non-monorepo too. Do this on day one; you avoid a refactor when the marketing site and member portal diverge. ([shadcn monorepo docs](https://ui.shadcn.com/docs/monorepo))

**3. Component governance (CORE convention, ADDITIVE extraction).** The boundary that matters: a `components/ui/` folder for shadcn-owned primitives that you may regenerate, and `components/app/` for in-house composed components. Don't edit shadcn primitives directly; wrap them. This single rule defers the monorepo decision indefinitely.

**4. Storybook (ADDITIVE, possibly TRAP).** Universal advice: Storybook becomes worthwhile past ~50 components or when designers join. Below that it's documentation overhead. For Quilty in 2026, skip it. Revisit when you hire a designer or when the portal exceeds ~30 distinct components. The accessibility addon is the only piece worth pulling in early — and you can get that from axe-playwright instead.

**5. Accessibility infrastructure (CORE).** This is the single biggest structural decision because of **EAA enforcement on 28 June 2025**: any consumer service with >10 employees offered to EU users must conform to WCAG 2.2 AA, with national regulators already publishing non-compliance lists. For a HIPAA-aligned mental-health product the reputational cost of an EAA finding is asymmetric. Structural setup (do now):
- `@axe-core/playwright` wired into Playwright e2e tests with `AxeBuilder().withTags(['wcag2a','wcag2aa','wcag22aa'])` — fail-the-build on violations
- ESLint `eslint-plugin-jsx-a11y` in pre-commit
- Document the 40–43% automation ceiling (Deque's own figure — axe catches ~57% by volume) and budget for a **manual audit before EU launch** by a service like TPGi or Deque
- Keyboard-trap and focus-management tests as Playwright user flows, not unit tests

The audit-fix cycle is the trap — Sheri Byrne-Haber's much-cited "you can't audit your way into accessibility culture" is the conventional wisdom now. Bake it into CI from commit one.

**6. Animation (ADDITIVE).** Motion (formerly Framer Motion, 30M+ monthly downloads) is the safe default but is not structural. The View Transitions API now has Baseline support (Chrome 111+, Safari 18+, Firefox 133+) and is the right choice for page-level transitions; reserve Motion for interactive gestures and complex orchestration. Pick neither now — install Motion the day you have an actual animation requirement.

**7. Dark mode (CORE setup, ADDITIVE rollout).** Decide the token architecture for dark mode NOW; ship the feature later. Tailwind v4 + CSS variables makes this O(1): swap `:root` overrides in a `[data-theme="dark"]` selector. The retrofit cost when you skip this is rewriting every color reference — 2-3 month industry average. ([Frontend Tools 2025 guide](https://www.frontendtools.tech/blog/css-variables-guide-design-tokens-theming-2025))

**8. Performance ceiling (CORE).** Three irreversible-if-skipped decisions: (a) `next/font` with `display: swap` and `adjustFontFallback: true` — this single config flag prevents most CLS; (b) `next/image` with `priority` on exactly one above-fold image and accurate `sizes`; (c) one variable font file, not multiple weights. Real measured impact: 55% LCP, 57% INP, 93% CLS improvement when these three are wired correctly per the Patterns.dev guide.

**9. Icons (CORE choice, trivial execution).** Lucide React. 29M weekly downloads, tree-shakes per-icon, ships ~1KB per icon, integrates with shadcn defaults. Heroicons if you want fewer icons hand-polished by the Tailwind team. Iconify only if you need 100+ icon sets — overkill here.

---

## CORE / ADDITIVE / TRAP

| Decision | Verdict | Do now? |
|---|---|---|
| Tailwind v4 + `@theme` with 3-layer token namespace (primitive/semantic/component) | CORE | Yes — name them now even if half are empty |
| shadcn components in `components/ui/` + wrap-don't-edit rule | CORE | Yes — convention, no code cost |
| `@axe-core/playwright` + jsx-a11y ESLint + CI fail-on-violation | CORE | Yes — EAA enforces June 2025 |
| Dark-mode-ready CSS variable architecture (light tokens with `[data-theme]` switch hook) | CORE | Yes — feature ships later, structure now |
| `next/font` variable font + `next/image` priority/sizes discipline | CORE | Yes — irreversible CLS/LCP cost otherwise |
| Lucide icons | CORE | Yes — pick once |
| Style Dictionary + `@quilty/tokens` package | ADDITIVE | Defer until Flutter app needs token parity |
| Tokens Studio / Figma sync | ADDITIVE | Defer until you hire a designer |
| Storybook | ADDITIVE / borderline TRAP | Defer past ~50 components |
| Motion / Framer Motion | ADDITIVE | Install when first real animation lands |
| View Transitions API | ADDITIVE | Use for route transitions when you want them |
| Monorepo + extracted UI package | ADDITIVE | Defer until second consuming app exists |
| Full owned design system (Primer/Polaris-class) | TRAP | Day-one is premature; the 3-layer token seam protects future-you |
| Manual EU accessibility audit | CORE (deferred) | Budget for pre-EU-launch — automation only catches ~40-57% |
| WCAG 2.2 AAA targets | TRAP | AA is the legal floor and the industry ceiling for consumer |

The single sentence: **adopt Tailwind v4 + shadcn with three-layer token names, axe-core in CI, and `next/font`/`next/image` discipline on day one; defer everything else until a real trigger fires.**

## Sources

- [Tailwind CSS v4.0 launch](https://tailwindcss.com/blog/tailwindcss-v4)
- [Design Tokens That Scale (Tailwind v4 + CSS Vars)](https://www.maviklabs.com/blog/design-tokens-tailwind-v4-2026/)
- [Building a Production Design System with Tailwind v4](https://dev.to/saswatapal/building-a-production-design-system-with-tailwind-css-v4-1d9e)
- [Style Dictionary + Tokens Studio docs](https://docs.tokens.studio/transform-tokens/style-dictionary)
- [shadcn/ui Monorepo docs](https://ui.shadcn.com/docs/monorepo)
- [Vercel Geist introduction](https://vercel.com/geist/introduction)
- [Shopify polaris-tokens monorepo](https://github.com/Shopify/polaris-tokens)
- [Primer DESIGN_TOKENS_GUIDE](https://github.com/primer/primitives/blob/main/DESIGN_TOKENS_GUIDE.md)
- [IBM Carbon Design System](https://carbondesignsystem.com/designing/get-started/)
- [Adobe Spectrum tokens](https://spectrum.adobe.com/page/design-tokens/)
- [Playwright accessibility testing docs](https://playwright.dev/docs/accessibility-testing)
- [axe-core (Deque)](https://www.deque.com/axe/axe-core/)
- [EAA June 2025 readiness — AccessibleEU](https://accessible-eu-centre.ec.europa.eu/content-corner/news/eaa-comes-effect-june-2025-are-you-ready-2025-01-31_en)
- [Sheri Byrne-Haber: you can't audit your way into accessibility](https://www.sheribyrnehaber.com/you-cant-audit-your-way-into-accessibility-culture-change/)
- [Optimize Next.js Core Web Vitals (Patterns.dev)](https://www.patterns.dev/react/nextjs-vitals/)
- [Lucide vs Heroicons vs Phosphor 2026](https://www.pkgpulse.com/guides/lucide-vs-heroicons-vs-phosphor-react-icon-libraries-2026)
- [CSS Variables Guide: Design Tokens & Theming](https://www.frontendtools.tech/blog/css-variables-guide-design-tokens-theming-2025)
