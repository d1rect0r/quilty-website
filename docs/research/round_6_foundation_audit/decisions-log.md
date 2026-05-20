# Round 6 — Sequential Decision Log

> Append-only ledger of every decision locked during the Round 6 sequential review (2026-05-19+). Each entry: D-number / item-ID, final decision text, rationale, source, locked-at timestamp, locked-by.
>
> When this log is complete, the locked decisions are batch-promoted into `docs/website_strategy_discussion.md` + new ADRs 0008-0011. Until then THIS file is the source of truth.

## Format per entry

```
### <D-NUMBER or ITEM-ID> — <one-line title>

- **Locked**: 2026-05-DD HH:MM
- **Status**: confirmed-as-recommended | revised | rejected
- **Source**: <Round 6 agent / explore probe / user instruction / strategy doc revision>

**Decision:**
<final text>

**Rationale:**
<1-2 sentences>

**Binds:**
<downstream effect — code, infra, other decisions>
```

---

## Decisions locked

### A1.1 — Amplitude is the all-in `Analytics` adapter

- **Locked**: 2026-05-19 21:30
- **Status**: confirmed-as-recommended
- **Source**: user instruction (2026-05-19) overriding service-stack-coherence agent's reversal recommendation

**Decision:**
The `Analytics` port adapter for web + mobile is Amplitude. PostHog is legacy and being migrated out of mobile once mobile's auth migration completes. M1.5 ships without BAA; upgrade to Amplitude Enterprise pre-launch.

**Rationale:**
Cross-platform analytics consolidation; Headspace precedent; best-in-class for product analytics; mobile client team has committed to migrate.

**Binds:**

- D42b retained as 2026-05-19 revised
- D43 → Amplitude Experiment at trigger (post-launch flag activation requirement)
- D68 reframed (per-config replay discipline — see B.5)
- Code cleanup at M1.5: remove PostHog refs from `track.ts`, `replay-classes.ts`, ESLint vendor-SDK list; replace with Amplitude vendor entries
- `packages/observability/src/adapters/amplitude-analytics.ts` is the M1.5 adapter file
- Mobile timeline: migrates after auth-migration C5-C9 clusters complete

---

### A1.2 — Two-TLD: `.com` public-facing, `.app` internal/interim

- **Locked**: 2026-05-19 21:30
- **Status**: confirmed-as-recommended
- **Source**: user instruction (2026-05-19) overriding service-stack-coherence agent's "two-TLD permanent" recommendation

**Decision:**
`my-quilty.com` is the canonical public-facing domain. `my-quilty.app` is internal/migration interim. Mobile client team migrates to `.com` once their auth migration completes.

**Rationale:**
Consumer marketing has clear preference for `.com`; `.app` was an interim choice during mobile-focused infra build; consolidation reduces operational surface long-term.

**Binds:**

- D45 wording updated (strategy doc revision — see B.5)
- Web infra ships on `.com` at M1.5 / next-sprint AWS work
- Mobile migrates to `.com` after auth migration C5-C9 completes
- AASA + assetlinks eventually consolidate at `.com`; dual-domain interim acceptable
- Cookie domain discipline stays `__Host-` (per-subdomain), works regardless

---

### A1.3 — AASA narrow scope + fix 2 shipped bugs

- **Locked**: 2026-05-19 21:30
- **Status**: confirmed-as-recommended
- **Source**: user confirmation + deeplinks agent (`07-deeplinks-error-resilience.md`)

**Decision:**
AASA file claims only paths that route to real intents-to-deep-link: `/account/security/passkeys`, `/auth/magic-link` (when shipped), `/account/data/export` (when shipped). Marketing routes NOT claimed. The two shipped bugs (paths/components divergence for `/magic-link`; 4 claimed paths referencing non-existent routes) are fixed in M1.5.

**Rationale:**
Universal Link interception most valuable for high-intent flows (passkeys, magic links, data export); claiming marketing routes degrades UX (app launches for blog reads).

**Binds:**

- M1.5 commit 11 fixes the 2 production bugs
- AASA claim scope (paths above) matches B.4 D118 auth URL surface lock
- iOS Team ID `7XGU6BN3K3`, bundle `app.quilty.myquilty` (matches CLAUDE.md NEVER list)
- Android package `app.quilty.myquilty` + mobile-team-provided SHA256 fingerprint
- Coordinate with mobile team before any AASA deploy

---

### A1.4 — Auth migration is mature; web auth integration timeline deferred

- **Locked**: 2026-05-19 21:30
- **Status**: confirmed + amended with user intel (deferral)
- **Source**: Explore probes 10 + 11 + user intel (2026-05-19)

**Decision:**
Mobile `quilty_auth` package is C1-C3 shipped + C4 in-progress (2,466 tests, 85.2% coverage). AWS Cognito User Pool PLUS-tier production-shaped; 15 Rust auth crates active dev; EventBridge auth bus wired; session strategy locked (Cognito JWTs + Valkey JTI denylist + refresh rotation). Web BFF `Authenticator` adapter ships against this mature production infra — **no architecture redesign needed.**

**Amendment (user intel 2026-05-19):** Web auth integration is **deferred slightly past M6** as originally anticipated. Server team has cookie-policy + end-to-end-utilization work that's gated on the mobile client reaching readiness. Timeline = "M6+, gated on server-team cookie-policy completion AND mobile client utilization readiness." `packages/auth/` skeleton (ports only) still ships at M1.5.

**Rationale:**
Factual lock + production readiness verification. Deferral reflects real cross-team dependency: cookies-policy work depends on mobile's end-to-end auth being utilizable first.

**Binds:**

- D6 / D9 / D11 / D52-D55 confirmed correct in shape — D9 wording fix only (B.5)
- D11 revision: `cognito_sub` → `quilty_sub` (Rust-backend-issued UUID, swap-resilient)
- `packages/auth/src/ports.ts` (D90 + D92) skeleton ships at M1.5
- M6 (or later) ships the web `Authenticator` + `SessionStore` adapters
- **No DynamoDB session table for the website** — use Cognito + Valkey strategy mobile runs
- Roadmap M6 milestone description updated to reflect deferral conditions
- Web auth integration sprint gated explicitly on (a) server-team cookie-policy work complete, (b) mobile client end-to-end utilization ready

---

### META-1 — Vendor-agnostic naming convention (project-wide)

- **Locked**: 2026-05-19 21:45
- **Status**: confirmed (user direction)
- **Source**: user instruction (2026-05-19)

**Decision:**
All packages, types, interfaces, classes, functions, and variables use **role-shaped vendor-agnostic names**. Vendor names appear ONLY in adapter file names (`packages/<name>/src/adapters/<vendor>.ts`).

Examples:

- ✅ `packages/quilty_auth`, `packages/analytics`, `packages/error_reporter`, `packages/email_sender`, `packages/captcha`, `packages/rate_limiter`
- ❌ `packages/cognito_auth`, `packages/amplitude_analytics`, `packages/sentry_error_reporter`
- Adapter exception: `packages/analytics/src/adapters/amplitude.ts` (vendor name allowed in adapter file ONLY)

No bare `Service` suffix as a catch-all. Roles are described by what the thing IS.

**Rationale:**
Hexagonal architecture discipline at the naming layer. Vendor swaps become one-file changes instead of grep-and-replace exercises. Matches mobile `quilty_auth` package precedent.

**Binds:**

- Section B.1 (D75-D81 architecture decisions) renamed accordingly
- Section B.2 ports stay role-named (`Analytics`, `ErrorReporter`, etc.)
- Section B.3 adapter picks documented by vendor but file paths are role-shaped + adapter-file-name has vendor
- M1.5 refactor of `apps/web/lib/observability/` → `packages/observability/` (NOT `packages/sentry_and_amplitude/`)
- CLAUDE.md update at M1.5 to document this discipline
- New memory entry: `feedback_code_naming_and_comment_discipline.md` (already saved)

---

### META-2 — Code comment scope discipline

- **Locked**: 2026-05-19 21:45
- **Status**: confirmed (user direction)
- **Source**: user instruction (2026-05-19)

**Decision:**
Code comments in production source files explain THE CODE and reference PERMANENT docs. They do NOT reference workflow context (sprints, M-numbers, audit rounds, wave/cluster IDs, agent names, plan steps).

Permissible references in source-file comments: ADR numbers, strategy doc D-numbers, RFC numbers, external standards, concrete bug refs.

Forbidden in source-file comments: "M1", "M1.5", "Round 5", "the audit", "wave 2", "C3 cluster", "per the plan", agent names.

These belong in PR descriptions, ADRs, decision logs, research archives.

**Rationale:**
Seamless new-dev onboarding. A new engineer reading source 18 months from now should not need internal sprint history to understand the code. Workflow references rot fast.

**Binds:**

- All future commits respect this rule
- Existing M1 + M1+1 source files reviewed during M1.5 refactor (remove workflow refs)
- Permanent docs (README, ADRs, strategy doc, roadmap, runbooks) MAY reference workflow / M-numbers — they're operational by nature
- PR descriptions + commit messages MAY reference workflow — they're ephemeral by design
- New memory entry: `feedback_code_naming_and_comment_discipline.md` (already saved)

---

### META-3 — Test coverage threshold

- **Locked**: 2026-05-19 21:45
- **Status**: confirmed (user direction)
- **Source**: user instruction (2026-05-19)

**Decision:**
**85% line-coverage is the CI floor; 95%+ recommended for load-bearing files** (auth, observability, security, payment, PHI-adjacent).

Mirrors mobile `quilty_auth` package: 85.2% aggregate / per-file ≥95% on load-bearing modules.

**Rationale:**
Strong testing is mandatory for HIPAA-aligned consumer product. Mobile precedent set the bar.

**Binds:**

- M1.5 commit 1 (bootstrap modular monolith) adds Vitest coverage CI gate fail-below-85%
- Per-file coverage targets documented per package in package READMEs
- Type-coverage gate (97% per D70/D72) is companion, not replacement
- Mobile's smoke-test pattern (Tier-A wire-pinning vs prod endpoint) is portable when auth ships

---

### META-4 — Vendor-pick deferral: research enterprise-first, no invention

- **Locked**: 2026-05-19 21:45
- **Status**: confirmed (user direction)
- **Source**: user instruction (2026-05-19)

**Decision:**
For open vendor decisions where the answer is non-obvious (e.g., token storage shape, session strategy on web, marketing email provider), the protocol is: **research what enterprise companies actually ship → replicate**. No invention.

Peer set: Stripe / Linear / Cal.com / Plain / Vercel / Anthropic / Resend / Sentry (general engineering); Headspace / Calm / BetterHelp / Talkspace / Cerebral / Mindbloom (consumer mental health).

**Rationale:**
Round-6 audit pattern proved this works. Invention introduces drift; replication imports already-proven solutions.

**Binds:**

- Open questions in Section C (web token storage shape, web session strategy) wait on enterprise research before lock
- Pattern formalized in memory entry: `feedback_code_naming_and_comment_discipline.md`

---

### A2.1 — Auth port/package architecture details DEFERRED

- **Locked**: 2026-05-19 21:45
- **Status**: DEFERRED (descoped from M1.5)
- **Source**: user instruction (2026-05-19) — server+client still converging, web should not add drift

**Decision:**
Auth port shape, session storage on web, cookie policy, Authenticator adapter wiring — ALL deferred until mobile auth (C5-C9) + server cookie-policy work complete. Web should NOT speculatively lock auth architecture details.

Specifically descoped from M1.5:

- `packages/quilty_auth/` skeleton — DROPPED from M1.5 sprint
- `Authenticator` port shape (D92) — DEFERRED
- `SessionStore` port shape (D90) — DEFERRED
- Web session strategy lock — DEFERRED (research-first; mobile uses Cognito JWTs + Valkey JTI denylist + refresh rotation; web shape TBD)
- Web auth URL surface lock (D118) — DEFERRED beyond M1.5 (sprint plan revision needed)

**Rationale:**
Server moving daily. Both client + web filing changes against server simultaneously creates synchronization overload. Web focuses on non-auth-dependent foundation work. Web auth integration sprint launches only after the server+client convergence stabilizes.

**Binds:**

- M1.5 sprint plan (Section D) revised: drop commit 10 (`packages/auth/` skeleton)
- Section B.4 D118 (auth URL surface lock) DEFERRED
- Section B.2 D90 + D92 DEFERRED
- Section B.3 adapter picks for Authenticator + SessionStore = N/A at M1.5
- Roadmap M6 milestone description updated: "Real auth integration — gated on (a) server cookie-policy work, (b) mobile client end-to-end utilization, (c) post-convergence research lock"
- Auth-shape decisions revisit at the trigger when convergence happens — likely a future Round 7-style audit pass dedicated to auth

---

### A2.2 — Test discipline: ≥85% floor, ≥95% recommended

- **Locked**: 2026-05-19 21:45
- **Status**: confirmed-as-recommended + tightened
- **Source**: Explore probe 10 (mobile `quilty_auth` precedent) + user direction

Captured in META-3 above. Mobile precedent reaffirmed.

---

### A2.3 — Branch `feature/auth-v2-supabase-rip` factual confirmation

- **Locked**: 2026-05-19 21:45
- **Status**: factual lock (no decision needed)
- **Source**: Explore probe 10

**Decision:**
Confirmed factual: Supabase has been intentionally torn out of `quilty_auth`. Zero source-code references. Web side has no Supabase touchpoint. No migration work needed on web for Supabase.

**Binds:**

- No web-side action required
- Strategy doc Supabase mentions (if any) removed during M1.5 strategy doc revision pass

---

### A2.4 — Web token storage shape: DEFERRED to enterprise research

- **Locked**: 2026-05-19 21:45
- **Status**: DEFERRED
- **Source**: user direction (2026-05-19)

**Decision:**
Web token storage approach (HTTP-only `__Host-` cookie vs split access + refresh vs session-ID + DDB store vs JWT + Valkey-mirror, etc.) is DEFERRED until enterprise-pattern research completes. Mobile uses Keychain/Keystore atomic-swap + RxDart `BehaviorSubject` replay-1 — that's mobile-shaped. Web shape needs research.

Research scope (when scheduled): how Stripe / Linear / Cal.com / Plain / Vercel / Anthropic / Resend / Headspace / Calm web tiers store tokens + manage session in their BFF patterns.

**Rationale:**
META-4 (research-first, no invention) applied. Web is different runtime from mobile — direct copy is wrong. Need enterprise pattern.

**Binds:**

- Auth research adds to the "auth convergence" trigger (alongside server cookie-policy + mobile readiness)
- D51 strategy doc revision (B.5) holds — current shape (opaque session-ID + DynamoDB store) was speculation; reframe as "session shape TBD per future research"

---

### A2.5 — Auth NOT priority for M1.5

- **Locked**: 2026-05-19 21:45
- **Status**: DESCOPED from M1.5
- **Source**: user direction (2026-05-19)

**Decision:**
Auth is descoped from M1.5 priorities entirely. M1.5 focuses on **non-auth-blocked foundation work**: observability ports/adapters refactor, security ports/adapters, SEO ports, content ports, consent UI, technical routes, production-bug fixes, forms canonical pattern (non-auth forms like contact + waitlist), legal placeholder pages.

**Rationale:**
Server moving daily; adding web auth work creates synchronization overload. Web has plenty of other foundation work that's not server-blocked. Auth waits for cross-team convergence trigger.

**Binds:**

- M1.5 sprint plan (Section D) refactored: drop auth-related commits + reallocate capacity to other priorities
- M1.5 commit sequence revisions needed
- Web roadmap M6+ explicitly note: "starts after server cookie-policy + mobile utilization-ready convergence trigger"

---

### A2.6 — Wire-codes list will expand iteratively

- **Locked**: 2026-05-19 21:45
- **Status**: factual acknowledgment
- **Source**: user direction + Explore probe 10

**Decision:**
Mobile auth wire-codes catalog (75 codes today in `AUTH_ERROR_CODES.md`) WILL grow as new auth flows ship. Web Authenticator adapter (whenever it ships post-convergence) consumes whatever the canonical wire-codes list is at that time. No web-side action required at M1.5.

