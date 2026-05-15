# Quilty Website

Quilty's public-facing website — marketing, account portal, and subscription management surface for [Quilty](https://my-quilty.com).

## Status

**Pre-scaffold.** Cloudflare Pages scaffold soft-nuked 2026-05-15. Migration to Next.js + SST in progress (M1).

## Documentation

- [`docs/website_strategy_discussion.md`](docs/website_strategy_discussion.md) — locked architectural decisions (D1-D49) with rationale
- [`docs/website_workflow_roadmap.md`](docs/website_workflow_roadmap.md) — milestone roadmap + operational playbook
- [`docs/research/`](docs/research/) — research reports informing decisions
- [`CLAUDE.md`](CLAUDE.md) — orientation doc for AI assistance

## Stack (locked, scaffold pending)

- **Framework:** Next.js 16 App Router + TypeScript strict
- **Styling:** Tailwind v4 + shadcn/ui
- **Deploy:** SST (OpenNext) on AWS
- **Observability:** Sentry (errors + RUM) + Amplitude (analytics, pre-launch)
- **Auth:** AWS Cognito Hosted UI at `auth.my-quilty.com`, BFF via Next.js Route Handlers
- **Backend:** Rust (separate, in `quilty-aws` — communicated via OpenAPI + authenticated HTTPS)

## Quick start

Will populate during M1 scaffold. See [`docs/website_workflow_roadmap.md`](docs/website_workflow_roadmap.md) § M1 for the exact deliverable list.

## License

Proprietary. © Quilty. All rights reserved.
