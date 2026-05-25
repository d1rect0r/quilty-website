# ADR-0013: PHIScrubber port + 3-layer PHI defense

- **Status:** Accepted
- **Date:** 2026-05-24
- **Last reviewed:** 2026-05-24
- **Deciders:** Volodymyr Petrychenko
- **Originating discussion:** `docs/website_strategy_discussion.md` § D67 + D148
- **Related decisions:** D31 (zero PHI on website tier), D42a (Sentry Business tier), D42d (CloudWatch zero-PHI logs), D67 (PHI sanitizer chokepoint extension), D77 (composition root), D148 (PHI-in-error ESLint rule)
- **Related ADRs:** [ADR-0004](0004-observability-stack.md), [ADR-0009](0009-hexagonal-by-boundary.md), [ADR-0010](0010-composition-root.md)
- **Related research:** FTC Cerebral $7M settlement (March 2023) — capability + configuration analysis; Monument Health $1.5M settlement (April 2024); HHS OCR's tracking-pixel guidance (December 2024 update)
- **Software versions assumed:** `@sentry/nextjs` 10.53, `@quilty/observability` 0.1, `@quilty/security` 0.1, Node 24

## Context

The Cerebral $7M FTC settlement (March 2023) was structurally about a single failure mode: an analytics SDK collected free-text PHI from form fields and shipped it to third-party servers. The settlement explicitly framed this as a "capability + configuration" gap — the vendor SDK had the capability to capture form content, the operator configured it to capture form content, and no chokepoint between the two enforced PHI redaction.

Quilty's website tier carries the D31 invariant (zero PHI on the website runtime). The Cerebral pattern says that invariant is necessary but insufficient — every sink that COULD carry PHI must have a chokepoint, not just the ones we know about today.

Wave 5 (forms-canonical + error-surface expansion) introduced the first user-input surface (`/contact`), which means free-text PHI is structurally possible to reach the email channel (echoed acknowledgement) and the error-reporting sink (Sentry `beforeSend` events) for the first time. The "do nothing" outcome would be: the sanitizer (D67) catches the obvious key-shaped denylist matches, but free-text content in `error.message` or `event.exception.values[].value` would flow through as plaintext.

Pre-Wave-5 state:

- `@quilty/security/sanitize` scrubbed key-shaped PHI (denylist of `email`, `phone`, `ssn`, etc.).
- Three `sentry.{client,server,edge}.config.ts` files each carried a near-identical `beforeSend` hook that called `sanitize()` on parts of the event.
- No author-time guard against `throw new Error(\`got ${email}\`)`.
- No runtime scrub of free-text content (only key-shaped).

## Decision

Ship a **three-layer PHI defense** spanning the entire PHI-touching pipeline:

### Layer 1: Author-time ESLint rule

Custom `no-restricted-syntax` selectors in `eslint.config.mjs` block PHI-denylisted identifier names inside:

- `new Error(\`...${denylisted}...\`)` template literals
- `new Error(denylisted)` bare-Identifier args
- `class extends Error { constructor() { super(\`...${denylisted}\`) } }` custom subclasses
- `errorReporter.captureException(...)` / `Sentry.captureMessage(\`...${denylisted}\`)` observability calls
- `error.message = ...${denylisted}...` assignment
- `logger.{debug,info,warn,error}({ denylisted: ... })` structured-log fields

