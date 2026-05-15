---
name: scaffold-page
description: Scaffold a Next.js App Router page with generateMetadata, canonical URL, JSON-LD where appropriate, sitemap entry, and a Playwright smoke test. Use when adding a new marketing or content page.
argument-hint: [route-path] [page-purpose]
---

Scaffold a Next.js App Router page at route `$1` whose purpose is: $2

## Steps

1. **Create `apps/web/app$1/page.tsx`** as a Server Component by default. Add `'use client'` only if interactivity demands it.

2. **Add `generateMetadata`** returning:
   - `title` (50-60 chars)
   - `description` (140-160 chars)
   - `alternates.canonical` (absolute, uses `metadataBase`)
   - `openGraph` (type, title, description, images)
   - `twitter` (card, title, description, images)

3. **If the page describes a medical condition, symptom, treatment, or therapy modality**, add `<Script type="application/ld+json">` with `MedicalWebPage` schema including `medicalAudience` and `lastReviewed` (per D27).

4. **Append the route to `apps/web/app/sitemap.ts`** with a sensible `lastModified`, `changeFrequency`, and `priority`.

5. **Create `apps/web/tests/e2e/<route>.spec.ts`** with a smoke test:
   - Page loads (200)
   - Canonical link tag exists
   - OG image URL resolves (200)
   - Title is set
   - No axe-core violations (WCAG 2.2 AA tags)
   - Lighthouse a11y score >= 95 (harmonised with `/audit-a11y` gate)

## After scaffolding

Run `pnpm --filter web typecheck && pnpm --filter web test:e2e -- <route>` and report. Do NOT push.

## Block library reminder

Compose the page from the locked marketing block library (D29): Hero, ValueProp, FeatureGrid, FAQ, TestimonialQuote, CTABanner. Don't introduce one-off layouts unless the page genuinely needs it (then file an ADR).
