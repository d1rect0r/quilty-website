# Quilty Website

Quilty's public-facing website — marketing, account portal, and subscription management surface for [Quilty](https://my-quilty.com).

## Status

**M1 scaffold-in-progress (2026-05-18).** Cloudflare Pages scaffold soft-nuked 2026-05-15. Round-5 independent architecture review locked 2026-05-17.

## Documentation

- [`docs/website_strategy_discussion.md`](docs/website_strategy_discussion.md) — locked architectural decisions (D1-D49 + Round-5 revisions + D50-D69 + U1-U8) with rationale
- [`docs/website_workflow_roadmap.md`](docs/website_workflow_roadmap.md) — milestone roadmap + operational playbook
- [`docs/research/`](docs/research/) — research artifacts: 8 reports from rounds 1-2 + the 11-file Round-5 independent audit at `docs/research/round_5_independent_review/`
- `docs/adr/` — Architecture Decision Records (Nygard format) *(landing in Commit 2 of M1 scaffold)*
- [`CLAUDE.md`](CLAUDE.md) — orientation doc for AI assistance

## Stack (locked, scaffold in progress)

- **Framework:** Next.js 16 App Router + TypeScript strict
- **Styling:** Tailwind v4 CSS-first `@theme` in `globals.css` (no `tailwind.config.ts`) + shadcn/ui
- **Deploy:** SST 4.x (Ion engine + Pulumi + OpenNext) on AWS
- **Observability:** Sentry Business (errors + RUM + error-triggered replay) + PostHog Cloud Boost (analytics + consent-gated replay + flags + experiments) — both with HIPAA BAA. Mobile keeps Amplitude separately.
- **Auth:** AWS Cognito Managed Login at `auth.my-quilty.com`, BFF via Next.js Route Handlers, opaque session-ID + DynamoDB store
- **Backend:** Rust (separate, in `quilty-aws` — communicated via OpenAPI + authenticated HTTPS)

## Quick start

Will populate during M1 scaffold. See [`docs/website_workflow_roadmap.md`](docs/website_workflow_roadmap.md) § M1 for the exact deliverable list.

## License

Proprietary. © Quilty. All rights reserved.