The denylist (`packages/security/src/domain/sanitizer.ts`) covers HIPAA Safe-Harbor §164.514(b)(2) identifiers, clinical instruments (PHQ-2, PHQ-9, AUDIT-C, DAST, PROMIS, BDI, CSSRS), biometric identifiers, geo-precision identifiers, persistent device identifiers (advertising_id, idfa, gaid — per the FTC Cerebral order's covered-information definition), and care identifiers (claim_id, EOB, NPI, DEA, prescriber_id).

Allowlist (safe to interpolate): `quilty_sub` (HMAC-pseudonymised), `request_id`, `trace_id`, `route`, `error_code`, `flag_name`, `locale`, `version`, `digest`.

The rule fires at PR time + commit time (lint-staged), eliminating the "I forgot to redact" class of regression.

### Layer 2: Runtime sanitizer value-pattern regex pass

`packages/security/src/domain/value-patterns.ts` exports `scrubValuePatterns(value: string)` — runs 6 regex patterns over string leaves:

- email (Unicode-aware via `\p{L}`)
- phone (E.164 + US-format + international variants)
- SSN (9-digit + dashed variants)
- credit card (Luhn-validated 13-19 digits — narrow regex defends against false positives)
- date-of-birth (YYYY-MM-DD, MM/DD/YYYY, DD.MM.YYYY)
- MRN (Epic + Cerner + Athena formats — requires contextual marker to fire, defends against 7-digit false positives)

Replacements are typed placeholders (`[EMAIL]`, `[PHONE]`, `[SSN]`, `[CARD]`, `[DATE]`, `[MRN]`) so future log analysis can count occurrences without exposing values.

`scrubValuePatterns` runs at every sanitizer string leaf — BOTH the synchronous `sanitizeString()` path AND the async `sanitizeAsyncImpl()` path (Wave 5 Pass A caught the async-path-skip-gap as HIGH; both paths now have parity).

### Layer 3: Sink-side PHIScrubber port

New port in `packages/observability/src/ports.ts`:

```ts
export interface PHIScrubber {
  readonly scrubSentryEvent: (event: SentryEventLike) => SentryEventLike | null;
}
```

`SentryEventLike` is a minimal structural shape narrowing the full Sentry `Event` to the surfaces the chokepoint actually touches. Vendor-typed events satisfy structurally; the spread `{...event}` in the adapter preserves un-touched fields (verified by a passthrough test).

Adapter at `packages/observability/src/adapters/phi-scrubber.ts` (`makePhiScrubber()`) scrubs:

- `request.url` (strips query string)
- `request.headers` (Authorization, Cookie, etc.)
- `request.data` (nulled — POST bodies never reach the SDK serializer)
- `exception.values[].value` + `exception.values[].type` (catches PHI in domain-error subclass names)
- top-level `message`
- `breadcrumbs[].message` + `breadcrumbs[].data` (intentionally redundant with `beforeBreadcrumb` for defense-in-depth)
- `extra` + `tags` + `contexts`
- `user.email` + `user.ip_address` (denylist redacts; `user.id` retained because we set it to `quilty_sub`)

Composed at every container tier (server/client/edge). The three `sentry.{client,server,edge}.config.ts` `beforeSend` hooks each call `phiScrubber.scrubSentryEvent(event)` instead of inline-duplicating the scrub logic.

## Consequences

### Positive

- **Cerebral-lesson chokepoint.** Author-time + runtime + sink-side — a regression at any one layer is caught by the next. The structural failure mode FTC §5 targeted is not reachable.
- **Single source of truth for PHI policy.** The denylist + value-patterns live in one module; new PHI fields are added in one place, propagating automatically to every consumer.
- **Vendor swap is a single adapter change.** Replacing Sentry with Datadog / Honeycomb is a swap of `makePhiScrubber()` to a new adapter — `beforeSend` call sites in the Sentry config files would change, but the wrapper interface stays the same.
- **Author-time guard is shift-left defense.** A PR that adds `throw new Error(\`...${email}\`)` fails lint before the reviewer sees it.

### Negative

- **Three layers = three places to update for a new PHI field.** Mitigated by the denylist living in `sanitizer.ts` (one file) and the ESLint regex sharing the same denylist via the `PHI_DENYLIST_REGEX` constant in `eslint.config.mjs`.
- **Sentry beforeSend cost is non-zero.** Each event walks the scrubber once + each string leaf runs 6 regex patterns. For a marketing site at expected volumes this is microseconds per event; the chokepoint discipline outweighs the perf cost.
- **The breadcrumb scrub is intentionally redundant** (both `beforeBreadcrumb` and `scrubSentryEvent` walk breadcrumbs). The PHIScrubber port stays self-sufficient — a future Sentry config that omits `beforeBreadcrumb` still gets breadcrumb-level PHI scrubbing from the port chokepoint.

### Neutral

- **The container-held `phiScrubber` is NOT used by the Sentry init files.** Sentry init runs at module-load before the composition root resolves, so the three `sentry.{client,server,edge}.config.ts` files each construct their own `makePhiScrubber()` instance. The container-held instance is reserved for future non-Sentry consumers (server actions explicitly scrubbing an outbound payload, audit-log emitters). Five fresh instances total at module-load; the factory is stateless so this is behaviorally identical to a singleton.
- **`@quilty/security` does NOT have a `/client` sub-export for the sanitizer.** Wave 5 follow-up I added a `@quilty/security/client` barrel for CSP + redirect-validator helpers; the sanitizer itself remains server/edge-only. `sentry.client.config.ts` is the documented exception that imports `sanitize` for its `beforeSend` chokepoint.

## Alternatives considered

- **Single-layer (runtime only).** The sanitizer alone would catch most cases at runtime but provides no shift-left signal. A PR adding `throw new Error(\`got ${email}\`)` would deploy + first be caught when the error reaches Sentry + the wrapper redacts it — by which point the developer's mental model is wrong and the next PR adds the same pattern again. Author-time rule prevents the mental-model regression.
- **Sentry-vendor-native solution.** Sentry's built-in PII scrubbing has heuristics for common patterns but no Quilty-specific denylist (PHQ-9, AUDIT-C, claim_id, advertising_id, etc.). The PHIScrubber port composes the project's denylist with the vendor's serialization layer.
- **Centralized "redact this value" function called at every emission site.** Distributes the chokepoint responsibility to N call sites; the developer has to remember to call it. The wrapper-around-adapter pattern (the @quilty/observability discipline) makes the chokepoint structural — call sites can't bypass.

## Implementation status

- Author-time: `eslint.config.mjs` `PHI_IN_ERROR_SELECTORS` + tests at `apps/web/__tests__/eslint-phi-error-rules.test.ts`.
- Runtime: `packages/security/src/domain/sanitizer.ts` + `packages/security/src/domain/value-patterns.ts` + tests at `packages/security/src/__tests__/{sanitizer,value-patterns}.test.ts`.
- Sink-side: `packages/observability/src/ports.ts` (port) + `packages/observability/src/adapters/phi-scrubber.ts` (adapter) + tests at `packages/observability/src/__tests__/phi-scrubber.test.ts`. Composition in `apps/web/composition.{server,client,edge}.ts` + `apps/web/sentry.{server,client,edge}.config.ts`.