**Binds:**

- Future: wire-codes spec is a candidate for `packages/shared-types/` or sibling shared-spec
- Web auth sprint reads then-current `AUTH_ERROR_CODES.md`

---

### A2.7 through A2.18 — AWS Cognito auth-layer facts: factual acknowledgment, NOT locked into M1.5 web decisions

- **Locked**: 2026-05-19 21:45
- **Status**: factual acknowledgment (NOT decision lock)
- **Source**: Explore probe 11 + user direction (2026-05-19)

**Decision:**
The AWS Cognito + Rust auth-layer state (PLUS tier user pool, 15 schema attrs, NIST SP 800-63B-4 password policy, device-tracking disabled, AUDIT-mode threat protection, monolithic-with-split-ready lambda triggers, EventBridge bus + transactional outbox, Cognito-JWT + Valkey-JTI-denylist session strategy, REQUEST authorizer, 15 active Rust crates) is **acknowledged as factually true on the server side** but NOT locked into any web M1.5 decision.

Web follows server with NO RUSH because shape changes daily.

**Specific deferrals:**

- A2.7 Cognito Plus tier — informational only; web doesn't tier-lock at M1.5
- A2.8 MFA (TOTP only, no SMS, no email) — informational; web wire-up at M6+ matches whatever server is at that time
- A2.9 NIST password policy — informational; web sign-up form (M6+) matches server-current
- A2.10 device tracking disabled — informational; web composition wires same
- A2.11 AUDIT threat protection — informational; web's PHI sanitizer allowlist updated when web auth ships
- A2.12 app clients — informational; web confidential BFF client deferred to M6+
- A2.13 custom domain gated false — informational; flip happens at U5 trigger when DNS apex lands (next-sprint AWS work, not M1.5 web work)
- A2.14 Lambda triggers — no web action
- A2.15 EventBridge bus name `quilty-{env}-auth-events` — D9 strategy doc revision (B.5) confirmed
- A2.16 session strategy = Cognito-JWT + Valkey-JTI-denylist + refresh rotation (no DDB session table) — D51 reframe (B.5) needed
- A2.17 REQUEST authorizer with V2-2 fix — informational
- A2.18 15 Rust crates active — informational

**Rationale:**
Server state changes daily. Web shouldn't lock its M1.5 architecture against a moving target. Web's role is to wait for stable convergence, then research-first replicate.

**Binds:**

- Strategy doc revisions of D9 + D51 wording — captured in B.5 batch (revision happens at end-of-M1.5 strategy doc update commit)
- No M1.5 web work depends on these facts
- Future "auth convergence trigger" (post-server-cookie-policy + post-mobile-utilization) launches dedicated auth-shape research + lock pass

---

### A2-Q1 — Roadmap M6 wording: NO change at this time

- **Locked**: 2026-05-19 22:00
- **Status**: confirmed (user direction)

**Decision:**
Roadmap doc keeps M6 as currently written. Auth-convergence deferral is internal context tracked in `decisions-log.md` + ADR-N when we batch-update. By the time M6 is reached, work may already be done; or we may pivot to different work. No premature roadmap edits.

---

### A2-Q2 — `packages/quilty_auth/` strict-dropped from M1.5

- **Locked**: 2026-05-19 22:00
- **Status**: confirmed (user direction — Read A strict)

**Decision:**
`packages/quilty_auth/` is NOT created at M1.5. No directory, no `package.json`, no namespace reservation. Package is created post-convergence-trigger with the full hexagonal layout vended by the packaging tooling (see META-5 below).

**Rationale:**
Stub packages signal phantom work + drift faster than real packages. Naming convention from the mobile precedent (`quilty_auth`) is documented so when the package IS created it lands with the right name.

---

### A2-Q3 — Full code-cleanup sweep during M1.5

- **Locked**: 2026-05-19 22:00
- **Status**: confirmed (user direction)

**Decision:**
After Section A-D decisions are all locked, M1.5 sprint includes a comprehensive code-cleanup sweep:

- Vendor-name → role-name refactor (existing M1 code: rename + move into adapter files)
- Comment scrub: remove all sprint-context / M-number / Round-N / agent-name / cluster references from source files
- Replace removed references with permanent-doc references (ADR-NN, D-NN, RFC numbers) where the underlying intent matters

The sweep is folded into the M1.5 package-extraction commits (NOT a separate "cleanup commit"). Each extracted module gets the cleanup as it moves.

**Binds:**

- M1.5 sprint plan revised: extraction commits perform cleanup inline
- ESLint rule may add a `no-sprint-references-in-source` check (custom rule — investigate at M1.5)

---

### A2-Q4 — Workflow vs permanent docs distinction

- **Locked**: 2026-05-19 22:00
- **Status**: confirmed (user direction — Read A)

**Decision:**
Sprint verification reports (e.g., `docs/m1_verification_report.md`) are workflow artifacts and stay as-shaped — they document a moment in time and are allowed to reference workflow context. Permanent ADRs are the durable abstraction.

**Binds:**

- M1.5 verification report at end of sprint follows same shape
- No retroactive rewrite of `m1_verification_report.md`
- ADRs created during M1.5 capture durable intent of M1+M1.5 work without sprint-narrative

---

### A2-Q5 — Adapter file naming: `<vendor>.ts` in `adapters/` directory

- **Locked**: 2026-05-19 22:00
- **Status**: confirmed (user accepted recommendation)

**Decision:**
Adapter files are named `<vendor>.ts` (lowercase, vendor word only). Directory location `packages/<package>/src/adapters/` declares the role; package name declares the domain capability; adding `<package>` to the filename is redundant.

Examples:

- `packages/analytics/src/adapters/amplitude.ts`
- `packages/error_reporter/src/adapters/sentry.ts`
- `packages/email_sender/src/adapters/ses.ts`
- `packages/captcha/src/adapters/turnstile.ts`
- `packages/rate_limiter/src/adapters/dynamodb.ts`

Test files: `packages/<package>/src/adapters/<vendor>.test.ts` colocated.

**Binds:**

- All adapter files created at M1.5 follow this convention
- Generator templates (META-5) emit this shape

---

### META-5 — Packaging tooling: turbo generator suite at M1.5 (NEW reflection)

- **Locked**: 2026-05-19 22:00
- **Status**: NEW decision surfaced by user reflection prompt
- **Source**: user direction (Q2 reflection)

**Decision:**
Build a turbo-generators suite at M1.5 commit 1 to automate the package-vending ceremony. Modular monolith ceremony (~10 files per new package + ~5 config updates) is automated via `turbo gen`. Three generators at M1.5:

