# ADR-0028: Server-side ConsentState as single source of truth

- **Status:** Accepted (drafted 2026-05-30, pending review)
- **Date:** 2026-05-30
- **Last reviewed:** 2026-05-30
- **Deciders:** Volodymyr Petrychenko
- **Originating discussion:** `docs/website_strategy_discussion.md` § D35 + § D62 + § D63 + § D87 + § D98 + § D100. Formalizes the consent-architecture decision that was scattered across ADR-0004 + ADR-0005 + CLAUDE.md (README "planned-but-not-yet-written" item #4).
- **Related decisions:** D35 (server-side ConsentState single source of truth — this ADR's canonical decision), D31 (zero PHI in website runtime), D62 (GPC `Sec-GPC` honored at edge), D63 (two-table consent-current + consent-audit layout), D67 (PHI sanitizer chokepoint), D87 (ConsentState contract + identity model), D98 (cookie taxonomy + grandfathering), D100 (GPC honored always wins on migration), D176-D178 (vaping-cessation CHD posture)
- **Related ADRs:** [ADR-0004](0004-observability-stack.md), [ADR-0005](0005-csp-two-tier.md), [ADR-0009](0009-hexagonal-by-boundary.md), [ADR-0010](0010-composition-root.md), [ADR-0013](0013-phi-scrubber-port.md), [ADR-0027](0027-zero-phi-website-runtime-boundary.md)
- **Related research:** FTC Cerebral $7M settlement (March 2023) — consent-before-collection failure; Sephora $1.2M CA-AG settlement (August 2022) — failure to honor GPC; Disney $2.75M (February 2026) + Ford $375K (March 2026) — loss of GPC opt-out across migration; ISO/IEC TS 27560:2023 (consent-record information structure)
- **Software versions assumed:** Next.js 16, `@quilty/consent` 0.1, `@quilty/observability` 0.1, `@quilty/security` 0.1, DynamoDB, Node 24

## Context

A cookie banner is theatre. The load-bearing control is the _server-side state_ that decides whether a vendor SDK is allowed to fire — the banner is the UI that writes to that state, and if the SDK-load gate reads from anywhere other than a single authoritative server-evaluated record, the banner is decorative and the operator is exposed. The FTC Cerebral order ($7M, March 2023) was, at its root, a consent-before-collection failure: data was collected and shipped before any consent gate evaluated. The Sephora CA-AG order ($1.2M, 2022) was a failure to honor a Global Privacy Control signal. Disney ($2.75M, February 2026) and Ford ($375K, March 2026) were failures to carry an opt-out across device/session migration. Each is a different way for the _source of truth_ to be wrong or bypassed.

Quilty handles consumer health data (CHD) under the union of WA MHMDA + MD MODPA + CA CMIA + CCPA/CPRA + FTC HBNR (D177). Those statutes require: affirmative opt-in for non-essential processing of sensitive data, edge-level honoring of `Sec-GPC: 1` (WA AG + CA AG enforcement signals; Sephora precedent), opt-out persistence across devices (Disney precedent), and an auditable consent record (ISO/IEC TS 27560 structure). None of this is satisfiable if consent is a client-side boolean in `localStorage` that the analytics SDK reads optimistically.

The website tier is a thin shell (D5) running zero-PHI (D31, ADR-0027). It owns the **pre-auth, cookie-tier** consent surface: the banner, the persisted consent cookie, and the edge GPC detection. It does NOT own the durable, signed, auditable consent receipt — that is CHD-adjacent record-keeping the Rust backend owns under its HIPAA-aligned posture. The two must be joined cleanly at sign-in so a user's pre-login choice (or GPC opt-out) is carried into their authenticated record without loss.

The "do nothing" outcome: consent lives client-side; the analytics SDK reads it optimistically and fires before the gate resolves (Cerebral); `Sec-GPC: 1` is ignored because the edge never inspected it (Sephora); a fresh-device sign-in starts from default-deny and silently discards a prior GPC opt-out (Disney/Ford); and there is no auditable receipt to show a regulator what the user actually agreed to and when (ISO 27560 gap). Every one of these is a settled enforcement fact pattern.

## Decision

**A single server-evaluated `ConsentState` is the authoritative source of truth for every analytics/marketing SDK decision on the website tier. It is default-deny: `essential: true` by type, every other category `false` until an affirmative grant. `Sec-GPC: 1` is detected and honored at the edge in `proxy.ts`, forcing all sale/share categories off and writing a GPC FORCE-OFF consent record. The pre-auth cookie-tier consent migrates into the signed-in user record at sign-in via `ConsentStore.migrate`, with "GPC honored always wins" merge semantics. The website owns the cookie-tier consent + the banner; the Rust backend owns the durable ISO 27560 consent receipt. All SDK firing is gated through the `@quilty/observability` `wrapAnalytics` chokepoint, which reads the `ConsentState` per call and fails closed.**

### Decision A — Default-deny, five-category taxonomy

The consent taxonomy (`packages/consent/src/domain/cookie-taxonomy.ts`, D98) has five categories: `essential` (always `true`, never gated — session/CSRF/consent cookies), `functional`, `analytics`, `marketing`, `personalization`. The default-deny baseline (`DEFAULT_DENY_STATE`) sets every non-essential category to `false`. `essential: true` is encoded at the _type_ level (`ConsentCategoryState.essential: true`) so a destination mapped to `essential` cannot silently bypass the gate. The taxonomy is versioned (`TAXONOMY_VERSION = 'v1'`) with a grandfathering rule (D98): new/removed/renamed categories trigger a re-consent banner; new vendors inside an existing category do not.

### Decision B — Edge GPC honoring

`proxy.ts` detects `Sec-GPC: 1` and, on a request with no existing consent cookie, writes a GPC FORCE-OFF consent record (`applyGpcForceOffCookie`) with `analytics/marketing/personalization: false`, `gpc_detected: true`, `gpc_honored: true`. The detection is header-authoritative (`detectGpcFromHeaders` in `packages/consent/src/domain/gpc-detector.ts`) — only the literal value `1` is an opt-out; `0`/absent/unparseable means "no opt-out asserted" and is NOT opt-in. The consent record distinguishes `gpc_detected` (the raw per-request header signal) from `gpc_honored` (the persisted override flag), because a session that started under GPC must keep its opt-out even on a later request where the header is absent (D100). Edge honoring is mandatory per WA AG + CA AG enforcement (Sephora $1.2M precedent, D62).

### Decision C — Cookie-tier → user-tier migration at sign-in

`ConsentStore.migrate(from, to)` (`packages/consent/src/ports.ts`) runs on the auth callback to promote the anonymous cookie-tier record into the signed-in user record so a fresh-device sign-in inherits the pre-login preference. The merge (`mergeConsentSnapshots` in `packages/consent/src/domain/migrate.ts`) applies, in order:

1. **GPC honored always wins** — if either side carries `gpc_honored: true`, the merged record forces `analytics/marketing/personalization` off and stamps `gpc_honored: true` (Disney $2.75M Feb 2026 + Ford $375K Mar 2026 — the cross-device loss-of-opt-out vector).
2. **Explicit grant beats default-deny** — when neither side is GPC-honored, each category resolves `from OR to` so an explicit grant from either record propagates.
3. **Most recent `updated_at` wins** on the timestamp field; a real timestamp beats `null`.
4. `essential` always `true`; `version` follows the destination snapshot.

Consent identity is a discriminated union (`ConsentIdentifier`): anonymous users keyed by `cookie_id`, signed-in users by `user_id_hash` (the **hashed** form of `quilty_sub` — never the raw value, per D67 + ADR-0027). The hash is the only consent identifier that crosses the boundary.

### Decision D — Persistence: two-table layout (current + audit)

The `ConsentStore` port persists to a two-table DynamoDB layout (D63): `consent-current` (the live record per identity) + `consent-audit` (the append-only history of every change, for the ISO 27560 receipt trail). The in-memory adapter (`makeInMemoryConsentStore`) is the production wiring at scaffold; the DynamoDB adapter (`packages/consent/src/adapters/dynamodb.ts`) lands when the two-table layout ships in `quilty-aws`. The store's `set`/`migrate` write paths are the seam the audit table hangs off.

### Decision E — SDK gating via the observability chokepoint

Every analytics/marketing SDK call is gated through `wrapAnalytics` (`packages/observability/src/domain/wrap-analytics.ts`), which reads the `ConsentReader` snapshot **per call** and evaluates a per-destination consent category (`product-analytics` → `analytics`, `lifecycle-marketing` → `marketing`, etc. via `DEFAULT_CONSENT_CATEGORY_BY_DESTINATION`). The gate is **fail-closed**: a thrown or rejected read no-ops every destination. The `ConsentReader` port is owned by `@quilty/consent` (the provider, per ADR-0009 port-ownership), and consumed by `@quilty/observability`. The production reader is `makeServerConsentReader`, wired once per runtime in `apps/web/composition.server.ts`; the default baseline is `makeDefaultDenyConsentReader`. Because the gate is composed into the wrapper and the raw vendor adapter is not importable (ADR-0010 + ADR-0027), no call site can fire an SDK without passing the consent gate.

### Decision F — Division of ownership with the Rust backend

The website owns the **pre-auth, cookie-tier** consent (the banner UI in `packages/consent/src/components/Banner.tsx`, the persisted `__Host-quilty_consent` cookie, the edge GPC detection). The **Rust backend owns the durable, signed ISO/IEC TS 27560 consent receipt** — the authoritative record-keeping for what an authenticated member agreed to, when, under which policy version. At sign-in, the migrated cookie-tier state is the _input_ that seeds/updates the backend's receipt; the backend's receipt is the _system of record_ for audit and DSAR (ADR-0025). The website never holds the durable receipt because that record-keeping is CHD-adjacent and belongs behind the HIPAA-aligned boundary (D31, ADR-0027). The website's `consent-audit` table is the website-tier change log; the backend's receipt store is the legal record.

## Consequences

### Positive

- **Cerebral consent-before-collection failure is foreclosed.** No SDK fires without passing the server-evaluated, fail-closed gate; default-deny means the absence of a decision is "no," not "yes."
- **Sephora GPC failure is foreclosed.** `Sec-GPC: 1` is honored at the edge before any client code runs; the FORCE-OFF record persists the opt-out.
- **Disney/Ford cross-device loss-of-opt-out is foreclosed.** "GPC honored always wins" survives the cookie-tier → user-tier migration; a fresh device inherits the prior opt-out.
- **Single source of truth.** The taxonomy, the default-deny baseline, the merge rules, and the per-destination category map each live in exactly one module; a new category or vendor is a localized change.
- **Clean boundary with the backend.** The website holds the pre-auth/cosmetic surface; the backend holds the legal receipt — neither duplicates the other, and the migration step is the one well-defined join.

### Negative

- **The fail-closed gate can silently suppress analytics.** A consent-read failure no-ops every destination, so a misconfigured reader looks like "no events" rather than an error. Mitigated by the optional `Logger` surfacing `analytics_consent_read_failed` to CloudWatch (D42d).
- **The two-table audit layout is write-amplified.** Every consent change writes both `consent-current` and `consent-audit`. Acceptable: the audit trail is the ISO 27560 + DSAR (ADR-0025) requirement, not optional.
- **Migration semantics are subtle.** "GPC honored always wins" + "explicit grant beats default-deny" + "latest timestamp wins" interact in ways that demand contract tests (they have them) and careful review on any change — a wrong merge rule is a Disney-class exposure.
- **Cookie-tier and user-tier can briefly diverge.** Between sign-in and the `migrate` call, two records exist; the merge is the reconciliation point. The auth-callback ordering must run `migrate` before the first authenticated analytics call.

### Neutral

- **The DynamoDB adapter is not yet wired in production.** The in-memory `ConsentStore` is the scaffold wiring; the two-table DynamoDB adapter activates when `quilty-aws` ships the layout (D63). The port contract + merge semantics are already locked, so activation is an adapter swap (ADR-0009).
- **`gpc_detected` vs `gpc_honored` is a deliberate two-field split.** One is the live per-request signal, the other the persisted override; collapsing them would let a stale source-request value masquerade as the current signal. The split is documented in `ports.ts` + `proxy.ts`.
- **The cookie is intentionally not `httpOnly`.** A future `useConsent()` client hook reads it; the `__Host-` prefix (D7) locks out cross-subdomain writes, which is the actual threat (a MITM on `auth.my-quilty.com` pre-setting consent).

## Alternatives considered

### Alternative A: Client-side consent (localStorage boolean read by each SDK)

- **What it is:** Store consent in `localStorage`; each SDK reads it before firing.
- **Why rejected:** This is the Cerebral architecture. The SDK reads optimistically, races the gate, and fires before consent resolves; there is no edge GPC honoring and no auditable server record. Client-side consent cannot satisfy MHMDA/CMIA opt-in-before-collection or the Sephora GPC requirement.

### Alternative B: Single consent record owned entirely by the website

- **What it is:** The website holds the durable, signed consent receipt too; no backend involvement.
- **Why rejected:** The durable receipt is CHD-adjacent legal record-keeping that belongs behind the HIPAA-aligned boundary (D31, ADR-0027). Holding it on the zero-PHI marketing tier would either violate the boundary or duplicate a record the backend must own for DSAR (ADR-0025). The split (website = pre-auth cookie tier; backend = durable receipt) keeps each record in its correct boundary.

### Alternative C: Honor GPC only client-side (via `navigator.globalPrivacyControl`)

- **What it is:** Read the browser property after page load and suppress SDKs client-side.
- **Why rejected:** The property is only available after client code runs — too late to gate edge/server decisions, and unreadable by the BFF. The Sephora precedent (D62) requires honoring the _header_ (`Sec-GPC: 1`) at the edge; `proxy.ts` is the only place that sees it before any SDK could fire.

### Alternative D: Opt-out (default-allow) consent

- **What it is:** Default every category ON; let users opt out.
- **Why rejected:** WA MHMDA + MD MODPA + CA CMIA + GDPR Art 9 all require affirmative opt-in for non-essential processing of sensitive/CHD categories. Default-allow is a §5 deceptive-practice and a CHD-statute violation. Default-deny is the only defensible baseline (mirrors ADR-0025 Decision C's research-tier opt-in rationale).

## Compliance / Verification

- **Default-deny + taxonomy:** `packages/consent/src/__tests__/{default-deny-consent,cookie-taxonomy}.test.ts`.
- **GPC detection:** `packages/consent/src/__tests__/gpc-detector.test.ts` (only `1` is opt-out; `0`/absent/garbage is not) + `GpcHonoredIndicator.test.tsx`.
- **Migration semantics:** `packages/consent/src/__tests__/migrate.test.ts` (GPC-wins + explicit-grant + timestamp rules) + `consent-store.contract.test.ts` (port contract across adapters).
- **SDK gating:** `packages/observability/src/__tests__/wrap-analytics.contract.test.ts` (per-destination consent gate + fail-closed read).
- **Edge write:** `proxy.ts` `applyGpcForceOffCookie` is exercised end-to-end; module-init throw guards a registry drop of the consent cookie.
- **Import-graph chokepoint:** `.dependency-cruiser.cjs` + `eslint.config.mjs` `no-restricted-imports` (D35 message) ensure no SDK is reachable outside `@quilty/observability` (shared with ADR-0027).
- **Banner UI:** `packages/consent/src/__tests__/Banner.test.tsx`.

## Revisit triggers

- **DynamoDB two-table adapter activation (D63)** — verify the `consent-audit` write path produces an ISO 27560-shaped record + reconciles with the backend receipt at sign-in.
- **Backend ISO 27560 receipt contract finalized** — confirm the migration step seeds/updates the backend receipt and that the website never becomes the system of record.
- **New consent category or taxonomy version bump (D98)** — triggers the re-consent banner path; verify grandfathering rules + migration of existing v1 records.
- **New analytics/marketing destination** — add to `DEFAULT_CONSENT_CATEGORY_BY_DESTINATION`; verify the per-destination gate before wiring the adapter.
- **State CHD-law amendment** changing GPC, opt-in, or cross-device-persistence requirements — full review of the merge rules + edge honoring.
- **FTC / state-AG enforcement against a peer for consent or GPC failure** — audit the gate, the edge detection, and the migration against the new fact pattern.
- **First B2B / employer-wellness channel (D178)** — re-evaluate whether the consent model needs a sponsor/plan dimension.

## References

- FTC Cerebral settlement ($7M, 2023-03, consent-before-collection): <https://www.ftc.gov/news-events/news/press-releases/2024/04/ftc-action-leads-7-million-judgment-against-cerebral-failing-secure-sensitive-consumer-data>
- CA-AG Sephora settlement ($1.2M, 2022-08, GPC non-honoring): <https://oag.ca.gov/news/press-releases/attorney-general-bonta-announces-settlement-sephora-part-ongoing-enforcement>
- CA-AG Disney / Ford GPC-persistence actions (2026): <https://oag.ca.gov/privacy/ccpa>
- Global Privacy Control specification: <https://globalprivacycontrol.org/>
- CCPA §7025 opt-out preference signals: <https://cppa.ca.gov/regulations/>
- WA MHMDA (Ch. 19.373 RCW): <https://app.leg.wa.gov/RCW/default.aspx?cite=19.373>
- MD MODPA Section 14-4708 (data minimization): <https://mgaleg.maryland.gov/2024RS/bills/sb/sb0541E.pdf>
- ISO/IEC TS 27560:2023 consent-record information structure: <https://www.iso.org/standard/80392.html>
- Strategy doc D35 + D62 + D63 + D87 + D98 + D100: `docs/website_strategy_discussion.md`
