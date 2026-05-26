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

## Accepted ADRs

| #                                             | Title                               | Captures                                                                                                                                                                                                                                           |
| --------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [0000](0000-template.md)                      | Template                            | Nygard format                                                                                                                                                                                                                                      |
| [0001](0001-monorepo-shape.md)                | Monorepo shape                      | D4 + D49 + D69 (Turborepo + pnpm; `apps/web` + `packages/shared-types`; drop empty `packages/ui` until extraction trigger)                                                                                                                         |
| [0002](0002-session-cookie-pattern.md)        | Session cookie pattern              | D7 + D8 + D9 + D10 + D11 + D51 + D52 + D53 + D54 + D55 (opaque session-ID + DynamoDB + EventBridge fan-out; NOT iron-session; NOT OIDC BCL because Cognito doesn't support it; CSRF triple-layer; step-up via `prompt=login`; in-app backup codes) |
| [0003](0003-openapi-codegen-direction.md)     | OpenAPI codegen direction           | D46 + D48 (Rust utoipa → `@quilty/api-types` published to GitHub Packages; website re-exports via `packages/shared-types`; never git submodules)                                                                                                   |
| [0004](0004-observability-stack.md)           | Observability stack                 | D38 + D40 + D41 + D42a + D42b + D42d + D43 + D56 + D61 + D67 + D68 (Sentry Business + Amplitude per-2026-05-19 pivot + CloudWatch + OTel-first + W3C tracecontext + PHI sanitizer + replay vendor pick)                                            |
| [0005](0005-csp-two-tier.md)                  | Two-tier CSP                        | D32 + D33 + D34 + D35 + D57 + D58 + D59 + D60 + D61 (per-route CSP in `proxy.ts`; marketing static / portal nonce; Trusted Types report-only; COOP/CORP/nosniff; HSTS ramp; Sentry as report-uri)                                                  |
| [0006](0006-content-layer.md)                 | Content layer                       | D24 + D29 + D30 + D64 + D65 (Velite + Zod-validated MDX + typed block discriminated union + `<BlockRenderer>` → Sanity Enterprise at trigger)                                                                                                      |
| [0007](0007-early-dev-tooling-adoption.md)    | Early dev-tooling adoption          | D70-D74 (Knip + syncpack + dependency-cruiser + size-limit + Lighthouse CI + commitlint + secretlint + csp_evaluator + Sentry Spotlight at M1+1, not deferred to scale-fire)                                                                       |
| [0008](0008-modular-monolith.md)              | Modular monolith                    | Workspace packages as logical module boundaries inside a single deployable; defer multi-deployable extraction until a second consumer demands it                                                                                                   |
| [0009](0009-hexagonal-by-boundary.md)         | Hexagonal-by-boundary               | Ports + adapters + fakes + factory wrappers; ports owned by the providing package, not the consumer                                                                                                                                                |
| [0010](0010-composition-root.md)              | Composition root                    | D77 + D78 + D79 (per-runtime composition.{server,client,edge}.ts + globalThis singleton anchor; vendor SDK chokepoint outside lib/observability/; cross-package barrel rule)                                                                       |
| [0011](0011-container-discriminated-union.md) | Container as discriminated union    | ServerContainer / ClientContainer / EdgeContainer tagged by `runtime` literal so server-only ports are statically inaccessible from client code                                                                                                    |
| [0012](0012-canonical-form-pattern.md)        | Canonical 8-piece form pattern      | RHF + Zod + CSRF + honeypot + time-trap + Turnstile + rate-limit + idempotency — the locked form-input pattern across the website tier                                                                                                             |
| [0013](0013-phi-scrubber-port.md)             | PHIScrubber port                    | D67 + D148 3-layer PHI defense (author-time ESLint + runtime value-pattern regex + sink-side PHIScrubber port) closing the Cerebral $7M capability+configuration gap                                                                               |
| [0014](0014-port-adapter-naming.md)           | Port-adapter naming (META-1)        | Role-shaped PascalCase ports + `make<Vendor><PortName>()` adapter factories + `@quilty/<kebab-case-role>` packages + `makeInMemory<PortName>()` test fakes; enforced by ESLint + dep-cruiser + Plop validators                                     |
| [0015](0015-monorepo-packaging-tooling.md)    | Monorepo packaging tooling (META-5) | `turbo gen` 5-generator suite (package + port + adapter + fake + utility-package) for canonical-shape scaffolding; Plop bundled via Turborepo 2.2+; Knip-aware                                                                                     |

## Planned-but-not-yet-written ADRs

These remain on the wishlist — load-bearing decisions worth dedicated ADRs
that are currently only captured in the strategy doc D-decisions:

1. **BFF pattern (D5)** — most-referenced decision in existing ADRs; deserves its own.
2. **Zero-PHI on web tier (D31)** — Cerebral $7M lesson; currently scattered across ADR-0002 + ADR-0004 + ADR-0005 + CLAUDE.md.
3. **Locale routing `/[locale]/` (D14 + D25 + S1)** — retrofit-hostile + non-obvious.
4. **ConsentState server-side single source of truth (D35 + D62 + D63 + D63 two-table revision)** — edge-set, server-rendered, mask-all default.
5. **HSTS preload ramp (D60)** — irreversible 6-12 month commitment.
6. **Deferred-restructuring meta-decision (D49 + D69)** — "don't scaffold empty workspaces; defer until trigger fires."
7. **SST as IaC choice (D2)** — vs Terraform-only, AWS CDK, SAM, Serverless Framework.
8. **Cognito Managed Login at `auth.my-quilty.com` (D6)** — vs embedded auth, Auth0/Clerk/WorkOS, custom Cognito UI.
9. **Tailwind v4 CSS-first + 3-layer token namespace (D17 + D18 + D20)** — wrap-don't-edit shadcn discipline + dark-mode-ready token architecture.

These will land as their decision context stabilises. The strategy doc
D-decisions are the binding authority in the meantime.
