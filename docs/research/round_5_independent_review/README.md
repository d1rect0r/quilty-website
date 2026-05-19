# Round 5 — Independent Architecture Review (2026-05-17)

> Pre-scaffold audit of the D1-D49 strategy decisions against 2026 enterprise reality.
> Goal: surface drift, contradictions, retrofit-hostile gaps, and vendor-economics
> realities before M1 scaffold lands a single file.

## Methodology

9 parallel research agents (6 online enterprise-pattern + 3 codebase/docs):

1. **No project context** — each agent treated the decision list as anonymous input
2. **2025-2026 sources only** — Web Almanac 2025, IETF OAuth BCP draft-26, Next.js 16/16.2 docs, OWASP, AWS Cognito docs, schema.org v30.0, WCAG 2.2 ISO/IEC 40500:2025, MDN Baseline Feb 2026, PCI DSS 4.0.1, CCPA §7025(c)(6) effective 2026-01-01
3. **"What would Discord/Stripe/Linear/Cal.com/PostHog do" lens** — single examples discarded as weak; ≥2 enterprise references required per pattern
4. **Open-source code reads** — Cal.com (`github.com/calcom/cal.com`) and PostHog (`github.com/PostHog/posthog.com`) used heavily as gold-reference monorepos

## File index

| #   | File                                                                    | Scope                                                                                                                                                                                                                                   |
| --- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | [marketing-portal-patterns.md](01-marketing-portal-patterns.md)         | URL conventions, route groups, marketing block library, portal navigation, footer/legal, sign-in surface, IA — anchored Calm/Oura/Headspace/Stripe/Linear/Cal.com/Vercel evidence                                                       |
| 02  | [monorepo-tooling.md](02-monorepo-tooling.md)                           | Turborepo vs Nx, pnpm 9 vs 10, Node 22 vs 24 LTS, SST 4.x state, Biome vs ESLint, Husky vs Lefthook, Vitest/Playwright shape, CI YAML, shadcn CLI, SBOM                                                                                 |
| 03  | [csp-security.md](03-csp-security.md)                                   | Two-tier CSP, Trusted Types, COOP/CORP/COEP, HSTS preload ramp, SRI on Stripe.js (impossible), Permissions-Policy, consent gating, WAF + Turnstile, PCI DSS 4.0.1 §6.4.3/§11.6.1                                                        |
| 04  | [auth-session-cognito.md](04-auth-session-cognito.md)                   | BFF pattern, `__Host-` cookies, opaque session-ID vs sealed cookie, Cognito 2026 capability matrix (passkeys YES, OIDC BCL NO, `sid` claim NO), step-up auth, mobile-web session join                                                   |
| 05  | [observability-analytics-flags.md](05-observability-analytics-flags.md) | Sentry vs PostHog vs Amplitude vendor economics, BAA tier verification, OTel-first via @vercel/otel, W3C traceparent, web-vitals, replay vendor masking comparison, LaunchDarkly Oct 2025 outage lesson                                 |
| 06  | [i18n-seo-content.md](06-i18n-seo-content.md)                           | next-intl vs Paraglide, locale segment strategy, metadata baseline, sitemap at scale, schema.org reality (FAQPage retired May 2026, MedicalWebPage not Google-rich-result), AI crawler policy, MDX vs CMS, content layer = Velite + Zod |
| 07  | [a11y-wcag-eaa.md](07-a11y-wcag-eaa.md)                                 | axe-core + jsx-a11y, WCAG 2.2 AA tag config, EAA enforcement reality (France/Ireland/Spain), shadcn audit, focus management in App Router, manual audit cadence + budget, overlay prohibition (FTC settled)                             |
| 08  | [strategy-doc-audit.md](08-strategy-doc-audit.md)                       | D1-D49 audit against the 8 underlying research reports — drift, contradictions, silent assumptions, CLAUDE.md vs strategy doc coherence, roadmap drift                                                                                  |
| 09  | [cross-repo-coordination.md](09-cross-repo-coordination.md)             | quilty-website ↔ quilty-aws integration surface, Cognito SSM registry, OpenAPI codegen pipeline, Phase 0 → Phase 1 migration runbook, SES sandbox status                                                                                |
| 10  | [harness-hooks-verification.md](10-harness-hooks-verification.md)       | `.claude/` harness inventory, hook block patterns, permission analysis, M1 scaffold workflow plan, gaps to fix in flight (reconstructed from agent's chat-returned deliverable)                                                         |
| –   | [synthesis.md](synthesis.md)                                            | Cross-cutting findings: 11 decision revisions, 20 new decisions (D50-D69), 8 UX/sequencing locks (U1-U8), retrofit-hostile gaps consolidated _(no numeric prefix; sits alongside the agent deliverables as the synthesis index)_        |

## Headline findings

- **11 decision revisions** needed against D1-D49 baseline (SST 3.x→4.x; Cognito doesn't ship OIDC Back-Channel Logout or `sid` claim; Stripe doesn't publish SRI hashes; Tailwind v4 CSS-first contradicts roadmap; FAQPage rich-result retired May 7 2026; PostHog Boost beats Amplitude Enterprise for HIPAA-aligned web tier; Node 22 enters Maintenance LTS 2026-05-13; Next.js 16 renamed `middleware.ts` → `proxy.ts`)
- **20 new decisions to lock (D50-D69)** — opaque session-ID + DynamoDB (NOT iron-session), OTel-first via `@vercel/otel`, Trusted Types report-only, COOP/CORP/nosniff additions, two-tier CSP (per-route, not nonce-everywhere), HSTS preload deferred to launch gate, CCPA §7025(c)(6) GPC visible indicator, content layer = Velite + Zod, typed block discriminated union, AI crawler policy, PHI sanitizer module + ESLint custom rules, replay vendor pick = Sentry+PostHog with block-class on clinical controls
- **Strong confirmations** for D1, D3-D8, D10, D12-D16, D18-D26, D28, D31-D33, D35-D41, D45-D49 — all keep with minor caveats
- **Harness gap discovered:** `guard-bash.sh` blocks `sst remove` even with `--stage` → `/sst-destroy-previews` skill is dead-on-arrival; needs patch (Claude can't edit `.claude/hooks/`; user must apply)

## How to use this archive

- Each numbered file is the full agent deliverable, anchored in cited 2026 sources
- `synthesis.md` consolidates the cross-cutting view used to drive the M1 plan
- Strategy doc revisions land in `docs/website_strategy_discussion.md` (Round 5 section + revised D-entries + Update Log)
- ADRs `docs/adr/0001-0006` reference these files for the "why"