1. **`turbo gen package`** — scaffolds a new workspace package with the hexagonal layout: `package.json`, `tsconfig.json` (with root references), `src/index.ts` (public API barrel), `src/ports.ts` (placeholder for port interfaces), `src/domain/.gitkeep`, `src/adapters/.gitkeep`, `src/__tests__/.gitkeep`, `README.md` (template documenting the package's role). Also auto-updates: Knip config (new workspace entry), dependency-cruiser config (new workspace), size-limit config if package has client-side output.
2. **`turbo gen port`** — adds a new port interface to an existing package. Generates: type signature in `src/ports.ts`, port-test stub in `src/__tests__/<port-name>.contract.test.ts`, fake adapter in `src/adapters/__fakes__/<port-name>.fake.ts` (for use by consumer-package tests).
3. **`turbo gen adapter`** — adds a vendor adapter implementing a port. Generates: `src/adapters/<vendor>.ts` with the port-shaped class skeleton + the contract test reference + a test file colocated. Reminds the engineer to wire the adapter into `apps/web/composition.ts`.

Generators live at `turbo/generators/{config.ts, templates/}`. Templates use Handlebars (turbo gen's native).

**Rationale:**
Modular monolith without tooling is ceremony-heavy → engineers cut corners → package shapes drift → "modular monolith" silently devolves into "scattered file dump." The tooling cost (~half-day to design + write + test) pays back the second package onwards.

Mirrors enterprise pattern: Cal.com, Plain, Vercel, Linear, Sentry all ship monorepo generators (some use turbo gen, some custom Plop, some Hygen).

**Alternatives considered + rejected:**

- **Manual copy-paste from "reference package"** — rejected; drift accumulates fast (a missed dep-cruiser entry doesn't fail until much later).
- **Custom Node CLI tool** — rejected; turbo gen does the same thing native, zero extra dep.
- **Yeoman / Hygen / Plop standalone** — rejected; turbo gen wraps Plop internally so we get the same engine without managing the dep separately.
- **No generators, accept drift** — rejected per the user's reflection prompt and the mobile precedent of disciplined packaging.

**Binds:**

- M1.5 commit 1 (foundations) ALSO includes `turbo/generators/` setup with the 3 generators
- All M1.5 package extractions (`packages/observability`, `packages/security`, etc.) use the `turbo gen package` generator — not hand-rolled — to prove the tooling works
- README at root + per-package documents generator commands
- Future packages (`quilty_auth`, `payment`, `ui`) created via generator when their triggers fire
- Workspace ADR-12 candidate: "Monorepo packaging discipline + generator suite"

**Out of scope (later triggers):**

- Generator for new ADR (we have a `/generate-adr` skill — harmonize at M1.5)
- Generator for new wire-code (when auth ships post-convergence)
- Generator for new DynamoDB schema migration (when first DDB table ships)
- Cross-package contract testing (premature)

---

### A3.1 — Generate placeholder favicon + apple-touch-icon + manifest icon set

- **Locked**: 2026-05-19 22:10
- **Status**: confirmed-as-recommended

**Decision:**
Generate placeholder icons (gradient + initial wordmark glyph) at M1.5: `favicon.ico` (multi-resolution), `icon-16.png`, `icon-32.png`, `icon-96.png`, `icon-192.png`, `icon-512.png`, `apple-touch-icon-180.png`, `mask-icon.svg`. Brand-final art replaces placeholders at the brand-identity milestone trigger.

**Rationale:**
`apps/web/app/manifest.ts` already references `/icon-192.png` + `/icon-512.png`; the missing files cause Lighthouse PWA audit to fail every deploy. Apple touch icon required for iOS Safari add-to-home-screen + bookmark UX. Placeholders are zero-cost.

**Binds:**

- M1.5 commit fixing technical routes (D114) ships the icon set
- Brand-identity trigger replaces placeholder art

---

### A3.2 — Reconcile AASA `paths`/`components` to `components` (modern form only)

- **Locked**: 2026-05-19 22:10
- **Status**: confirmed-as-recommended (Apple-documented migration direction)

**Decision:**
The shipped AASA file is rewritten to use `applinks.details[].components` only (Apple-documented modern form). Legacy `paths` array dropped. Reconciliation eliminates the divergence bug.

**Rationale:**
Apple documents `components` as the modern direction; iOS 13+ silently ignores `paths` when both are present. Single-form authoring eliminates the divergence-bug class.

**Binds:**

- M1.5 commit fixing the AASA bug ships the rewrite
- Test via Apple's AASA validator (`https://app-site-association.cdn-apple.com/a/v1/<domain>`)
- Mobile team coordination: confirm before deploy

---

### A3.3 — AASA components array empty at M1.5; claim paths as routes ship

- **Locked**: 2026-05-19 22:10
- **Status**: confirmed (clarification of A1.3)

**Decision:**
AASA `applinks.details[].components` ships as `[]` (empty array) at M1.5 since the corresponding routes (`/account/security/passkeys`, `/auth/magic-link`, `/account/data/export`) don't exist yet. Paths are added to the AASA file at the same commit that ships each corresponding route. A1.3's claim-scope listing is the _future_ scope, not the M1.5 scope.

**Rationale:**
Claiming a path before the route exists = guaranteed iOS-click 404. Empty array at M1.5 = no broken claims. Add-as-routes-ship is the safe pattern.

**Binds:**

- M1.5 AASA file: empty components array (still ships with correct shape, just no entries)
- Each future route in A1.3's scope adds its own entry to AASA when shipped
- Mobile team coordination point: claims accumulate; mobile sees them in AASA on each deploy

---

### A3.4 — `sst.config.ts` tags re-aligned to AWS Org Tag Policy schema

- **Locked**: 2026-05-19 22:10
- **Status**: confirmed-as-recommended

**Decision:**
`sst.config.ts` tag emission rewritten to match AWS Org Tag Policy canonical schema. Specific schema sourced from `quilty-aws` Org Tag Policy file at implementation time. Includes `quilty:environment` (NOT `quilty:env`) plus the 8 other mandatory tags identified by AWS-recon.

**Rationale:**
Org Tag Policy enforcement will reject malformed tag emission. Better to fix before first deploy than have CI fail post-merge.

**Binds:**

- M1.5 commit fixing tags reads canonical schema from `quilty-aws` (e.g., `quilty-aws/policies/tag-policy.json` or similar) and emits matching set
- If schema-source file not found, spawn Explore agent at implementation time to inventory
- D27 / D70 tag-related references in strategy doc updated if needed

---

### D75-evidence — 8-source confirmation pass for modular monolith pattern

- **Captured**: 2026-05-19 22:25
- **Sources**: 6 enterprise OSS repos inspected via `gh api`, 4 doc-site WebFetches
- **Verdict**: **Decisive — pattern is the 2026 enterprise default.**

**Direct sources confirming `apps/` + `packages/` + Turborepo + pnpm workspaces:**

| Source                                                                                               | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Layout                                                          |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **Turborepo official docs** (`turborepo.dev/docs/crafting-your-repository/structuring-a-repository`) | Explicit recommendation: _"We recommend starting with splitting your packages into `apps/` for applications and services and `packages/` for everything else, like libraries and tooling."_                                                                                                                                                                                                                                                                    | `apps/` + `packages/` canonical                                 |
| **Turborepo official naming guidance**                                                               | _"It's best practice to use a namespace prefix for your Internal Packages... `@acme/package-name`."_                                                                                                                                                                                                                                                                                                                                                           | `@<scope>/<name>` for internal packages                         |
| **Cal.com (`calcom/cal.com`)**                                                                       | Root `package.json` workspaces: `apps/*`, `apps/api/*`, `packages/*`, `packages/embeds/*`, `packages/features/*`, `packages/app-store`, `packages/app-store/*`, `packages/platform/*`. 20+ packages: `app-store-cli`, `app-store`, `config`, `coss-ui`, `dayjs`, `debugging`, `emails`, `embeds`, `features`, `i18n`, `kysely`, `lib`, `platform`, `prisma`, `sms`, `testing`, `trpc`, `tsconfig`, `types`, `ui`. Uses `@calcom/lib` namespace. Turbo + Biome. | Modular monolith proven at scale                                |
| **Next.js itself (`vercel/next.js`)**                                                                | `pnpm-workspace.yaml` declares `apps/*`, `packages/*`, `bench/*`, `crates/*/js`, `turbopack/crates/*/js`, `turbopack/packages/*`. 19 packages in `packages/`: `create-next-app`, `eslint-config-next`, `eslint-plugin-internal`, `eslint-plugin-next`, `font`, `next-bundle-analyzer`, etc.                                                                                                                                                                    | The framework we're using IS itself a Turborepo + pnpm monorepo |
| **Vercel/Turborepo itself** (`vercel/turborepo`)                                                     | `apps/` + `packages/` + `examples/`. Examples folder includes `with-nextjs`, `with-changesets`, `with-tailwind`, `with-microfrontends` — explicit templates for this exact shape. pnpm + Cargo + Turbo.                                                                                                                                                                                                                                                        | Authors of the tool ship the pattern as the canonical reference |
| **PostHog (`PostHog/posthog`)**                                                                      | `pnpm-workspace.yaml` + `turbo.json` at root. Polyglot monorepo: `frontend/`, `packages/`, `products/`, `ee/`, `rust/`, `nodejs/`, `cli/`.                                                                                                                                                                                                                                                                                                                     | Modular monolith for a 12-language consumer product             |
| **Vercel deployment platform docs**                                                                  | _"Root Directory: App location in repository (e.g. `apps/web`)"_ — their build pipeline is purpose-built for this layout.                                                                                                                                                                                                                                                                                                                                      | Hosting infrastructure assumes this shape                       |

**What the evidence does NOT directly address (separate concern):**

- Hexagonal architecture / ports + adapters INSIDE packages. Turborepo docs don't go that layer deep — that's an internal-package-design concern, not a monorepo-shape concern. Mobile `quilty_auth` precedent supplies this layer (33 ports + 27 fakes), and D76 separately locks it.

**Sources that didn't yield evidence:**

- Thoughtworks Tech Radar Volume 34 (2026-04) — no specific entry for "monorepo with managed dependencies" in current volume; pattern is sufficiently mainstream to no longer warrant Radar attention.
- Vercel monorepo-types overview (turborepo `with-nextjs/packages` API returned 404 — example structure was confirmed via examples listing instead).
- State of JS 2024 monorepo-tools page (404 at attempted URL).
- Plain (`plainhq/plain`) — private repo, can't inspect.

**Conclusion:**
Pattern is the **2026 enterprise consensus default for TypeScript-monorepo websites with a Next.js app**. All 5 inspectable reference repos in our peer set use it. Turborepo's own documentation, the Next.js framework itself, the deployment platform we're targeting (Vercel/equivalent), and the build system (Turborepo) all converge on apps/ + packages/ + pnpm workspaces. Refactoring away from this shape would mean fighting our entire toolchain.

**Naming-convention adjustment for npm/TypeScript ecosystem:**
Mobile uses Dart snake_case package naming (`quilty_auth`). Web/npm uses scoped kebab-case: `@quilty/auth`, `@quilty/observability`, `@quilty/analytics`, `@quilty/error-reporter`, etc. Both forms encode the same role-shaped intent — only the surface syntax differs per ecosystem. The npm `@quilty/<name>` scope acts as the namespace prefix Turborepo recommends.

---

### A3.5 — Strategy doc D9 wording fix (bus name)

- **Locked**: 2026-05-19 22:10
- **Status**: confirmed-as-recommended

**Decision:**
Strategy doc D9 wording updated: `quilty.auth.sessions_revoked` → `quilty-{env}-auth-events` with `detail-type` discrimination via `quilty.auth.Envelope` JSONSchema. Documents the transactional outbox pattern.

**Rationale:**
Speculative naming in the strategy doc was wrong; production reality (verified by Explore probe 11) uses different naming + structure.

**Binds:**

- Strategy doc edit-only at M1.5 closeout strategy-doc revision pass
- No code change today (web BFF subscriber lands post-auth-convergence)
- Future web auth sprint references the corrected name

---

### D75 — Modular monolith via Turborepo + pnpm workspaces

- **Locked**: 2026-05-19 22:35
- **Status**: confirmed-as-recommended, backed by 8-source evidence pass
- **Source**: Round 6 synthesis Section B.1 + 8-source web confirmation (Turborepo official docs, Cal.com, Next.js, Turborepo itself, PostHog, Vercel deployment docs)

**Decision:**
`apps/web/` becomes thin (routes, layouts, server actions, composition root). Domain capabilities live in `packages/*` workspaces. One Lambda runtime, multiple package boundaries. Turborepo orchestrates tasks; pnpm workspaces manage installation. Source code from `apps/web/lib/*` migrates out to packages.

**Rationale:**
Pattern is the 2026 enterprise default — verified by 8 sources including Turborepo's own official recommendation, Cal.com (20+ packages), Next.js itself, and Vercel's deployment platform. Refactoring away = fighting the toolchain. Mobile `quilty_auth` (33 ports + 27 fakes proven) supplies the per-package internal-structure precedent.

**Binds:**

- M1.5 commit 1 establishes `pnpm-workspace.yaml`, root tsconfig references, turbo.json pipelines
- D76, D77, D78, D79, D80 all build on D75
- ADR-0008 (Modular monolith architecture) lands at M1.5 closeout
- Test discipline (META-3 85% floor) applies per-package
- META-5 packaging tooling operates within D75's shape

---

### D75-naming — Web packages use `@quilty/<kebab-case-role>` npm-scoped naming

- **Locked**: 2026-05-19 22:35
- **Status**: confirmed-as-recommended
- **Source**: Turborepo official guidance (`@<scope>/<name>` namespace prefix) + Cal.com precedent (`@calcom/<name>`) + user direction (role-shaped vendor-agnostic)

**Decision:**
Web packages on npm/TypeScript use scoped kebab-case: `@quilty/observability`, `@quilty/security`, `@quilty/seo`, `@quilty/content`, `@quilty/consent`, `@quilty/email`, `@quilty/captcha`, `@quilty/rate-limit`, `@quilty/auth` (when post-convergence trigger fires), `@quilty/payment` (M7), `@quilty/ui` (extraction trigger), `@quilty/shared-types` (exists).

Per-ecosystem stylistic difference is intentional:

- Mobile (Dart): `quilty_auth` (snake_case — Dart convention)
- Web (npm): `@quilty/auth` (scoped kebab-case — npm convention)

Both encode the same role-shape; surface syntax follows ecosystem norms.

**Rationale:**
Turborepo official: _"It's best practice to use a namespace prefix for your Internal Packages."_ `@quilty/<role>` matches that recommendation + Cal.com / PostHog / Next.js precedents. Kebab-case is npm canonical (snake_case forbidden in npm package names).

**Binds:**

- All M1.5 package extractions use `@quilty/<role>` names
- Generator templates (META-5) emit `@quilty/<name>` in package.json
- `apps/web/composition.ts` imports from `@quilty/observability` etc., never relative paths to `lib/`
- Existing `packages/shared-types/` is presumed already named `@quilty/shared-types` (verify at extraction-commit time)

---

### D76-evidence — 6-agent evidence pass on hexagonal architecture

- **Captured**: 2026-05-19 23:30
- **Sources**: 6 parallel research agents
- **Verdict**: Original D76 ("hexagonal per package") overcorrected; refined to "hexagonal-by-boundary"

**Reports produced:**

1. `_raw/12-enterprise-consumer-app-architecture.md` — Discord/Duolingo/Spotify/Pinterest/Twitch/Snapchat/Reddit/Twitter/GitHub/Shopify
2. `_raw/13-consumer-mental-health-architecture.md` — Headspace/Calm/BetterHelp/Talkspace/Cerebral/Mindbloom/Noom/Hinge/Maven/WHOOP/Apple Health/23andMe/Wysa
3. `_raw/14-typescript-hexagonal-implementation.md` — Cal.com/Sentry/Supabase/Prisma/Next.js/Hono/NestJS/Effect-TS/Lucia/TinaCMS/Resend (concrete file inspection)
4. `_raw/15-hexagonal-foundations-and-history.md` — Cockburn, Vernon, Fowler, Robert Martin, Bernhardt, 2024-2026 discourse
5. `_raw/16-hexagonal-pitfalls-and-criticisms.md` — anti-patterns, Stuart-Martin 2025 critique, Seemann 2025 hedge
6. `_raw/17-composition-and-test-patterns.md` — composition root + test pattern recommendations

**Convergent findings:**

| Aspect                                          | Verdict                                                                           | Source     |
| ----------------------------------------------- | --------------------------------------------------------------------------------- | ---------- |
| Hexagonal IS still the right name               | ✓ — Cockburn revised the pattern in April 2024                                    | 15         |
| Apply uniformly per-package                     | ✗ — Dominant documented failure mode                                              | 12, 16     |
| Apply selectively at boundaries                 | ✓ — 2024-2026 consensus = "hexagonal-by-boundary"                                 | 12, 13, 16 |
| Marketing pages flat                            | ✓ — Ports there = ceremony-without-payoff                                         | 16         |
| Cross-cutting + compliance capabilities = ports | ✓ — Vendor lock-in + audit boundary alignment                                     | 12, 13, 16 |
| Compliance-by-architecture framing              | ✓ — Cerebral/Monument/BetterHelp $17M+ all share adapter-boundary anti-pattern    | 13         |
| Cal.com is the closest TS peer exemplar         | ✓ — Vertical Slice + DDD + ports in `packages/types/*.d.ts`                       | 14         |
| Composition root                                | Manual `composition.ts` + `globalThis` anchor; defer DI container to ≥3×3 trigger | 14, 17     |
| Fakes location                                  | `src/__fakes__/` exported via `./testing` subpath                                 | 17         |
| Port contract tests                             | Vitest `describe.each` parameterized over adapter factories                       | 17         |
| Mobile precedent scale                          | 33 ports + 27 fakes is mobile-scale; web at solo-team needs ~⅓                    | 13, 16, 17 |
| Web Tier-A wire-pin tests                       | Against DEV account (not prod) due to write-path safety                           | 17         |

**Reference exemplars captured for ADR-0009:**

- GitHub Octokit `authStrategy` + plugin system (canonical TS port/adapter)
- Cal.com `packages/types/*.d.ts` + `packages/app-store/<vendor>/lib/*.ts` (closest peer to our shape)
- Sentry `TestClient`/`TestTransport` in `sentry-javascript/packages/core/test/mocks/` (fake-in-package pattern)
- TinaCMS `DummyMediaStore` (in-memory fake for tests + local dev)
- Shopify Hydrogen framework-agnostic-core + framework-specific-adapter split (future `@quilty/ui` reference)

**Watch-items captured for ADR-0009:**

- Stuart-Martin Sept 2025: "most 'hexagonal' projects are actually layered-with-DI"
- Mark Seemann April 2025 "Ports and fat adapters": rejects use-case-class layering
- Sairyss/domain-driven-hexagon: solo-team applications need expert discipline
- "Test theater" risk if fakes don't exercise integration paths
- "Adapter explosion" — port-per-vendor-SDK reflex
- Cerebral/Monument/BetterHelp HITRUST-clean-on-paper but adapter-boundary-leaked-in-runtime

---

### D76 — Hexagonal-by-boundary (REVISED from original draft)

- **Locked**: 2026-05-19 23:30
- **Status**: confirmed-revised, backed by 6-agent evidence pass
- **Source**: Round 6 synthesis + 6-agent evidence pass (reports 12-17)

**Decision:**

Hexagonal architecture (ports + adapters + composition) applies **selectively at three boundary types**, not uniformly across all packages:

1. **Vendor seams** with real swap-likelihood or compliance risk (analytics, error reporter, email sender, captcha, payment when M7)
2. **Cross-cutting domain capabilities** with multi-vendor or multi-runtime surface (consent store, rate limiter, session store when post-auth-convergence)
3. **PHI / safety chokepoints** where the boundary IS the audit-traceable surface (sanitizer)

**Hexagonal packages** (ports + adapters + `__fakes__/` + contract tests):

- `@quilty/observability` — ports: `Analytics`, `ErrorReporter`, `Logger`, `Replay`, `FeatureFlagEvaluator`
- `@quilty/consent` — port: `ConsentStore`
- `@quilty/email` — port: `EmailSender`
- `@quilty/captcha` — port: `Captcha`
- `@quilty/rate-limit` — port: `RateLimiter`
- `@quilty/security` — ports: `Sanitizer`, `RedirectValidator`, `CspBuilder`, `HeadersBuilder` (no vendor — domain-only, but ports give consistent surface + audit boundary)

**Non-hexagonal packages** (flat utility — no ports):

- `@quilty/seo` — schema.org builders, pure functions
- `@quilty/content` — Velite + Zod + BlockRenderer, build-time data layer
- `@quilty/shared-types` — types only

**Marketing pages** (`apps/web/app/[locale]/(marketing)/`) — flat structure. Pages directly import from `@quilty/<role>` package public APIs; no marketing-layer port indirection.

**Deferred packages** — see A2.5 (auth descope) and trigger-gated:

- `@quilty/quilty-auth` — auth-convergence trigger (post-server-cookie-policy + post-mobile-utilization)
- `@quilty/payment` — M7 trigger (Stripe integration)
- `@quilty/ui` — D69 extraction trigger (first component crosses apps/packages boundary)

**Per-package internal layout (Cal.com-derived):**

```
@quilty/<role>/
├── package.json                  # exports map: ".", "./testing"
├── tsconfig.json
├── README.md
├── src/
│   ├── ports.ts                  # interface definitions
│   ├── errors.ts                 # typed error union for this port family
│   ├── domain/                   # optional, vendor-free logic
│   ├── adapters/
│   │   ├── <vendor>.ts           # production adapter
│   │   ├── <vendor>.test.ts      # contract test invocation
│   │   └── in-memory.ts          # fake — used by tests + local dev (TinaCMS pattern)
│   ├── __fakes__/                # consumer-test fakes; exported via "./testing"
│   │   └── <port>.fake.ts
│   ├── __tests__/
│   │   └── <port>.contract.test.ts   # parameterized: any adapter satisfies port invariants
│   └── index.ts                  # public API barrel + create<Role>(config): Port factory
```

**Rationale:**

Convergent 6-agent evidence base (see D76-evidence above). Pattern's literature is unanimous: uniform-per-package application is the dominant failure mode. Cal.com's Vertical Slice + per-vendor adapter is the closest peer-set exemplar. HIPAA-aligned posture makes the compliance-by-architecture framing load-bearing — Cerebral/Monument/BetterHelp incidents all share the adapter-boundary anti-pattern that hexagonal-by-boundary directly addresses.

**Alternatives considered + rejected:** see D76-evidence section above + Section B.1 of `synthesis-and-decisions.md`.

**Binds:**

- D77, D78, D79, D80 below
- META-5 packaging tooling templates emit this exact layout (port, adapter, fake, contract-test, package — 5 generators total)
- ADR-0009 (Hexagonal-by-boundary) lands at M1.5 closeout with full citation stack + watch-items + alternatives + exemplar references
- D67 PHI sanitizer chokepoint = `@quilty/security`'s `Sanitizer` port → all `EmailSender.sendTransactional`, `Analytics.track`, `ErrorReporter.captureError` adapters call into `Sanitizer` at the port boundary
- META-3 ≥85% test coverage floor / ≥95% on load-bearing applies per-package

---

### D77 — Composition root: manual TS file + `globalThis` anchor + `makeContainer()` upgrade path

- **Locked**: 2026-05-19 23:30
- **Status**: confirmed-revised, backed by agent 17
- **Source**: Round 6 evidence (Sentry/Lazar Nikolov `nextjs-clean-architecture` precedent + Cal.com `@evyweb/ioctopus` as documented upgrade path)

**Decision:**

Composition root lives at `apps/web/composition.ts` as a **manual TypeScript file** (one factory per runtime: server, client, edge). NO DI container at M1.5.

`globalThis` anchor solves Next.js webpack chunk-duplication. `makeContainer()` interface stays stable — upgrade path to `@evyweb/ioctopus` (Cal.com's container) is body-only swap when triggers fire.

```typescript
// apps/web/composition.ts (server runtime — sketch)
import { createAnalytics } from '@quilty/observability/amplitude';
import { createErrorReporter } from '@quilty/observability/sentry';
import { createConsentStore } from '@quilty/consent/dynamodb';
// ...

declare global {
  var __quiltyContainer: ReturnType<typeof makeContainer> | undefined;
}

export function makeContainer(env: Env) {
  return {
    analytics: createAnalytics({ apiKey: env.AMPLITUDE_API_KEY }),
    errorReporter: createErrorReporter({ dsn: env.SENTRY_DSN }),
    consentStore: createConsentStore({ tableName: env.CONSENT_TABLE_NAME }),
    // ...
  };
}

export function getContainer(env: Env) {
  if (!globalThis.__quiltyContainer) {
    globalThis.__quiltyContainer = makeContainer(env);
  }
  return globalThis.__quiltyContainer;
}
```

**Upgrade triggers** (to DI container — `@evyweb/ioctopus`):

- ≥3 adapters per port AND ≥3 consumer slices materialize
- OR `composition.ts` exceeds ~300 LoC
- OR request-scoped state propagation needs become unworkable in manual factory

**Rationale:**

Agent 17 evidence: Hono/Sentry/Stripe-node/Prisma/Resend/TinaCMS all use plain factory + composition-root files. Containers (tsyringe/inversify/Effect-TS Layer) pay off at 3+ adapters × 3+ consumers — our M1.5 scale is ~1 adapter × 1-2 consumers per port. `globalThis` anchor anchors on Sentry DevRel Lazar Nikolov's documented Next.js pattern.

**Alternatives considered + rejected:**

- `tsyringe` — decorator/metadata cost, no Next.js story, serverless cold-start penalty
- `awilix` — overkill at our scale; documented upgrade path if scale demands
- `inversify` — heavy decorator cruft; rejected outright
- `Effect-TS Layer` — paradigm commitment too large at M1.5; valid M5+ if Effect-TS adopted broadly
- `@evyweb/ioctopus` (Cal.com's pick) — defer until triggers fire; named as the upgrade target

**Binds:**

- `apps/web/composition.ts` is the only place that imports adapter modules (`@quilty/<role>/<vendor>`)
- Domain code in each `@quilty/<role>/` package imports only ports + types from its own package barrel
- META-5 does NOT generate composition root scaffolding at M1.5 (manual editing fine through M9)
- ADR-0010 (Composition root) captures the pattern + upgrade triggers + Sentry precedent

---

### D78 — ESLint vendor-SDK chokepoint (NARROWED to hexagonal packages)

- **Locked**: 2026-05-19 23:30
- **Status**: confirmed-revised
- **Source**: Round 6 evidence base + D76 refinement

**Decision:**

ESLint `no-restricted-imports` rule blocks vendor SDK imports (`@sentry/*`, `@amplitude/*`, `@aws-sdk/*`, `stripe`, `@cloudflare/turnstile-server`, etc.) **everywhere EXCEPT**:

- `packages/*/src/adapters/<vendor>.ts` (the canonical adapter file)
- `apps/web/composition.ts` (the composition root — imports adapters but never the SDK directly)
- `apps/web/sentry.*.config.ts` etc. (vendor-init files Next.js requires; sole place where vendor init must run)

Marketing pages, server actions, blocks, content, SEO modules, security modules — none import vendor SDKs directly. Pages call `getContainer(env).errorReporter.captureError(...)` or `import { logError } from '@quilty/observability'`.

**Rationale:**

D76 narrowed: hexagonal applies only to vendor-seam + cross-cutting + chokepoint packages. ESLint rule mirrors that scope. Mechanical enforcement of "adapters are the only place SDKs appear" prevents the Cerebral/Monument/BetterHelp adapter-boundary anti-pattern.

**Binds:**

- `eslint.config.mjs` updated at M1.5 commit-1: vendor-SDK blocklist tightened to `packages/*/src/adapters/<vendor>.ts` allowlist
- Existing M1 ESLint rule (vendor SDKs banned outside `lib/observability/`) is superseded
- Lint-staged + CI hygiene job catches violations before merge

---

### D79 — dependency-cruiser graph rules (REFINED scope)

- **Locked**: 2026-05-19 23:30
- **Status**: confirmed-revised
- **Source**: Round 6 evidence base + D76 refinement

**Decision:**

dependency-cruiser graph rules enforce:

1. **No cycles** anywhere
2. **`packages/\*/src/domain/**`MUST NOT import from`packages/\*/src/adapters/**`** — domain stays vendor-free
3. **Cross-package imports allowed only via the `index.ts` public API barrel** — no `import from '@quilty/<role>/src/internal-file'`
4. **`apps/web/**`may import from any`@quilty/<role>`public API; CANNOT import from`@quilty/<role>/src/adapters/<vendor>` directly\*\* (must go through composition root)
5. **Non-hexagonal packages (`@quilty/{seo, content, shared-types}`) exempt** from adapter-boundary rules (no adapters to enforce against)

**Rationale:**

ESLint sees per-file; dep-cruiser sees the import graph. Together they catch what individual rules miss. Rule scope narrowed to hexagonal packages only — utility packages don't have adapter folders.

**Binds:**

- `.dependency-cruiser.cjs` updated at M1.5 commit-1 with the 5 rules above
- CI hygiene job runs `pnpm depcruise` — fails on violation
- Existing M1 dep-cruiser rules (no-cycles + shadcn isolation + vendor-SDK chokehold) are superseded by the refined scope

---

### D80 — Package taxonomy (REFINED)

- **Locked**: 2026-05-19 23:30
- **Status**: confirmed-revised
- **Source**: D76 refinement; agents 12, 13, 16 convergent recommendation; agent 14 Cal.com exemplar

**Decision:**

M1.5 ships **9 packages** total:

**6 hexagonal packages** (ports + adapters + fakes + contract tests):

1. `@quilty/observability` — ports: `Analytics`, `ErrorReporter`, `Logger`, `Replay`, `FeatureFlagEvaluator`; adapters: Amplitude, Sentry, CloudWatch, sentry-replay, env-var-flags
2. `@quilty/consent` — port: `ConsentStore`; adapters: in-memory (M1.5), DynamoDB (post-DDB-provision)
3. `@quilty/email` — port: `EmailSender`; adapter: SES
4. `@quilty/captcha` — port: `Captcha`; adapter: Turnstile
5. `@quilty/rate-limit` — port: `RateLimiter`; adapter: DynamoDB
6. `@quilty/security` — ports: `Sanitizer`, `RedirectValidator`, `CspBuilder`, `HeadersBuilder`; no vendor adapters (domain-only)

**3 utility packages** (flat — no ports): 7. `@quilty/seo` — schema.org builders + JsonLd component 8. `@quilty/content` — Velite + Zod + BlockRenderer 9. `@quilty/shared-types` — types only (existing, M5 OpenAPI codegen target)

**Deferred packages** (created at trigger via META-5 generator):

- `@quilty/quilty-auth` — post-auth-convergence trigger
- `@quilty/payment` — M7 Stripe trigger
- `@quilty/ui` — D69 extraction trigger

**Marketing pages stay in `apps/web/app/[locale]/(marketing)/`** — flat, no port indirection at the page layer.

**Rationale:**

D76 hexagonal-by-boundary applied. Vendor-seam + compliance-chokepoint + cross-cutting domain capability → hexagonal. Pure utility → flat. Deferrals match trigger conditions.

**Binds:**

- M1.5 commit 1 vends all 9 packages via META-5 generator
- M1 code at `apps/web/lib/observability/*`, `apps/web/lib/security/*`, `apps/web/lib/seo/*`, `apps/web/lib/content/*` migrates to corresponding packages
- ADR-0008 (Modular monolith) + ADR-0009 (Hexagonal-by-boundary) reference this taxonomy

---

### D81 — Naming discipline: no bare `Service` suffix (consolidated into META-1)

- **Locked**: 2026-05-19 23:30
- **Status**: consolidated — see META-1
- **Source**: Round 6 synthesis Section B.1 + user direction (META-1)

**Decision:**

D81 is subsumed by META-1 (vendor-agnostic naming convention). No bare `Service` suffix; types/interfaces/classes use role-shaped names; adapter files are the only place a vendor name appears.

This entry exists for D-number completeness; refer to META-1 above for the canonical rule.

**Binds:**

- Same as META-1
- D81 deleted in any future strategy-doc revision; replaced by META-1 reference

---

### META-5 update — generator suite EXPANDS to 5 templates

- **Locked**: 2026-05-19 23:30
- **Status**: META-5 amended from 3 generators → 5 generators
- **Source**: agent 14 (Cal.com per-package layout) + agent 17 (test pattern + composition pattern)

**Updated decision:**

Turbo generators at M1.5 commit-1 ship **5 templates** (not 3):

1. **`turbo gen package`** — scaffolds a new hexagonal package: `package.json` with exports map (`.`, `./testing`), `tsconfig.json`, `src/{ports.ts, errors.ts, domain/, adapters/, __fakes__/, __tests__/, index.ts}`, `README.md`. Auto-updates root configs (Knip, dep-cruiser, size-limit).
2. **`turbo gen port`** — adds a port interface to an existing package: type signature in `src/ports.ts`, contract-test stub in `src/__tests__/<port>.contract.test.ts` (parameterized via `describe.each`), fake adapter in `src/__fakes__/<port>.fake.ts`.
3. **`turbo gen adapter`** — adds a vendor adapter: `src/adapters/<vendor>.ts` skeleton, `src/adapters/<vendor>.test.ts` (invokes the contract suite), composition-root TODO comment reminding the engineer to wire it in.
4. **`turbo gen fake`** — adds an in-memory fake adapter alongside the production adapter: `src/adapters/in-memory.ts` (TinaCMS `DummyMediaStore` pattern). Used by tests AND local dev.
5. **`turbo gen utility-package`** — scaffolds a non-hexagonal utility package (no ports, no adapters): just `package.json`, `tsconfig.json`, `src/index.ts`, `src/__tests__/`, `README.md`. For `@quilty/{seo, content}`-shaped packages.

NOT generated at M1.5 (deferred):

- Composition-root scaffolding — manual editing fine through M9 per D77
- ADR generator — existing `/generate-adr` skill suffices
- Cross-package contract test — premature

**Rationale:**

Original META-5 (3 generators) didn't account for the in-memory-fake pattern (agent 14 TinaCMS) or the utility-package case (agent 12, 13, 16). Expanded set covers all five distinct scaffold needs without over-engineering.

**Binds:**

- `turbo/generators/config.ts` + 5 templates ship at M1.5 commit-1
- All M1.5 package extractions use the generators — proves the tooling works
- ADR-12 (Monorepo packaging discipline + generator suite) updated to reflect 5 generators

---

### D82-D95 — Port shapes locked (Section B.2 — all 6 packages, 11 ports)

- **Locked**: 2026-05-19 23:55
- **Status**: confirmed-as-recommended, evaluated against enterprise patterns + compliance + future-proofing
- **Source**: Section B.2 of `synthesis-and-decisions.md` + refinements from agent 14 (Cal.com `packages/types/*.d.ts` pattern) + agent 17 (consumer-test fakes + contract-test parameterization)

**Decision:** 11 port interfaces locked across 6 hexagonal packages. Each port lives in `packages/<name>/src/ports.ts`; consumed via the package's `index.ts` factory; cross-cutting concerns (PHI sanitize, consent gate) applied by the factory wrapper not the adapter.

#### @quilty/observability — 5 ports (D82 Analytics, D83 ErrorReporter, D84 Logger, D85 Replay, D86 FeatureFlagEvaluator)

```typescript
// Analytics (D82)
export type AnalyticsEvent =
  | { name: 'page_view'; props: { route: string; locale: string } }
  | { name: 'cta_click'; props: { cta_id: string; location: string } }
  | { name: 'signup_started'; props: { source: string } }
  | { name: 'signup_completed'; props: { method: 'password' | 'passkey' | 'social' } }
  | { name: 'subscription_started'; props: { plan: string } }
  | { name: 'account_deleted'; props: { reason: AccountDeleteReason } };

export type AccountDeleteReason =
  | 'too_expensive'
  | 'not_helpful'
  | 'privacy'
  | 'switched_provider'
  | 'other_specified'
  | 'unspecified';

export interface TrackContext {
  user_id_hash?: string;
  session_id?: string;
  consent: ConsentState; // from @quilty/consent
}

export interface Analytics {
  track(event: AnalyticsEvent, ctx: TrackContext): Promise<void>;
}

// ErrorReporter (D83)
export type ErrorSeverity = 'debug' | 'info' | 'warning' | 'error' | 'fatal';

export interface ErrorContext {
  user_id_hash?: string;
  request_id?: string;
  route?: string;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
}

export interface ErrorReporter {
  captureError(err: unknown, ctx?: ErrorContext): void;
  captureMessage(message: string, severity: ErrorSeverity, ctx?: ErrorContext): void;
  setUser(user_id_hash: string | null): void;
}

// Logger (D84)
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export interface LogFields {
  [key: string]: unknown;
}

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  child(boundFields: LogFields): Logger; // Pino-standard request-scoped logger
}

// Replay (D85) + exported constants
export const REPLAY_BLOCK_CLASS = 'quilty-replay-block';
export const REPLAY_MASK_CLASS = 'quilty-replay-mask';

export interface ReplayOpts {
  maskAllText?: boolean; // factory enforces true default regardless of caller
  blockAllMedia?: boolean; // factory enforces true default
  maskAllInputs?: boolean; // factory enforces true default
  blockClass?: string; // defaults to REPLAY_BLOCK_CLASS
  maskClass?: string; // defaults to REPLAY_MASK_CLASS
}

export interface Replay {
  init(opts?: ReplayOpts): void;
  start(): void;
  stop(): void;
  addEvent(name: string, payload?: Record<string, unknown>): void;
}

// FeatureFlagEvaluator (D86)
export interface FeatureFlagContext {
  user_id_hash?: string;
  session_id?: string;
  attributes?: Record<string, string | number | boolean>;
}

export interface FeatureFlagEvaluator {
  evaluate(flag: string, defaultValue: boolean, ctx?: FeatureFlagContext): boolean;
  evaluateString(flag: string, defaultValue: string, ctx?: FeatureFlagContext): string;
  evaluateNumber(flag: string, defaultValue: number, ctx?: FeatureFlagContext): number;
  evaluateJson<T>(flag: string, defaultValue: T, ctx?: FeatureFlagContext): T;
  isReady(): boolean;
}
```

**Cross-cutting concerns at `createAnalytics()` / `createErrorReporter()` / `createLogger()` / `createReplay()` factory wrappers:**

- Analytics: consent gate (`ctx.consent.analytics === false → drop`) + PHI sanitize on event.props
- ErrorReporter: PHI sanitize on ctx.extra + ctx.tags
- Logger: PHI sanitize on fields
- Replay: consent gate (`ctx.consent.session_replay === false → no-op`) + enforced mask/block floor regardless of caller config
- FeatureFlagEvaluator: none (flag eval is non-PHI by design)

#### @quilty/consent — 1 port (D87 ConsentStore)

```typescript
export interface ConsentState {
  essential: true;
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
  personalization: boolean;
  gpc_honored: boolean;
  updated_at: string; // ISO 8601
  version: 'v1';
}

export type ConsentIdentifier =
  | { type: 'user'; user_id_hash: string }
  | { type: 'cookie'; cookie_id: string };

export interface ConsentStore {
  get(id: ConsentIdentifier): Promise<ConsentState | null>;
  set(
    id: ConsentIdentifier,
    state: Omit<ConsentState, 'updated_at' | 'version'>,
  ): Promise<ConsentState>;
  delete(id: ConsentIdentifier): Promise<void>;
  migrate(from: ConsentIdentifier, to: ConsentIdentifier): Promise<void>;
}
```

#### @quilty/email — 1 port (D88 EmailSender)

```typescript
export interface EmailRecipient {
  email: string;
  name?: string;
}
export interface EmailTemplateRef {
  name: string;
  locale: string;
}

export interface SendTransactionalArgs<T extends Record<string, unknown>> {
  to: EmailRecipient;
  template: EmailTemplateRef;
  data: T; // PHI-sanitized at factory per D67 extension + D126
  idempotency_key?: string;
  reply_to?: EmailRecipient;
  tags?: Record<string, string>;
}

export interface EmailSendResult {
  message_id: string;
  accepted_at: string;
}

export type EmailSenderError =
  | { kind: 'rate_limited'; retry_after_seconds?: number }
  | { kind: 'invalid_recipient'; detail?: string }
  | { kind: 'template_not_found'; detail?: string }
  | { kind: 'provider_unavailable'; detail?: string }
  | { kind: 'sanitization_failed'; detail?: string };

export interface EmailSender {
  sendTransactional<T extends Record<string, unknown>>(
    args: SendTransactionalArgs<T>,
  ): Promise<Result<EmailSendResult, EmailSenderError>>;
}
```

#### @quilty/captcha — 1 port (D89 Captcha)

```typescript
export interface CaptchaContext {
  remote_ip?: string;
  action?: string;
  expected_action?: string;
}

export type CaptchaFailureReason =
  | 'invalid_token'
  | 'expired_token'
  | 'duplicate_token'
  | 'bot_detected'
  | 'unsupported_action'
  | 'service_unavailable';

export type CaptchaVerifyResult =
  | { ok: true; score?: number; action?: string; hostname?: string }
  | { ok: false; reason: CaptchaFailureReason; codes?: string[] };

export interface Captcha {
  verify(token: string, ctx?: CaptchaContext): Promise<CaptchaVerifyResult>;
}
```

#### @quilty/rate-limit — 1 port (D90 RateLimiter)

```typescript
export interface RateLimitKey {
  scope: string;
  identifier: string;
}

export interface RateLimitConfig {
  limit: number;
  window_seconds: number;
  algorithm?: 'fixed' | 'sliding'; // default 'sliding'
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  reset_at: string;
  retry_after_seconds?: number;
}

export interface RateLimiter {
  check(key: RateLimitKey, config: RateLimitConfig): Promise<RateLimitResult>;
  reset(key: RateLimitKey): Promise<void>;
}
```

#### @quilty/security — 4 ports (D91 Sanitizer, D92 RedirectValidator, D93 CspBuilder, D94 HeadersBuilder) + D95 Result envelope shared type

```typescript
// Sanitizer (D91) — PHI chokepoint per D67
export interface SanitizerOptions {
  truncateLongStrings?: boolean;
  hashUuids?: boolean;
}

export interface Sanitizer {
  sanitize<T>(value: T, opts?: SanitizerOptions): T;
  sanitizeAsync<T>(value: T, opts?: SanitizerOptions): Promise<T>;
  isSensitiveKey(key: string): boolean;
  assertNoPHI(value: unknown, label: string): void;
}

// RedirectValidator (D92)
export interface RedirectValidator {
  isAllowed(target: string, allowlist: ReadonlyArray<string | RegExp>): boolean;
  sanitize(target: string | null | undefined, fallback: string): string;
}

// CspBuilder (D93)
export type CspTier = 'marketing' | 'portal';

export interface CspBuildOptions {
  nonce?: string;
  isDevelopment?: boolean;
  reportUri?: string;
}

export interface CspBuilder {
  build(tier: CspTier, opts?: CspBuildOptions): string;
  isPortalRoute(pathname: string): boolean;
  generateNonce(): string;
}

// HeadersBuilder (D94)
export type HstsPhase = 'pilot' | 'short' | 'medium' | 'long' | 'preload-ready' | 'preload';

export interface SecurityHeader {
  key: string;
  value: string;
}

export interface HeadersBuilder {
  build(opts?: { hstsPhase?: HstsPhase }): ReadonlyArray<SecurityHeader>;
}

// D95 — Shared Result envelope (lives in @quilty/security/result or @quilty/shared-types)
export type Result<T, E> = { ok: true; data: T } | { ok: false; error: E };
```

**Rationale (cross-port):**
Each port shape evaluated against three criteria + locked: (a) enterprise pattern match (Sentry / Pino / SES / Turnstile / Upstash / LaunchDarkly / Stripe / Cloudflare / mobile `sentry_phi_scrubber.dart`), (b) compliance alignment (HIPAA chokepoints, consent gates, PHI sanitizer at factory, no PHI in eval paths), (c) future-proof shape (minimal surface, generics, discriminated unions for extension, version markers, decorator pattern for cross-cutting). All 11 ports pass.

**Binds:**

- M1.5 commits 2-7 (per-package extractions) materialize these ports as `packages/<name>/src/ports.ts`
- META-5 `turbo gen port` template emits the parameterized contract-test stub for each port
- D67 PHI sanitizer chokepoint = Sanitizer port + factory-wrapper integration across observability + email
- D68 replay per-config discipline = Replay port's `ReplayOpts` enforced mask/block floor
- D43 feature-flag day-one = FeatureFlagEvaluator with env-var adapter; Amplitude Experiment adapter at trigger
- D121 typed Server Action Result envelope = `Result<T, E>` shared type (D95) used by EmailSender + future ports
- D122 validateRedirect utility = RedirectValidator port (D92)
- D59 two-tier CSP = CspBuilder port (D93)
- D33 + D58 + D60 security headers + HSTS ramp = HeadersBuilder port (D94)
- D63 ConsentState DynamoDB schema = ConsentStore port (D87)
- D126 no PHI in email bodies = factory-wrapper sanitizer pass on `args.data`
- D135 NEVER claim "HIPAA-compliant" = string ban added to ESLint custom rule + applied to all package READMEs

**Refinements vs B.2 original draft:**

- Logger gains `child(boundFields)` method (Pino-standard, agent 17 implicit recommendation)
- Replay constants `REPLAY_BLOCK_CLASS` + `REPLAY_MASK_CLASS` exported from package
- EmailSender returns `Result<EmailSendResult, EmailSenderError>` envelope (D121 / D95 application)
- Captcha `CaptchaFailureReason` enum (was unspecified in original)
- RateLimiter `algorithm` field (`fixed | sliding`) added (sliding default per 2026 industry-standard)
- ConsentStore `migrate()` method added for cookie→user transition on sign-in
- Sanitizer `assertNoPHI` exposed as port method (was implicit utility in M1)

---

### D96 — M1.5 adapter picks (Section B.3 — 10 vendor adapters + 6 universal in-memory fakes)

- **Locked**: 2026-05-19 23:58
- **Status**: confirmed-as-recommended; explicitly locked as "abstracted + substitutable" per user direction
- **Source**: Section B.3 of `synthesis-and-decisions.md` + locked decisions (A1.1 Amplitude, D42a Sentry, D63 ConsentStore, D37 Turnstile, agent 04 SES retention, agent 06 DynamoDB rate-limit)

**Decision:**

Each hexagonal package ships exactly ONE production vendor adapter at M1.5 plus one universal `in-memory` fake adapter (TinaCMS `DummyMediaStore` pattern from agent 14). All adapter choices are explicitly **substitutable** — swap = one file in `adapters/` + one line in `apps/web/composition.ts`.

| Port                         | M1.5 adapter file                                                                       | Production vendor                                | Companion fake                                     | Source         |
| ---------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------- | -------------- |
| `Analytics` (D82)            | `@quilty/observability/src/adapters/amplitude.ts`                                       | Amplitude                                        | `in-memory.ts`                                     | A1.1           |
| `ErrorReporter` (D83)        | `@quilty/observability/src/adapters/sentry.ts`                                          | Sentry                                           | `in-memory.ts`                                     | D42a           |
| `Logger` (D84)               | `@quilty/observability/src/adapters/cloudwatch.ts`                                      | stdout → Lambda → CloudWatch                     | `in-memory.ts`                                     | D106           |
| `Replay` (D85)               | `@quilty/observability/src/adapters/sentry-replay.ts`                                   | Sentry Replay (error-triggered, mask-all)        | `in-memory.ts` (no-op)                             | D68 reframed   |
| `FeatureFlagEvaluator` (D86) | `@quilty/observability/src/adapters/env-flags.ts`                                       | env-var `features.ts` reader                     | `in-memory.ts`                                     | D43 revised    |
| `ConsentStore` (D87)         | `@quilty/consent/src/adapters/in-memory.ts` (M1.5) → `dynamodb.ts` (post-DDB-provision) | DynamoDB                                         | `in-memory.ts` (also the M1.5 production stand-in) | D63            |
| `EmailSender` (D88)          | `@quilty/email/src/adapters/ses.ts`                                                     | AWS SES (existing enterprise infra per agent 04) | `in-memory.ts`                                     | agent 04       |
| `Captcha` (D89)              | `@quilty/captcha/src/adapters/turnstile.ts`                                             | Cloudflare Turnstile                             | `in-memory.ts` (always-OK in dev)                  | D37 + agent 06 |
| `RateLimiter` (D90)          | `@quilty/rate-limit/src/adapters/dynamodb.ts`                                           | DynamoDB                                         | `in-memory.ts`                                     | agent 06       |
| Security ports (D91-D94)     | domain-only (no vendor adapters)                                                        | n/a                                              | n/a — domain logic in `domain/`                    | —              |

**Deferred adapters** (trigger-gated, not in M1.5):

- `Authenticator` adapter (Cognito) — post-auth-convergence trigger (A2.5)
- `SessionStore` adapter (Cognito JWT + Valkey JTI denylist mirror) — post-auth-convergence trigger
- `PaymentProcessor` adapter (Stripe) — M7 trigger
- `FeatureFlagEvaluator` Amplitude Experiment adapter — post-launch flag activation trigger (D43)
- `EmailSender` Customer.io adapter (marketing tier) — M3+ waitlist activation trigger (D131)
- `Replay` PostHog Replay adapter — never (D42b Amplitude pivot stands; mobile retains PostHog interim)

**Rationale:**

Each adapter pick traces to a previously-locked decision OR a Round-6 agent recommendation. The hexagonal-by-boundary discipline (D76) means every pick is reversible by one-file swap. User explicitly confirmed substitution-path as load-bearing.

**Substitution-path documentation per adapter:**

For every adapter, the package README documents:

1. **Why this vendor at M1.5** (cost, BAA status, integration cost, compliance match)
2. **Known viable alternatives** (e.g., Sentry → Datadog / Honeybadger / Rollbar; Amplitude → PostHog / Mixpanel / Heap; SES → Resend / Postmark / SendGrid)
3. **Estimated swap cost** (one adapter file + one composition line + adapter contract tests + composition test)
4. **Triggers that would force the swap** (BAA terms shift, pricing change, capability gap)

**Binds:**

- M1.5 commits 2-9 ship the adapter files
- All adapters pass parameterized contract tests (Vitest `describe.each` per agent 17)
- `apps/web/composition.ts` imports from `@quilty/<role>/<adapter>` paths only
- In-memory fakes are used in test environments + local dev (`pnpm dev` with `QUILTY_ADAPTERS=in-memory` env var path)
- Package READMEs include the 4-item substitution-path doc per adapter
- ADR-0009 (Hexagonal-by-boundary) references this table

---

### B.4-A — Consent + Legal + Trust (8 decisions, D97-D104)

- **Locked**: 2026-05-20 00:15
- **Status**: confirmed-as-recommended with 3 refinements from agent 18 (CMP + legal pages verification)
- **Source**: synthesis Section B.4 + agent 18 enterprise inspection (13 peers inspected — Stripe, Linear, Cal.com, Vercel, Anthropic, Resend, Sentry, Headspace, Calm, BetterHelp, Talkspace, Cerebral, Noom)

#### D97 — Cookie consent: native build in `@quilty/consent` (NOT vendor CMP)

**Decision:** Build native cookie banner + preferences center in `@quilty/consent`. Reject Cookiebot / OneTrust / CookieYes / Osano / Iubenda / Didomi / Usercentrics for the web tier.

**Evidence:** 13 of 13 inspected enterprise peers ship native — zero CMP fingerprints found across the entire peer set (no `#onetrust-banner-sdk`, no `OptanonConsent`, no `otSDKStub.js`, no `didomi.io`, no `usercentrics.com`). **Stripe** explicitly brands their solution "Cookies & Consent Settings Dashboard" at `stripe.com/cookie-settings`. **BetterHelp** built native specifically after their $7.8M FTC settlement.

**Cross-platform consent question answered:** Didomi has the cleanest cross-platform architecture (OAuth client-credentials webhooks + native `setUser()` / `onConsentChanged` mirroring), but unified mobile+web vendor CMP is overkill at M1 — peer set doesn't adopt it. The `ConsentStore` port (D87) makes Didomi a low-cost reversal later if marketing/legal demand TCF v2.2 or unified mobile+web vendor sync.

**Cerebral lesson reframe (notable):** The $7M penalty was about tracking-pixel exfiltration, NOT consent-banner UX. A vendor CMP would not have prevented it. Quilty's existing architectural protections (D31 zero-PHI runtime + D35 server-side ConsentState + D59 two-tier CSP + D67 PHI sanitizer chokepoint) are the real defense.

**Binds:** `@quilty/consent/src/components/Banner.tsx`; D87 ConsentStore port; D63 DynamoDB schema; revisitable when SafeBase / TCF v2.2 / cross-platform vendor sync becomes a real need.

#### D98 — Cookie taxonomy v1: 5 categories with grandfathering rule

**Decision:** essential / functional / analytics / marketing / personalization. `version: 'v1'` in ConsentState. Grandfathering rule documented in `@quilty/consent` README:

- v2 with NEW categories → re-consent banner for existing users
- v2 with REMOVED/RENAMED categories → re-consent banner
- v2 with same categories + new vendors within existing categories → no re-consent

**Binds:** D87 ConsentState shape locked; ESLint rule blocks `version: 'v2'` until migration plan locked.

#### D99 — DSAR URLs: `/legal/privacy-choices` + `/account/privacy` (REVISED)

**Decision (refined):** Two URLs only:

1. `/legal/privacy-choices` — public preferences hub (Stripe pattern: `/legal/privacy-center`)
2. `/account/privacy` — signed-in self-serve export + delete (matches `/account/*` portal pattern)

**Dropped from original:** the public unauthenticated `/privacy/request` form. Agent 18 found enterprises route public DSARs through `/legal/privacy-choices` directly (signed or unsigned) — separate request form is over-engineered at M1.5.

**Vendor signal observed:** Vercel runs `datarequest.vercel.com` — confirming **DataGrail** adoption. Path-based works at our scale; vendor subdomain at SOC 2 / scale-trigger.

**Binds:** `apps/web/app/[locale]/(marketing)/legal/privacy-choices/page.tsx` + `apps/web/app/[locale]/(account)/account/privacy/page.tsx`.

#### D100 — GPC server-side mirror to DynamoDB on sign-in

**Decision:** `Sec-GPC: 1` detected at edge (proxy.ts read in Node runtime) → set `ConsentState.gpc_honored = true` → render `<GpcHonoredIndicator />`. On sign-in, `ConsentStore.migrate(cookie→user)` carries the flag through. Disney $2.75M Feb 2026 precedent forces cross-device mirror.

**Binds:** D62 + D87 ConsentStore.migrate() method; CCPA §7025(c)(6).

#### D101 — Accessibility Statement at `/legal/accessibility` (alias `/accessibility`)

**Decision:** Ship at M1.5 with:

- WCAG 2.2 AA self-asserted standard (matches peer convention)
- "Last reviewed: YYYY-MM-DD" date stamp
- 15-business-day feedback SLA
- `accessibility@my-quilty.com` mailbox (per D129 public mailbox roster)
- EAA / EN 301 549 acknowledgment line (agent 18 found this is **still rare across the peer set** — Quilty can lead here)
- Hand-written ~500 words; M8 lawyer review

**Watch-item:** if Quilty ever engages a third-party accessibility audit firm, choose **Accessible by Design LLC** (Headspace's partner — legitimate audit) or equivalent. **AVOID eSSENTIAL Accessibility** (Talkspace uses — overlay-class vendor; banned per CLAUDE.md Overlay Prohibition Rule).

**Binds:** `apps/web/app/[locale]/(marketing)/legal/accessibility/page.tsx` + alias route `/accessibility`. EAA deadline 2025-06-28 already passed — ship at M1.5.

#### D102 — Sub-processor list: Stripe 4-column format + email subscription (RSS dropped)

**Decision (refined):** Sub-processor list at `/legal/subprocessors` in Stripe's 4-column table format:
| Name | Data Processed | Purpose | Country |

Update notification mechanism: **email subscription** (subscribe-form at bottom of page). **Drop RSS** (agent 18 finding: "effectively dead"; no peer ships an RSS feed). 30-day objection window per GDPR Article 28 standard.

**Initial sub-processor list at M1.5 (auto-generated from current vendor set):**

- AWS (Sentry, SES, DynamoDB, Cognito eventually, CloudFront, S3) — data: technical metadata; purpose: hosting + email + auth + analytics infra; country: US
- Amplitude — data: analytics events (sanitized); purpose: product analytics; country: US
- Sentry (Functional Software, Inc.) — data: error events (sanitized); purpose: error monitoring; country: US
- Cloudflare (Turnstile) — data: IP, user agent; purpose: bot mitigation; country: US
- M365 (Microsoft) — data: inbound email; purpose: support / legal / privacy mail routing; country: US

**Binds:** `apps/web/app/[locale]/(marketing)/legal/subprocessors/page.tsx`. Update on every vendor add per 30-day notice rule. Mirror at `/trust/subprocessors` when Trust Center activates.

#### D103 — Trust Center: `/trust` PATH at M1.5 (subdomain deferred to SafeBase post-SOC2)

**Decision (refined):** Start with **`/trust` path on apex domain** at M1.5 (Stripe + Sentry pattern). Migrate to `trust.my-quilty.com` subdomain when **SafeBase** adopted post-SOC 2 Type II (M7-M8 trigger).

**Evidence:** Trust-Center subdomains dominantly powered by SafeBase (acquired by Drata Feb 2025 for $250M; clients include OpenAI, Twilio, CrowdStrike, HubSpot, LinkedIn, Anthropic, Headspace). At our M1.5 scale, path-based at `/trust` matches Stripe / Sentry; subdomain + SafeBase is post-launch infrastructure.

**Binds:** `apps/web/app/[locale]/(marketing)/trust/page.tsx` at M1.5 (one-page summary). DNS record for `trust.my-quilty.com` reserved at M1.5 next-sprint AWS work (cheap to reserve). Trigger to activate subdomain + SafeBase: SOC 2 Type II project initiated.

#### D104 — NEVER claim "HIPAA-compliant" — "HIPAA-aligned" is the ceiling

**Decision:** ESLint custom rule bans literal string `"HIPAA-compliant"` (case-insensitive) in `.tsx` + `.md` + `.mdx` files outside `docs/research/_raw/`. Use `HIPAA-aligned` consistently. Cerebral $7M precedent.

**Binds:** ESLint custom rule + lint-staged + CI hygiene job. Documented in `@quilty/consent/README.md` + CLAUDE.md NEVER list.

---

### B.4-B — Technical routes (8 decisions, D105-D112)

- **Locked**: 2026-05-20 00:25
- **Status**: confirmed (agent 03 tech-routes-and-discoverability already verified all 8)
- **Source**: agent 03 + synthesis Section B.4

#### D105 — `/.well-known/security.txt` (RFC 9116) + `/security` page

**Decision:** Ship at M1.5. Static file at `apps/web/public/.well-known/security.txt` (so it serves as `text/plain` per RFC):

```
Contact: mailto:security@my-quilty.com
Expires: <date — set 6 months out>
Preferred-Languages: en
Canonical: https://my-quilty.com/.well-known/security.txt
Policy: https://my-quilty.com/security
```

`/security` page (`apps/web/app/[locale]/(marketing)/security/page.tsx`) one paragraph: how to report, what we accept, no bug bounty yet.

**Evidence:** Headspace + Calm don't ship security.txt — Quilty wins on day one. Stripe + Vercel both currently expired (agent 03 finding) — D112 CI gate prevents us from same fate.

**Binds:** `security@my-quilty.com` mailbox in D129 roster; D112 CI gate.

#### D106 — `/.well-known/change-password` (RFC 8615) redirect

**Decision:** `apps/web/public/.well-known/change-password` → HTTP 302 redirect to `/account/security`. Chrome + Edge + Safari + 1Password credential managers respect this for "change password" UX.

**Binds:** Header redirect in `apps/web/next.config.ts` redirects block; placeholder until `/account/security` real flow ships at M6+.

#### D107 — `/.well-known/gpc.json`

**Decision:** Static file at `apps/web/public/.well-known/gpc.json`:

```json
{
  "gpc": true,
  "version": 1,
  "lastUpdate": "2026-05-DD"
}
```

We honor GPC per D62 + D100. Publishing the policy signals to crawlers + privacy-watchdogs.

**Binds:** `lastUpdate` reviewed on consent-taxonomy changes (D98 v2 trigger).

#### D108 — Favicon family + apple-touch-icon (placeholder art at M1.5)

**Decision:** Generate placeholder set at M1.5:

- `favicon.ico` (multi-resolution 16/32/48)
- `icon-16.png`, `icon-32.png`, `icon-96.png`, `icon-192.png`, `icon-512.png`
- `apple-touch-icon-180.png`
- `mask-icon.svg` (Safari pinned-tab)

Placeholder design: neutral gradient + "Q" glyph (SVG-rasterized; LLM-generatable). Brand-final art replaces at brand-identity milestone.

Fixes production bug A3.1 (manifest references missing icons → Lighthouse PWA fails).

**Binds:** `apps/web/public/icon-*.png` etc.; `apps/web/app/manifest.ts` references stop being broken.

#### D109 — OG default image (placeholder)

**Decision:** `apps/web/public/og-default.jpg` 1200×630, ≤1MB. Placeholder = brand gradient + "Quilty" wordmark. Referenced by `apps/web/app/layout.tsx` `openGraph.images` metadata.

Brand-final at brand-identity milestone.

**Binds:** Root `Metadata.openGraph.images = ['/og-default.jpg']`; per-page metadata may override.

#### D110 — Manifest depth at M1.5

**Decision:** `apps/web/app/manifest.ts` ships full PWA manifest:

```typescript
{
  id: '/',
  scope: '/',
  start_url: '/en',
  name: 'Quilty',
  short_name: 'Quilty',
  description: '...',
  display: 'standalone',
  display_override: ['window-controls-overlay', 'standalone'],
  background_color: '#ffffff',
  theme_color: '#0a0a0a',
  lang: 'en',
  dir: 'ltr',
  orientation: 'portrait-primary',
  categories: ['health', 'productivity'],
  icons: [/* 192, 512, maskable variants */],
  // screenshots, shortcuts deferred until M3 brand identity
}
```

**Binds:** D108 icons must exist; D125 no Service Worker at M1.5 → manifest still valid + installable.

#### D111 — AI crawler policy extended + Cloudflare Content-Signal

**Decision:** Keep U4 (block training, allow citation). Add to `apps/web/app/robots.ts`:

- Cloudflare Content-Signal header line per crawler block (`content-signal: search=yes, train=no, ai-input=yes`)
- Explicit allowlist for user-initiated AI fetchers (ChatGPT Browse, Claude-Web, Perplexity-Citation) distinct from training crawlers
- Maintain existing block of GPTBot, ClaudeBot, Google-Extended, Applebot-Extended, CCBot, Meta-ExternalAgent, Bytespider

**Binds:** `apps/web/app/robots.ts` extended; existing AI crawler test in Playwright robot.spec.ts updated.

#### D112 — CI gate: security.txt Expires field < 30 days fails build

**Decision:** Add `pnpm verify` step:

```bash
node scripts/check-security-txt-expires.mjs
# Reads apps/web/public/.well-known/security.txt
# Parses Expires: field
# Fails if (Expires - now) < 30 days
```

Wired into CI hygiene job alongside Knip / syncpack / depcruise / type-coverage / secretlint.

**Evidence:** Stripe + Vercel security.txt files are CURRENTLY EXPIRED per agent 03 finding — Quilty avoids same fate via mechanical CI gate.

**Binds:** `scripts/check-security-txt-expires.mjs` ships at M1.5; `pnpm verify` task includes it; CI hygiene job invokes it.

---

### B.4-C — Forms canonical + utilities + error handling (4 decisions, D113-D116)

- **Locked**: 2026-05-20 00:30
- **Status**: confirmed (agents 06 forms-bots-reputation + 07 deeplinks-error-resilience already verified)
- **Source**: agents 06 + 07 + synthesis Section B.4

#### D113 — Forms canonical pattern: RHF + Zod + Server Actions + Result envelope + CSRF + honeypot + Turnstile + aria-live

**Decision:** Every form in `quilty-website` follows the 7-piece canonical recipe:

1. **React Hook Form** — `useForm()` per shadcn `<Form>` wrapper
2. **Zod schema** — single source for both field validation + Server Action input type; `z.input<typeof Schema>` and `z.output<typeof Schema>` shared across client + server
3. **Server Actions** — `'use server'` action accepts the validated input, returns `Result<TSuccess, TFormError>` (D95)
4. **CSRF triple-layer** — D10 + D53 — Origin/Referer check + signed double-submit token + custom `X-Quilty-CSRF` header
5. **Honeypot field** — invisible `<input type="text" name="website" tabindex="-1" autocomplete="off">` (bot signal — humans don't fill; fake-success on trip)
6. **Time-trap** — measure form-rendered-to-submitted; <1.5 seconds = bot signal; fake-success on trip
7. **Turnstile token** — D89 Captcha port verify before Zod runs; CSP CDN allowlisted
8. **`role="status"` aria-live="polite" region** — for async error announcement (WCAG 2.2 AA per D22)

**Order of operations in Server Action:**

1. CSRF triple-layer validate (reject without further processing if fails)
2. Honeypot + time-trap check (fake-success if bot — don't reveal detection)
3. Turnstile token verify via Captcha port
4. Zod schema parse (field-level errors → `Result<_, FormError>`)
5. Domain logic / `EmailSender` / `RateLimiter` / etc.
6. Return `Result<TSuccess, TFormError>`

**M1.5 ships one concrete form:** `/contact` (forms agent recommendation — simpler than waitlist which adds double-opt-in complexity). Newsletter waitlist with double-opt-in lands at M3+ when D122 trigger fires.

**Binds:** `@quilty/captcha` port; `@quilty/security` ports (CSRF utility); `@quilty/observability` (form analytics events); `apps/web/app/contact/page.tsx` + Server Action; shadcn `<Field>` primitive.

#### D114 — Per-route-group error.tsx + loading.tsx (9 files at M1.5)

**Decision:** Distinct error UX per route group:

**Files to add at M1.5:**

- `apps/web/app/[locale]/(marketing)/error.tsx` — branded 500 + retry CTA + return-to-home link
- `apps/web/app/[locale]/(marketing)/loading.tsx` — marketing skeleton
- `apps/web/app/[locale]/(account)/error.tsx` — preserves signed-in chrome; inline "report issue" link to support
- `apps/web/app/[locale]/(account)/account/loading.tsx` — portal skeleton with shimmer
- `apps/web/app/api/auth/error.tsx` — JSON `{ok:false, error}` envelope (Result shape from D95)
- `apps/web/app/api/webhooks/error.tsx` — JSON envelope; webhook-specific error semantics
- `apps/web/app/[locale]/(marketing)/legal/loading.tsx` — legal-page skeleton
- `apps/web/app/[locale]/(marketing)/(content)/loading.tsx` — content-page skeleton (M2+ when MDX content lands)
- `apps/web/app/global-error.tsx` — already exists from M1; review for vendor-name scrub + comment hygiene

**Total: 9 files.** Vercel Issue #69625 (in-group navigation bug) cited by agent 07 as the architectural reason for distinct per-group boundaries.

**Binds:** `@quilty/observability` `ErrorReporter` injected via composition into each `error.tsx`; error → `logError(err, { boundary: '<group>', digest })` chokepoint.

#### D115 — 410 / 451 / 503 status code handling at proxy.ts

**Decision:**

- **410 Gone** — allowlist of paths that were intentionally removed (e.g., `/blog/<retired-post>`). proxy.ts returns 410 with branded "this content has been removed" page. Better SEO than 404 for content that legitimately existed.
- **451 Unavailable for Legal Reasons** — allowlist of paths erased per GDPR Art 17 / DMCA. proxy.ts returns 451 with legal-context page.
- **503 Service Unavailable** — env var `MAINTENANCE_MODE=true` flips proxy.ts to return 503 with maintenance page for all non-`/api/*` routes. API routes return 503 JSON envelope.

**Implementation tier:** origin-side (proxy.ts) at M1.5 — simpler. CloudFront Function intercept (zero-origin-cost-during-outage) is M3+ refinement when zero-downtime maintenance becomes important.

**Binds:** `apps/web/proxy.ts` extended with status-code allowlists + maintenance flag handling; `apps/web/components/site/StatusPage.tsx` shared component renders branded 410/451/503; `@quilty/security/headers` updates `CspBuilder` to allowlist for these tiers.

#### D116 — No Service Worker at M1.5

**Decision:** Do NOT ship a Service Worker. No offline shell. No background sync. No push notifications via web push at M1.5. PWA install still works (manifest + apple-touch-icon + icon-\* per D108 + D110) but app launches require network.

**Rationale:**

- Marginal CWV win for a Next.js 16 site (most CWV gains already in size-limit + Lighthouse budgets per D70/D71)
- HIPAA audit-surface inflation (SW caches = potential PHI cache; even with sanitizer chokepoint, dead-vendor-cache-in-SW is a non-trivial audit concern)
- Next.js 16 has no first-party SW story (would require manual Workbox integration)
- Consumer mental-health peers (Headspace, Calm, BetterHelp) don't ship Service Workers on web tier per agent 13

**Revisit trigger:** M9+ if PWA install becomes a real growth lever; or if offline-mode requested by users post-launch.

**Binds:** No `apps/web/public/sw.js` or equivalent at M1.5. `apps/web/app/manifest.ts` still ships (D110) — PWA install works without SW; offline is the only feature gated by SW.

---

### B.4-D — Email infrastructure (7 decisions, D117-D123)

- **Locked**: 2026-05-20 00:35
- **Status**: confirmed (agent 04 email-deliverability + AWS-recon agent 01 already verified all 7)
- **Source**: agents 04 + 01 + synthesis Section B.4

#### D117 — DMARC ramp plan (8 weeks, coordinated with `quilty-aws/email/`)

**Decision:** 8-week ramp from current `p=quarantine pct=100` → `p=reject pct=100`:

| Week | DMARC policy                       | Action                                                                                      |
| ---- | ---------------------------------- | ------------------------------------------------------------------------------------------- |
| 0    | `p=quarantine pct=100` (current)   | Audit Valimail DMARC reports; identify aligned senders; surface any unauthenticated traffic |
| 2    | `p=quarantine pct=100` (no change) | Monitor for 2 weeks; investigate any anomalies                                              |
| 4    | `p=reject pct=25`                  | First reject tier; observe deliverability + reports                                         |
| 6    | `p=reject pct=50`                  | Halfway tier                                                                                |
| 8    | `p=reject pct=100`                 | Full enforcement                                                                            |

Coordinated with `quilty-aws/email/` DNS layer changes (TF apply). M1.5 sets the schedule; actual TF applies happen in next-sprint coordination with email-infra owner.

**Binds:** `docs/runbook/dmarc-ramp.md` documents the schedule + rollback triggers + Valimail monitoring discipline. SES production-access support case must be filed before week 4 (D-A.3 production bug A3 dependency).

#### D118 — List-Unsubscribe-Post (RFC 8058) one-click handler

**Decision:** BFF handler at `/u/{token}` accepts POST per RFC 8058. Token decodes to `{subscriber_id, list_id, expires_at}` — JWT signed with rotating key from SSM. Mandatory for marketing emails (Gmail/Outlook one-click unsubscribe button); best-practice for transactional.

**Headers in transactional + marketing emails:**

```
List-Unsubscribe: <https://my-quilty.com/u/<token>>, <mailto:unsubscribe@my-quilty.com>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

**Binds:** `apps/web/app/api/u/[token]/route.ts` handler; `@quilty/email` adapter injects List-Unsubscribe headers per send; `unsubscribe@my-quilty.com` mailbox in D119.

#### D119 — Public mailbox roster (M365-routed with BAA)

**Decision:** Eight public mailboxes provisioned at M1.5 via `quilty-m365` repo coordination (with BAA in place):

| Mailbox                       | Purpose                                     | Routes to                                    |
| ----------------------------- | ------------------------------------------- | -------------------------------------------- |
| `support@my-quilty.com`       | Customer support inbound                    | M9+ help-center vendor; M1.5 = founder inbox |
| `legal@my-quilty.com`         | Legal notices, DMCA, GDPR DSARs             | founder inbox + legal-counsel forward        |
| `privacy@my-quilty.com`       | Privacy questions, DSARs                    | same as legal@                               |
| `dpo@my-quilty.com`           | DPO contact (GDPR Art 37)                   | same                                         |
| `security@my-quilty.com`      | Vuln disclosure (security.txt)              | founder + security-team forward              |
| `abuse@my-quilty.com`         | Spam/abuse reports about us or to us        | founder inbox                                |
| `postmaster@my-quilty.com`    | Email delivery issues, RFC standard         | postmaster monitoring                        |
| `dmarc-reports@my-quilty.com` | Valimail aggregate + forensic DMARC reports | automated forwarding to Valimail             |

**Binds:** Coordination with `quilty-m365` repo; M365 BAA must be confirmed in place (verify at M1.5 implementation time).

#### D120 — BIMI deferred to post-USPTO-trademark

**Decision:** Brand Indicators for Message Identification (BIMI) deferred until USPTO trademark filing complete (D-Q.C9 P2 question). Two BIMI tiers:

- **VMC** (Verified Mark Certificate) — $1.5K/year for Gmail blue checkmark — defer to post-launch revenue justifies
- **CMC** (Common Mark Certificate) — $0/year, no checkmark, basic BIMI signal — acceptable interim

Logo requirements (SVG Tiny PS, 32×32 to 256×256, square) deferred to brand-identity milestone.

**Binds:** No BIMI work at M1.5. Trigger to revisit: USPTO trademark filing complete (P2 question C9).

#### D121 — Customer.io Premium as marketing-email adapter (M3+ trigger)

**Decision:** When waitlist activates at M3+ (D122 double-opt-in), web `EmailSender` gains a Customer.io adapter at `@quilty/email/src/adapters/customer-io.ts`. SES retained for transactional (D-B.3 confirmed).

Provider scoring at M3 implementation time:

- Customer.io Premium — BAA available, event-driven, mature
- Loops — modern, lighter alternative
- Customer.io is the M1.5-recommended adapter per agent 04 (waiting on M3 trigger)

**Binds:** `@quilty/email` factory composition switches by template type (`transactional` → SES adapter, `marketing` → Customer.io adapter). Composition root injects both adapters; package wrapper routes by `args.template.tier`.

#### D122 — Double opt-in for marketing list (GDPR + CASL)

**Decision:** When waitlist activates at M3+, marketing list signup ALWAYS double opt-in:

1. User submits email at `/waitlist` form
2. Server records pending subscription + sends confirmation email
3. User clicks confirmation link → `/u/confirm/{token}` route
4. Server promotes pending → confirmed
5. Token expires in 24 hours; resend allowed once per address per 60 minutes (rate-limited)

**Compliance:** GDPR Recital 32 (clear affirmative action) + CASL §6 (express consent record-keeping) + CCPA-aligned (sensitive personal info opt-in).

**Binds:** `apps/web/app/api/u/confirm/[token]/route.ts` handler at M3+; D89 RateLimiter integration; D87 ConsentStore writes `marketing: true` on confirm.

#### D123 — No PHI in email bodies ever (D67 chokepoint extension)

**Decision:** Email content uses notification pattern only:

- ✅ "You have a new message — sign in to see it" (URL to signed-in route)
- ✅ "Your subscription renews on 2026-06-15" (date, no clinical state)
- ❌ "Your mood entry for 2026-05-19: feeling anxious" (clinical state in body)
- ❌ "Your therapist Dr. Smith replied" (relationship + identity in body)

`@quilty/email` factory wraps `EmailSender.sendTransactional()` with sanitizer pass on `args.data` before vendor send. D67 chokepoint extends to email template inputs.

**Binds:** `@quilty/email` factory composition includes `Sanitizer` injection; sanitizer denylist applied to template data; runtime `assertNoPHI` in dev environment per D67 pattern.

---

### B.4-E — Monitoring + status + incident (9 decisions, D124-D132)

- **Locked**: 2026-05-20 00:45
- **Status**: confirmed (agent 09 monitoring-status-incident verified all 9)
- **Source**: agent 09 + synthesis Section B.4

#### D124 — Sentry Uptime + Sentry Crons

**Decision:** Use Sentry's native Uptime + Crons features (1 free monitor each on Business tier). Two monitors at M2: apex `https://my-quilty.com/` + `/api/health` cron. BAA covered by existing Sentry Business contract.

**Rejected alternatives:** BetterStack (no BAA), Checkly (no BAA, duplicates Sentry RUM), CloudWatch Synthetics (high ops cost).

**Binds:** Sentry Business plan retained; no new vendor; monitors configured at M2.

#### D125 — No on-call rotation pre-2nd-engineer

**Decision:** Solo team — Sentry alerts → operator phone (native push) + Slack channel only. **No PagerDuty / incident.io / FireHydrant at M1.5.** Migration trigger = 2nd-engineer hire → **BetterStack On-Call free tier** (not PagerDuty, not paid incident-management vendor).

**Binds:** Sentry alert routing wired in M1.5 commit; trigger condition documented in `docs/runbook/oncall-trigger.md`.

#### D126 — AWS Phase 0 security baseline (`quilty-aws/website-baseline/` next-sprint work)

**Decision:** AWS Phase 0 security services activated in `development` account (the M1.5+next-sprint AWS work):

- GuardDuty (threat detection, ~$3/account/mo + per-finding)
- Security Hub Essentials (aggregation, ~$0.0010/check)
- Config (compliance rules with HIPAA Conformance Pack)
- Inspector Lambda (Lambda scanning, free for Lambda)

Total ~$30-60/mo. Phase 1 (marketing-prod account vending) adds CloudFront WAF + Shield Advanced trigger.

**Binds:** `quilty-aws/website-baseline/` TF layer (next-sprint work outside this repo).

#### D127 — CloudWatch BFF Lambda log retention 14d → 6 years

**Decision:** Lambda log group retention raised from default 14 days to **6 years per HIPAA §164.530(j)** (audit-log retention requirement). Applied via `sst.config.ts` Lambda `logRetention` field.

**Binds:** `sst.config.ts` updated at M1.5; AWS Config rule verifies retention compliance post-deploy.

#### D128 — HIPAA Breach Notification runbook spine

**Decision:** Before M8 launch gate, complete 4-document runbook in `docs/runbook/incidents/`:

- `breach-internal-escalation.md` — SEV1 internal escalation path
- `breach-ocr-portal-submission.md` — HHS Office for Civil Rights notification template (60-day SLA)
- `breach-user-notification.md` — affected-user notification template
- `breach-public-statement.md` — press / status-page statement template

**Binds:** M8 launch gate cannot pass without all 4 documents committed.

#### D129 — OTel single-target rule

**Decision:** `@vercel/otel` pipes to **Sentry OTLP endpoint only** at M1.5. No additional sinks (Honeycomb / Tempo / X-Ray / Datadog). Adding a second OTel target = future trigger.

**Binds:** `apps/web/instrumentation.ts` `registerOTel()` config; D56 OTel-first lock honored.

#### D130 — SEV taxonomy locked

**Decision:** 4-tier severity classification:

- **SEV1**: PHI exposure / data loss / authentication outage affecting >10% of users. Notification SLAs: HIPAA 60-day individual notification (§164.404); status-page within 5 minutes; OCR notification within 60 days if >500 affected
- **SEV2**: Sign-in outage / Stripe outage / authentication blocked for <10% of users. SLA: status-page within 5 minutes; user notification within 1 hour
- **SEV3**: Degraded perf / partial feature outage. SLA: status-page within 1 hour; no individual notification
- **SEV4**: Cosmetic / non-functional. No external SLA

**Binds:** `docs/runbook/incidents/sev-taxonomy.md` documents classification; per-SEV runbook attaches.

#### D131 — AWS Budgets + Cost Anomaly Detection at M1.5

**Decision:** Two free AWS native services activated at M1.5+next-sprint AWS work:

- AWS Budgets — monthly budget alert at $250 → $500 → $1K thresholds (founder-stage tiers)
- Cost Anomaly Detection — ML-based anomaly alerts

Infracost in CI added when `quilty-aws/website-baseline/` lands (next-sprint TF cost preview on PRs).

**Binds:** `quilty-aws/website-baseline/` TF layer; Infracost GH Action.

#### D132 — `status.my-quilty.com` subdomain + Instatus Pro

**Decision:** Reserve `status.my-quilty.com` DNS record at M1.5+next-sprint AWS work. Instatus Pro ($20/mo) activates at M2-M3 trigger when first incident comm becomes valuable.

**Agent 09 brand observation:** Consumer-mental-health peers (Headspace/Calm/BetterHelp/Talkspace/Cerebral/Mindbloom) all SKIP public status pages — Quilty shipping one signals operational maturity differentiator at relatively low cost ($20/mo + ~1 day setup).

**Rejected alternatives:** Statuspage.io (Atlassian, $29-$1500/mo; subscriber-tier hostility), self-host (circular dependency: status page goes down with main site).

**Binds:** DNS record reservation in `quilty-aws/dns/`; Instatus account setup at M2-M3; D124 Sentry Uptime → Instatus webhook for auto-incident creation.

---

### B.4-F — Reputation handle reservation (1 decision, D133)

- **Locked**: 2026-05-20 00:45
- **Status**: confirmed (agent 06 forms-bots-reputation verified)
- **Source**: agent 06 + synthesis Section B.4

#### D133 — Handle reservation matrix at M1.5+

**Decision:** Reserve 12 social/community/developer handles at M1.5+ (mostly cheap to reserve, expensive to lose post-launch). No active posting until brand/content/policy locked.

**Reserved at M1.5+:**

1. Twitter/X — `@quilty` (verify availability; alternatives: `@quiltyapp`, `@my_quilty`)
2. LinkedIn — Company Page `linkedin.com/company/quilty`
3. Threads — `@quilty` (paired with Instagram)
4. Instagram — `@quilty`
5. TikTok — `@quilty`
6. YouTube — `youtube.com/@quilty` channel
7. Pinterest — `@quilty` (consumer-health relevance: wellness boards)
8. Reddit — `u/quilty` profile (NO posting until policy lock per agent 06 sensitive-community caution)
9. Bluesky — custom domain `@my-quilty.com` (cheap; one DNS record)
10. Substack — `quilty.substack.com` (M3+ content trigger; reserve now)
11. Product Hunt — maker profile + product placeholder
12. GitHub Organization — `github.com/quilty` or `github.com/quilty-app`

**Deferred / rejected:**

- Mastodon — instance choice TBD; reserve at federation-strategy lock (post-M9)
- Discord — moderation overhead; defer to community-strategy decision
- Facebook — B2C decline per agent 06; skip with rationale

**Founder presence:** low-key until M3 brand identity (Calm/Headspace pattern, not Plain/Resend).

**Binds:** M1.5 follow-up checklist (post-sprint, not blocking M1.5 commits) — single founder-day of handle reservations. Mailbox D119 `social@my-quilty.com` not required.

---

### B.4 — All cross-cutting decisions LOCKED (D97-D133 across 5 batches A-F)

**Summary of Section B.4 completion:**

- B.4-A consent/legal/trust — D97-D104 (8 decisions)
- B.4-B technical routes — D105-D112 (8 decisions)
- B.4-C forms/error/SW — D113-D116 (4 decisions)
- B.4-D email — D117-D123 (7 decisions)
- B.4-E monitoring/status/incident — D124-D132 (9 decisions)
- B.4-F reputation handles — D133 (1 decision)

**Total Section B.4: 37 decisions locked.**

---

### Section C — Open scope questions LOCKED (D134-D143)

- **Locked**: 2026-05-20 01:30
- **Status**: 4 confirmed-as-default + 6 REVISED based on agent research; **90+ newly surfaced D-decision candidates inventoried below**
- **Source**: 6 parallel research agents (reports 19-24) + prior locked decisions

#### D134 — C5 ERASURE: unified Rust-orchestrated erasure across mobile + web

**Decision (confirmed):** Web `/account/privacy` (signed-in) + `/legal/privacy-choices` (public) both POST to a **single Rust backend endpoint** that runs a saga: per-vendor calls + receipts + immutable audit + mobile-cache-wipe event via EventBridge.

**Rationale:** Web-only path = Cerebral $7M failure mode. Hybrid pattern = BetterHelp / 23andMe complaint pattern. Unified Rust orchestrator is the only architecturally safe path for shared-user products.

**Binds:** `apps/web/app/[locale]/(account)/account/privacy/page.tsx` triggers Rust API; mobile device-local cache wipe via EventBridge fan-out under `quilty.user.*` namespace (reuses D9 logout fan-out infra).

#### D135 — C6 ACCESS + PORTABILITY: unified Rust-orchestrated export

**Decision (confirmed):** Same unified Rust orchestrator produces a **ZIP bundle**: `profile.json + account.csv + subscription.csv + consent-history.json + sub-processors.csv + README.md`. Delivered via **24h-TTL single-use signed CloudFront URL**. Mirrors Spotify / Notion peer pattern.

**Binds:** Web triggers + downloads via signed-URL redirect; Rust backend builds the ZIP; CloudFront short-TTL signed URL serves it; audit log records the download.

#### D136 — C7 PRIVACY LEAD title (NOT "DPO") — REVISED FROM ORIGINAL DEFAULT

**🚨 Decision (revised):** Founder titled **"Privacy Lead"** (NOT "DPO"). Reserve `dpo@my-quilty.com` mailbox per D119 but DO NOT designate founder as DPO under that title. Contract **external DPO-as-a-Service** (VeraSafe ~$5K/yr OR DPO Centre ~£6K/yr — both bundle Art 27 EU representative) at trigger.

**Rationale:** Founder-as-DPO is a **direct fineable risk** under GDPR Art 38(6):

- Austrian DPA fined €5K in 2024 for managing director dually as DPO
- CJEU C-453/21 (X-FAB) confirmed the rule
- Belgian APD fined €50K for compliance head dually serving

**Trigger conditions for external DPO engagement:** first paying EU/UK customer / first DSAR / ~5K EU MAU / 18mo post-launch unconditionally / German user base > 20.

**Binds:** Privacy policy + accessibility statement use "Privacy Lead" title. `dpo@my-quilty.com` mailbox reserved but unstaffed-as-DPO until trigger. M3+ vendor selection: VeraSafe vs DPO Centre comparison memo.

#### D137 — C8 REASON ENUM REVISED — add `taking_break` + `missing_features`, split `unspecified` → `other_not_specified`

**🚨 Decision (revised):** Updated `AccountDeleteReason` enum (D82 amendment):

```typescript
export type AccountDeleteReason =
  | 'too_expensive'
  | 'not_helpful'
  | 'taking_break' // NEW — Headspace/Calm/BetterHelp/Talkspace baseline
  | 'privacy'
  | 'switched_provider'
  | 'missing_features' // NEW — Stripe canonical 8-value enum
  | 'other_specified'
  | 'other_not_specified'; // RENAMED from 'unspecified' for wire-format honesty
```

8 values, 3 changes vs original 6. Locked UX: single-select, **optional** (never gate cancellation), optional 500-char PHI-sanitized comment for `other_specified` + one-line follow-ups for `switched_provider` / `missing_features`. **Single save-attempt per reason** (California "one save" limit). **NO save-attempt on `privacy` or `other_not_specified`** (Cerebral / FTC dark-pattern playbook).

**Binds:** `@quilty/observability/src/ports.ts` `AnalyticsEvent['account_deleted'].props.reason` updated; mobile-side enum harmonization at next mobile sync.

#### D138 — C9 USPTO WORDMARK CONFIRMED: classes 9 + 42 + 44 at M3

**Decision (confirmed):** File "QUILTY" wordmark at M3 in three classes:

- Class 9 — downloadable application software
- Class 42 — SaaS (software-as-a-service)
- Class 44 — mental-health services (protects future "talk to therapist" pivot — USPTO does not allow class corrections post-filing)

Filing basis: **1(b) intent-to-use**, attorney-filed. Total cost: **3 × $350 USPTO + ~$1,200-$2,500 attorney = ~$2,250-$3,550 all-in**.

Use **™** until Certificate of Registration arrives ~2027-2028; switch to **®** only then (improper ® use is TMEP 906.04 fraud).

**Binds:** Delaware C-Corp formation must precede USPTO filing (entity owns mark). M3 trigger condition: brand identity locked + entity formed. Logo (design-mark) deferred to M5.

#### D139 — C10 HIPAA OFFICER DUAL DESIGNATION confirmed (in writing at M1.5)

**Decision (confirmed):** Founder designated as both Privacy Officer (§164.530(a)) + Security Officer (§164.308(a)(2)) **in writing at M1.5**. HHS explicitly permits dual designation at small scale (unlike GDPR Art 38(6) conflict-of-interest constraint).

**Quilty HIPAA scope clarification:** non-covered direct-to-consumer + conditional Business Associate when contracted with covered entities (the **Calm pattern**, NOT Cerebral pattern). Document filed at `quilty-aws/docs/compliance/hipaa-officer-designation.md` (keeps website repo scope clean). Retained 6 years.

**Split trigger:** When 2nd technical engineer hires — Security Officer transfers, Privacy Officer stays.

#### D140 — C11 CMRA MAILBOX (NOT registered agent) — REVISED FROM ORIGINAL DEFAULT

**🚨 Decision (revised):** **CMRA private mailbox** (iPostal1 OR Anytime Mailbox, ~$180-300/yr) for CAN-SPAM § 5(a)(5) physical address. NOT registered agent.

**Rationale:** Registered agent contracts (Northwest / Harbor / CT) explicitly restrict to legal mail. Using a registered agent address in marketing footer = contract breach + risks "valid" CAN-SPAM challenge.

**Single CMRA reused everywhere:**

- CAN-SPAM marketing footer
- CASL physical-address requirement
- App Store / Play developer address
- Stripe merchant address
- HIPAA NPP Privacy Officer contact
- EU Impressum (when relevant)

**Separate Northwest Registered Agent** ($125/yr) for legal correspondence. Total combined: ~$300-425/yr.

**Binds:** M2-M3 mailbox provisioning before first marketing email send (D117 DMARC ramp + D118 List-Unsubscribe both depend on validated CAN-SPAM compliance).

#### D141 — C12 SENTRY DIGEST VISIBLE on user 500 pages (confirmed)

**Decision (confirmed):** Keep `error.digest` visible on user-facing 500 pages.

**Rationale:** OWASP A02/A10 only flag verbose disclosure (stack traces, framework banners, schemas) — opaque hex digests reveal nothing actionable. HIPAA risk = zero (digest is hash of stack trace, not user input). Engineering-led peers (Stripe `req_xxx`, Vercel `REQUEST_ID`, Cloudflare Ray ID, Linear, Plain, GitHub) universally surface reference IDs. Consumer-health peers don't, but Quilty straddles both; engineering pattern wins until tier-1 support team exists.

**Binds:** Existing M1 + M1+1 `error.tsx` retains digest visibility; **but see newly-surfaced D144 below — current implementation has WCAG SC 4.1.3 (AA) violation requiring fix at M1.5**.

#### D142 — C13 SMART APP BANNER DEFERRED to M9+; App Links meta at M2 — REVISED

**🚨 Decision (revised):** Do NOT ship `<meta name="apple-itunes-app">` Smart App Banner at M1.5 or M2. **Instead ship Facebook App Links meta tags at M2** (Headspace pattern: `<meta property="al:ios:app_store_id" content="..."> <meta property="al:ios:url" content="quilty://..."> <meta property="al:android:package" content="app.quilty.myquilty">`).

**Rationale:** 1 of 16 consumer mental-health peers ships Smart App Banner (Talkspace, as Adjust attribution channel only). Headspace category leader explicitly chose App Links. Universal Links via AASA already gives "app installed" banner. Smart App Banner sticky-dismissal means first-shot copy quality matters — wait for M3 brand identity to inform copy.

**Trigger to reconsider Smart App Banner:** M9+ with brand-identity-locked copy + measurable mobile-install-from-web telemetry need.

#### D143 — C14 APPLE PAY MERCHANT VERIFICATION at M7 with Stripe (confirmed)

**Decision (confirmed):** File `/.well-known/apple-developer-merchantid-domain-association` at M7 alongside Stripe integration. Pre-staging is useless — Apple's verifier only runs when Stripe calls Payment Method Domains API to register the domain. 10-minute operation.

**Binds:** M7 trigger ships file + calls Stripe API + verifies domain in Stripe dashboard.

---

## Newly surfaced D-decisions (D144-D195) — comprehensive inventory

Each Section-C research agent was tasked with "secondary mandate: surface what we haven't decided." Result: **~90 candidate items** surfaced. After dedup + folding into existing D-decisions, **52 net-new D-decisions** identified. Below: full inventory, grouped by M-target.

### M1.5-bound (P0 — must ship at M1.5)

#### D144 — Error-page WCAG SC 4.1.3 (AA) violation FIX

`apps/web/app/error.tsx` + `global-error.tsx` lack `role="alert"` + `aria-live="assertive"` + `aria-atomic="true"`. Screen-reader users get no announcement when boundary mounts. **This is a SHIPPED PRODUCTION BUG** — joins the A.3 production-bug list at M1.5 fix slot.

#### D145 — Error-page copy-reference-ID button + mailto support CTA

Add "Copy Reference" button next to `error.digest` rendering + `mailto:support@my-quilty.com?subject=Error+<digest>` CTA. Standard pattern across Vercel / Linear / Plain.

#### D146 — Error-page robots `noindex` meta + cookie banner suppression

Prevent crawl pollution; suppress consent banner on 500 (already-failed state shouldn't prompt cookie acceptance).

#### D147 — Error-page focus-on-mount + retry CTA fallback

Programmatic focus to error heading on mount (screen-reader prompt); retry CTA falls back to "home" link if retry fails twice.

#### D148 — PHI-in-error-message ESLint rule

Custom ESLint rule: block `throw new Error(\`...\${variable}...\`)`template-literal patterns where the variable is potentially PHI (email/phone/dob/etc per D67 denylist). Forces`throw new Error('descriptive_constant')`+`logError(err, { context })` separation.

#### D149 — Privacy Lead title applied to all M1.5 privacy-policy copy

Privacy policy + accessibility statement + sub-processor list use "Privacy Lead" (per D136). DPO mailbox reserved but unstaffed-as-DPO until trigger.

#### D150 — WA MHMDA stand-alone Consumer Health Data Privacy Policy

Washington's My Health My Data Act requires a SEPARATE Consumer Health Data Privacy Policy (not folded into general privacy policy). Opt-in regime for sale/share of consumer health data. Ship at M1.5 alongside main privacy policy stub (M8 lawyer fills both).

#### D151 — Identity-verification policy for DSARs (no photo ID for routine requests)

Per DPG Media €525K fine + EDPB Guidelines 01/2022: photo ID for routine DSARs is the regulator-flagged anti-pattern. Quilty uses **authenticated session + step-up auth (D54 elevated_until window) at signed-in requests** + **email-link verification + optional government ID only for high-risk requests** (account takeover signals).

#### D152 — Per-jurisdiction SLA matrix (internal) + single SLA published

Publish ONE SLA in privacy policy ("30 days, may extend to 60 days for complex requests" — GDPR-aligned). Internal track per-jurisdiction matrix: GDPR 30d, CCPA 45d, internal target 21d, max 60d.

#### D153 — Sensitive-data-class language in privacy policy (CPRA SPI + WA MHMDA + GDPR Art 9)

Explicit naming of "sensitive personal information" + "consumer health data" + "special category data" categories per applicable regime, with consent treatment differentiated (opt-in for sale/share).

#### D154 — WA MHMDA Catch-22 disclosure (Hintze Law reading)

WA MHMDA's erasure-vs-authorisation-retention contradiction needs explicit disclosure language. Adopt Hintze Law's canonical disclosure phrasing in WA-specific section.

#### D155 — Quilty HIPAA scope classification memo

Formal written memo: Quilty is non-covered direct-to-consumer + conditional Business Associate (Calm pattern). Filed at `quilty-aws/docs/compliance/hipaa-scope-classification.md`. Reviewed at every BAA negotiation.

#### D156 — D111 amendment: Applebot vs Applebot-Extended distinction

Robots.ts ALLOWS `Applebot` (Spotlight + Siri crawler) but DISALLOWS `Applebot-Extended` (AI training crawler). Currently lumped together; needs split.

### M2-bound

#### D157 — App Links meta tags in apps/web/app/layout.tsx

```html
<meta property="al:ios:app_store_id" content="<APPSTORE_ID>" />
<meta property="al:ios:url" content="quilty://..." />
<meta property="al:android:package" content="app.quilty.myquilty" />
```

#### D158 — `og:image` 1200×630 + `apple-touch-icon` 180×180 SEO helper

Bake into `@quilty/seo` package's metadata builder.

### M3-bound (entity + brand + USPTO triggers)

#### D159 — Delaware C-Corp formation before USPTO filing

Entity owns the trademark. Form Delaware C-Corp at M3 USPTO trigger (or earlier if fundraising path requires).

#### D160 — Typo-domain defense at M3

Register 3-5 defensive variants (`quiltyapp.com`, `myquilty.com`, `my-quilty.app` already owned, etc.). Budget $100-300/year.

#### D161 — Trademark renewal calendar (§8 declaration years 5-6, §8+§9 years 9-10)

Calendar reminders for USPTO Section 8 + 9 filings. Use Northwest Registered Agent compliance calendar service or build internal.

### M5-bound

#### D162 — Logo color claim — file black/white at M5 unless unique color signature

Logo design-mark filing in black/white (broader protection) unless brand identity has uniquely defensible color signature. Decided post-M3 brand-identity lock.

#### D163 — Consent banner `env(safe-area-inset-bottom)` iOS padding

Banner component honors iOS Safari safe area inset (notch / home indicator). Standard CSS pattern: `padding-bottom: max(1rem, env(safe-area-inset-bottom))`.

### M6-bound

#### D164 — Sign in with Apple via Cognito (App Store Review Guideline 4.8 web parity)

If Google sign-in present, must offer Sign in with Apple for parity per App Store Review Guideline 4.8. Cognito federated identity provider configuration.

#### D165 — Sentry BAA explicit request requirement

Sentry BAA is NOT automatic on Business plan — must be **explicitly requested**. Verify in place at M1.5 implementation time; track in BAA inventory (D169).

### M7-bound (Stripe + payment triggers)

#### D166 — Apple Pay HSA/FSA acceptance (open question for M7 kickoff)

Requires MCC negotiation 8099/8011, LMN (letter of medical necessity) flow. Open question for M7 kickoff.

#### D167 — Apple Pay merchant tokens (MPANs)

M7 requirement for subscription resilience across card-on-file changes.

#### D168 — Express Checkout Element over legacy Payment Request Button

Stripe 2025 guidance: Express Checkout Element is the new canonical surface.

### M8-bound (launch gate)

#### D169 — BAA inventory tracking with HHS template

Formal BAA tracking spreadsheet using HHS template at `quilty-aws/docs/compliance/baa-inventory.xlsx`. Quarterly review.

#### D170 — Sanctions Policy template (Columbia/UB 4-tier)

Required HIPAA document. Adopt Columbia / University at Buffalo 4-tier template.

#### D171 — Annual Risk Analysis cadence with ONC SRA tool

§164.308(a)(1)(ii)(A) requires annual Risk Analysis. ONC SRA tool is the free federal template. Annual calendar reminder.

#### D172 — Incident Response Team formal designation

Single-person solo-team interim; formal team at 2nd engineer hire. Coordinated with D125 on-call.

#### D173 — FTC HBNR (Health Breach Notification Rule) runbook distinct from HIPAA

Pre-launch requirement. Template differs from HIPAA Breach Notification. Add to D128 incident runbook spine.

#### D174 — 30-day soft-delete cooling-off (Notion pattern)

Account-delete via D134 sets `soft_deleted_at`; full erasure runs at +30 days. Allows accidental-delete recovery via re-sign-in within window.

#### D175 — Downstream-vendor erasure-orchestration matrix

`vendor-matrix.toml` tracks erasure orchestration per vendor: Sentry (REST API delete), Amplitude (delete-user API), SES (suppression-list entry), DynamoDB (per-table erasure logic), Cognito (admin delete user), Stripe (delete customer). BetterHelp 20-year settlement duty informs.

#### D176 — Audit-log retention specifics (6yr hashed admin records, NEVER PHI/clear-text)

HIPAA §164.530(j) audit log retention 6 years post-erasure. Records kept = administrative metadata (when/who/what action) HASHED; never PHI; never clear-text emails. Clean Art 17(3)(b) "legal obligation" exception.

#### D177 — Art 16 (Rectification) + Art 21 (Objection) UX

Folded into profile-edit + marketing-preferences pages, NOT separate dedicated pages. GDPR Art 12(2) allows reasonable UI consolidation.

### M9+ (post-launch triggers)

- **D178** — Trademark watch service (TrademarkVision / similar) — defer to post-launch
- **D179** — Brand-protection tools (Markmonitor / BrandShield) — defer to Series A+
- **D180** — Smart App Banner reconsideration with brand-identity-locked copy
- **D181** — Safari Web Push (Declarative, no SW since iOS 16.4) — alternative to D116 SW skip
- **D182** — Madrid Protocol international trademark — 6-month US priority window expires; defer to international-expansion trigger
- **D183** — SOC 2 Type II readiness (~12 months post-launch)
- **D184** — Compliance calendar (annual audit schedule)
- **D185** — NYHIPA contingency watchlist (NY Health Privacy Act draft monitoring)
- **D186** — DPA Art 28 sub-processor clauses (template)
- **D187** — DSAR analytics event privacy via D67 sanitizer chokepoint
- **D188** — COPPA / GDPR-K edge handling (Headspace minimum) — adult product but edge cases
- **D189** — Mobile device-local cache erasure via EventBridge fan-out (Quilty user namespace)
- **D190** — Sec-GPC volume spike preparedness (California AB 566 — Safari native GPC by Jan 1, 2027 — ~30%+ traffic shift anticipated)
- **D191** — NPP (Notice of Privacy Practices) reserved route at `/legal/notice-of-privacy-practices`
- **D192** — State-by-state officer designation scan (verified no additional state-level officer roles required)
- **D193** — Apple News Partner Program — explicitly skipped (not a news publisher)
- **D194** — AASA `activitycontinuation` for Handoff — M9+
- **D195** — iPad UA-sniffing → `Sec-CH-UA-Mobile` detection (iPad reports desktop UA in iPadOS 13+) — as needed

### Items folded into existing decisions (no new D-number)

- ZIP bundle export format → D135 (already specified)
- Mailbox monitoring SLA → D119 (added: weekly review pre-launch)
- Single CMRA address everywhere → D140 (already specified)
- DPO trigger list → D136 (already specified)
- Workforce training (Medcurity $499/yr) → D169 BAA inventory (training is the same operational discipline)
- Sentry replay error-triggered marketing-tier-disabled note → D68 (documented; not a bug)

---

### Section C lock summary

**Total new D-decisions from Section C: 62** (D134-D195).

Section C of original synthesis listed 15 open questions; through bureaucratic review:

- 4 were locked through prior batches (C1-C4 — Amplitude, .com/.app, package taxonomy, AASA scope)
- 10 were locked in this Section C batch (C5-C14 → D134-D143)
- 1 was already locked (C15 → D132 status page)
- 52 NEWLY surfaced D-decisions identified across the 6 secondary-mandate scans (D144-D195)

**Pace check:** decisions log is now ~195 D-decisions for the website. This is normal for a HIPAA-aligned consumer-product foundation. Mobile `quilty_auth` package alone is 33 ports + 27 fakes + dozens of ADRs — our web foundation is operating at similar density.
