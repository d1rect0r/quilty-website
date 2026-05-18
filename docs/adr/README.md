# Architecture Decision Records

> Lightweight log of non-obvious architectural choices, following
> [Michael Nygard's ADR format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions).
> Each ADR captures the WHY of a single load-bearing decision so future readers
> (humans + AI) don't have to reverse-engineer it from code.

## When to write an ADR

Write one when:
- The decision is **non-obvious** from the code (someone could plausibly choose differently)
- The decision is **expensive to reverse** (refactor cost > a couple of hours)
- The decision has **systemic implications** (touches multiple modules, milestones, or vendor contracts)
- The decision **rejects a popular alternative** for a specific reason that won't be obvious later

Don't write one for:
- File naming conventions (codify in `eslint` or `prettier`)
- Library version bumps (Renovate handles this)
- Bug fixes (use the commit message)
- Trivial refactors

## Format

Each ADR uses [`0000-template.md`](0000-template.md) — Michael Nygard's structure:

- **Status** — Accepted / Proposed / Deprecated / Superseded by ADR-NNNN
- **Context** — the problem we're solving + the forces at play
- **Decision** — what we decided
- **Consequences** — positive + negative + neutral
- **Alternatives considered** — what we deliberately rejected
- **Related** — links to other ADRs, strategy-doc D-numbers, research files

## File-naming convention

`NNNN-kebab-case-title.md` where `NNNN` is a 4-digit zero-padded sequence.
Numbers are never reused. When an ADR is superseded, leave the file in place
with `Status: Superseded by ADR-NNNN` and write a new file with the next
sequence number.

## Strategy-doc relationship

ADRs are the **detailed WHY** for a single decision. The strategy doc
(`docs/website_strategy_discussion.md`) holds the **D1-D69 decision log**
with one-paragraph rationales. The roadmap (`docs/website_workflow_roadmap.md`)
holds the **milestone WHAT-and-WHEN**.

- Need to know the full rationale + alternatives for one decision? → ADR.
- Need to know all decisions and how they relate? → strategy doc.
- Need to know what to build this milestone? → roadmap.

## Initial ADR set (M1 scaffold)

| # | Title | Captures |
|---|---|---|
| [0000](0000-template.md) | Template | Nygard format |
| [0001](0001-monorepo-shape.md) | Monorepo shape | D4 + D49 + D69 (Turborepo + pnpm; `apps/web` + `packages/shared-types` at M1; drop empty `packages/ui` until extraction trigger) |
| [0002](0002-session-cookie-pattern.md) | Session cookie pattern | D7 + D8 + D9 + D10 + D11 + D51 + D52 + D53 + D54 + D55 (opaque session-ID + DynamoDB + EventBridge fan-out; NOT iron-session; NOT OIDC BCL because Cognito doesn't support it; CSRF triple-layer; step-up via `prompt=login`; in-app backup codes) |
| [0003](0003-openapi-codegen-direction.md) | OpenAPI codegen direction | D46 + D48 (Rust utoipa → `@quilty/api-types` published to GitHub Packages; website re-exports via `packages/shared-types`; never git submodules) |
| [0004](0004-observability-stack.md) | Observability stack | D38 + D40 + D41 + D42a + D42b + D42d + D43 + D56 + D61 + D67 + D68 (Sentry Business + PostHog Cloud Boost + CloudWatch + OTel-first + W3C tracecontext + PHI sanitizer + replay vendor pick) |
| [0005](0005-csp-two-tier.md) | Two-tier CSP | D32 + D33 + D34 + D35 + D57 + D58 + D59 + D60 + D61 (per-route CSP in `proxy.ts`; marketing static / portal nonce; Trusted Types report-only; COOP/CORP/nosniff; HSTS ramp; Sentry as report-uri) |
| [0006](0006-content-layer.md) | Content layer | D24 + D29 + D30 + D64 + D65 (Velite + Zod-validated MDX + typed block discriminated union + `<BlockRenderer>` → Sanity Enterprise at trigger) |

## Planned-but-not-yet-written ADRs (deferred to follow-up commits)

Round-5 review flagged these as load-bearing decisions worth dedicated ADRs.
Currently captured in the strategy doc D-decisions but not yet expanded in
Nygard format. Priority order:

1. **ADR-0007 BFF pattern (D5)** — load-bearing for auth + observability + PHI boundary + OpenAPI codegen direction. The single most-referenced decision in the existing ADRs.
2. **ADR-0008 Zero-PHI on web tier (D31)** — the most consequential operational rule (Cerebral $7M lesson). Currently scattered across ADR-0002 + ADR-0004 + ADR-0005 + CLAUDE.md.
3. **ADR-0009 Locale routing `/[locale]/` from M1 (D14 + D25 + S1)** — retrofit-hostile + non-obvious. Referenced by 0005 (CSP route matching) and 0006 (content i18n).
4. **ADR-0010 ConsentState server-side single source of truth (D35 + D62 + D63)** — edge-set, server-rendered, mask-all default.
5. **ADR-0011 HSTS preload ramp (D60)** — irreversible 6-12 month commitment; deserves dedicated decision with 7-stage ramp + rollback impossibility.
6. **ADR-0012 Deferred-restructuring meta-decision (D49 + D69)** — "don't scaffold empty workspaces; defer until trigger fires."
7. **ADR-0013 SST as IaC choice (D2)** — vs Terraform-only, AWS CDK, SAM, Serverless Framework.
8. **ADR-0014 Cognito Managed Login at `auth.my-quilty.com` (D6)** — vs embedded auth, Auth0/Clerk/WorkOS, custom Cognito UI.
9. **ADR-0015 Tailwind v4 CSS-first + 3-layer token namespace (D17 + D18 + D20)** — wrap-don't-edit shadcn discipline + dark-mode-ready token architecture.

These land in follow-up commits as time + clarity allow. The strategy doc D-decisions are the binding authority in the meantime.
