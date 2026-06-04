# Architecture blueprint

> **Status:** Living document. Updated at every architectural decision. Last full sync: M1.5 close + Wave-1-close research synthesis (8 reference-repo agents over 2 rounds).
>
> **Purpose:** The single reference for "where does X go" + "what shape does X take" decisions. Consult before adding any new file/directory/package. Update whenever a research-grade finding changes a convergent pattern.
>
> **What this is NOT:** A prescriptive "do exactly this" blueprint. The convergent patterns are family-shaped — production teams diverge on details. This doc captures the _convergent core_ + _our specific divergences with rationale_.

---

## 1. Workspace shape (today + projected)

### Today (M1.5 close)

```
quilty-website/
├── apps/
│   └── web/                  # Next.js 16 App Router product surface
├── packages/                 # 8 workspace packages, all "private": true
│   ├── security/             # PHI sanitizer + CSP/headers + redirect validator + forms primitives
│   ├── observability/        # Analytics + ErrorReporter + Logger + Replay + FeatureFlags + wrappers
│   ├── consent/              # Cookie taxonomy + GPC + ConsentReader port (owned here) + Banner stub
│   ├── email/                # EmailSender port + in-memory + SES skeleton
│   ├── captcha/              # CaptchaVerifier port + in-memory + Turnstile skeleton
│   ├── rate-limit/           # Sliding-window RateLimiter + in-memory + DynamoDB skeleton
│   ├── seo/                  # JSON-LD builders + OG metadata + JsonLd component
│   ├── content/              # Zod block schemas + 7 React block components + Velite config
│   └── shared-types/         # OpenAPI codegen target (empty until M5)
├── docs/
│   ├── adr/                  # 9 ADRs (0000-template + 0001 + 0002 + 0003 + 0004 + 0005 + 0006 + 0007 + 0008 + 0009 + 0010 + 0011)
│   ├── architecture/         # THIS FILE
│   ├── research/             # Round-2/5/6 research archives
│   └── runbook/              # DMARC ramp, BAA inventory, SST deploy
├── turbo/                    # Turborepo generators
├── .changeset/               # (when changesets land)
└── sst.config.ts             # SST 4.x IaC
```

### Projected (18-24 month trajectory)

Based on R4 research (Cal.com / Trigger.dev / Mastra / Payload history reads):

```
quilty-website/
├── apps/
│   ├── web/                     # primary BFF — never extracted
│   ├── worker/                  # ONLY when a job needs >15s runtime or different scaling (M7+)
│   └── (possibly) marketing/    # ONLY if marketing site separates from portal (post-M9, low probability)
├── packages/                    # workspace-only (private:true) — never published
│   └── ... (current 9 + at most 1-2 more by M9)
├── internal-packages/           # emerges around M5-M6 when 2nd app/runtime needs shared code
│   └── testing/                 # cross-package test factories — extract when 2+ packages need them
├── tools/                       # tsc-compiled tooling that lives outside apps/ (post-M3)
├── scripts/                     # bash/node one-shots (add when first script lands)
└── ...
```

**Hard rules from R4:**

- `internal-packages/` tier emerges at ~month 18-25; don't create early
- Cross-cutting primitives (clock, config, errors, HTTP client) STAY in `apps/web/lib/` for years — extraction is consumer-driven, not aesthetic-driven
- `apps/worker/` only when 3 concrete jobs can be named that won't fit in a Route Handler
- `packages/` may stay at ~9 forever; growth is not a virtue

---

## 2. `apps/web/` internal shape

### Current structure

```
apps/web/
├── app/                              # Next.js App Router
│   ├── [locale]/
│   │   ├── (marketing)/              # marketing group layout
│   │   └── (account)/                # portal group layout
│   ├── api/
│   │   ├── auth/{callback,session,refresh,logout,backchannel-logout}/route.ts  # 501 stubs until M6
│   │   └── webhooks/stripe/route.ts                                            # 501 stub until M7
│   ├── error.tsx + global-error.tsx + not-found.tsx
│   ├── layout.tsx + page.tsx
│   ├── manifest.ts + sitemap.ts + robots.ts
├── components/
│   ├── site/                         # Header, Footer, SkipLink, FocusOnNavigate
│   ├── account/                      # PortalNav, PortalSidebar
│   └── dev/                          # Spotlight (dev-only)
├── lib/
│   ├── auth/                         # CLAIMED — flat Lucia-style modules at M6
│   ├── api/                          # CLAIMED — Rust backend HTTP client at M5
│   ├── billing/                      # CLAIMED — Stripe code at M7
│   ├── flags/features.ts             # typed feature-flag catalog
│   ├── get-container.ts              # composition-root accessor
│   └── utils.ts                      # cn() — shadcn convention
├── composition.{server,client,edge}.ts   # per-runtime composition roots
├── proxy.ts                          # Next.js 16 middleware-equivalent (CSP + nonce + headers)
├── instrumentation.ts                # OTel + Sentry init
├── sentry.{client,server,edge}.config.ts
└── tests/playwright/                 # E2E + a11y + security smoke
```

### Projected `apps/web/lib/` evolution (R4 evidence)

Files that ALWAYS appear in mature `lib/` directories:

| File / dir                  | Appears around            | Source pattern                                                               |
| --------------------------- | ------------------------- | ---------------------------------------------------------------------------- |
| `auth/`                     | M6                        | Lucia / Auth.js / Cal.com all use flat modules; no port abstractions         |
| `safe-action.ts`            | First Server Action lands | `createSafeActionClient` tiered clients (Midday, Inbox-Zero, Rallly)         |
| `route-handler.ts`          | ~8-10 Route Handlers      | `defaultResponderForAppDir`-style wrapper (Cal.com canonical)                |
| `api/`                      | M5                        | Rust backend client; one file per endpoint group                             |
| `billing/`                  | M7                        | Stripe SDK init + verify-webhook + idempotency + dispatch                    |
| `forms/<feature>.schema.ts` | First form ships          | Zod schema shared client+server (Catalyst, Conform, Next.js docs convergent) |
| `clock.ts`                  | Cross-cutting need        | Stays flat for years (Cal.com still has `lib/clock.ts` at year 4)            |
| `errors.ts`                 | First domain error        | Stays flat                                                                   |

Files that EMERGE later (don't pre-create):

| File / dir                     | Trigger                                             | When     |
| ------------------------------ | --------------------------------------------------- | -------- |
| `modules/` (vertical features) | `lib/` grows past ~30 files OR feature teams emerge | ~M5-M6   |
| `tasker.ts` / `lib/jobs/`      | EventBridge wiring lands                            | M6-M7    |
| `cache/`                       | Vendor cache (Redis/DAX) lands                      | Post-M7  |
| `http/`                        | Outbound HTTP-client primitives accumulate          | Variable |

### Projected `apps/web/app/api/` natural shape (R4 evidence)

```
app/api/
├── auth/                # 3-6 OIDC routes (current 5 stubs)
├── cron/                # scheduled handlers (when SST cron lands)
├── webhooks/            # inbound from third parties (Stripe, Cognito EventBridge, etc.)
│   └── stripe/route.ts  # canonical pattern: verify → Zod-parse → idempotency → dispatch
├── healthcheck/         # standard
├── _lib/                # parseRequestData.ts + defaultResponder.ts (appears once 8+ routes exist)
└── <feature>/           # one segment per BFF endpoint group (account, subscription, etc.)
```

---

## 3. Workspace package shape (canonical)

```
packages/<role>/
├── package.json         # exports: "." + optional "./server" + "./testing"; sideEffects appropriately
├── tsconfig.json
├── vitest.config.ts
├── vitest.setup.ts      # optional — for server-only mocks
├── README.md
└── src/
    ├── index.ts         # public barrel — named re-exports only (no `export *`)
    ├── ports.ts         # role-shaped interfaces (driven ports only at our scale)
    ├── errors.ts        # domain error types (optional)
    ├── domain/          # business logic + factory wrappers
    │   ├── wrap-<port>.ts   # factory wrappers (sanitizer + consent + ...)
    │   └── <pure>.ts        # stateless helpers
    ├── adapters/        # vendor-bound implementations (META-1 isolation point)
    │   ├── <vendor>.ts      # one file per vendor; vendor name ONLY here
    │   └── in-memory.ts     # both production wiring + canonical test fake
    ├── server/          # optional — server-only entry points
    │   ├── index.ts         # carries `import 'server-only'`
    │   └── <module>.ts
    ├── components/      # optional — React components owned by this package
    ├── testing/         # in-memory fakes for cross-package consumer tests
    │   └── index.ts
    └── __tests__/       # colocated unit tests
        └── <module>.test.ts
```

### package.json hygiene

```jsonc
{
  "name": "@quilty/<role>",
  "version": "0.1.0",
  "description": "<concise role description>",
  "private": true,
  "sideEffects": false, // or array form if server-only barrel
  "type": "module",
  "exports": {
    ".": { "types": "./src/index.ts", "default": "./src/index.ts" },
    "./server": { "types": "./src/server/index.ts", "default": "./src/server/index.ts" },
    "./testing": { "types": "./src/testing/index.ts", "default": "./src/testing/index.ts" },
  },
  "scripts": {
    "lint": "eslint src --max-warnings 0",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "typecheck": "tsc --noEmit",
  },
  "engines": { "node": ">=24.0.0 <25.0.0", "pnpm": ">=10.0.0 <11.0.0" },
  "dependencies": {
    /* ... */
  },
  "peerDependencies": { "next": "^16.0.0", "react": "^19.0.0" },
}
```

**Turborepo Just-in-Time pattern**: `exports` points to `./src/*.ts` directly. No build step for internal packages. Next.js 16 transpiles natively.

---

## 4. Hexagonal patterns — what we DO and DON'T abstract

### Ports we DO have (driven, vendor-isolated, factory-wrapped)

| Port                                           | Reason it earns the abstraction                                                     |
| ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| `Sanitizer` (@quilty/security)                 | Composed via factory wrappers across all observability adapters; the PHI chokepoint |
| `RedirectValidator` (@quilty/security)         | Closes over caller-provided allowlist (real state)                                  |
| `Analytics` (@quilty/observability)            | Vendor-swappable (Amplitude today); consent gate composes via `wrapAnalytics`       |
| `ErrorReporter` (@quilty/observability)        | Vendor swap (Sentry); sanitizer composes via `wrapErrorReporter`                    |
| `Logger` (@quilty/observability)               | Runtime swap (CloudWatch / browser); sanitizer composes via `wrapLogger`            |
| `Replay` (@quilty/observability)               | D68 floor enforcement via `wrapReplay`                                              |
| `FeatureFlagEvaluator` (@quilty/observability) | Vendor-swappable (typed env-vars today → a flag vendor at trigger)                  |
| `ConsentReader` (@quilty/consent)              | Multiple production impls (default-deny, server cookie reader, future banner)       |
| `EmailSender` (@quilty/email)                  | Vendor swap (in-memory → SES); sanitizer composes via `wrapEmailSender`             |
| `CaptchaVerifier` (@quilty/captcha)            | Vendor swap (in-memory → Turnstile); production-guard on the in-memory adapter      |
| `RateLimiter` (@quilty/rate-limit)             | Storage swap (in-memory → DynamoDB); auth-adjacent load-bearing                     |

### What we explicitly DON'T abstract (R1 evidence)

| Surface                             | Why no port                                                                                                                                                                                               |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Auth / session / CSRF / step-up** | Lucia, Auth.js consumers (Cal.com), Vercel sample all use flat modules with concrete functions for in-house BFFs. The textbook session/token/CSRF port surface is library shape (Auth.js), not BFF shape. |
| **Cookie writes**                   | Direct `cookies().set()` calls. No `CookieWriter` interface in any reference repo.                                                                                                                        |
| **CSP / Security headers**          | Stateless functions exported directly from @quilty/security. Collapsed from factory shape in OPS-1.                                                                                                       |
| **Server Actions**                  | Function exports from `apps/web/actions/<feature>/<verb>.ts`. The `next-safe-action` wrapper provides the chokepoint; no per-action port.                                                                 |
| **Route Handlers**                  | Function exports from `apps/web/app/api/<feature>/route.ts`. `defaultResponderForAppDir`-style wrapper provides the chokepoint; no per-handler port.                                                      |
| **Step-up auth**                    | Session row column flip (`elevated_until` column) — no `StepUpAuthService` port.                                                                                                                          |
| **OAuth state**                     | Three short-lived cookies (state + nonce + code_verifier), each 10-min TTL. No state-store port.                                                                                                          |

### Composition discipline (ADR-0010)

- Composition happens once per Next.js runtime in `composition.{server,client,edge}.ts`
- Per-runtime `globalThis` slot + per-runtime accessor (`getServerContainer` / `getClientContainer` / `getEdgeContainer`)
- Container is a discriminated union (`ServerContainer | ClientContainer | EdgeContainer`) tagged by `runtime` literal (ADR-0011)
- Cross-cutting wrappers compose AT THE FACTORY LAYER, not at call sites
- The composition root holds long-lived adapters (vendor SDKs); the auth session is per-request and read via `getCurrentSession()` helper at the call site, NOT through the Container

---

## 5. Server Actions (Wave 2-3 readiness)

### File shape (R5 + R3 convergent)

```
apps/web/
├── lib/
│   ├── safe-action.ts            # createSafeActionClient + tiered (actionClient / authActionClient / adminActionClient)
│   ├── route-handler.ts          # defaultResponder-style wrapper (modeled on Cal.com's pattern)
│   ├── auth.ts                   # cache()-wrapped getCurrentSession() with `import 'server-only'`
│   └── forms/
│       └── <feature>.schema.ts   # Zod schema co-located, shared client+server
├── actions/                      # feature-grouped Server Actions (top-level dir, parallel to app/)
│   └── <feature>/<verb>.ts       # one file per verb, `'use server'` at file top
└── app/                          # Next.js App Router (pages + Route Handlers)
```

### Canonical Server Action shape

```ts
// apps/web/actions/account/update-profile.ts
'use server';
import { authActionClient } from '@/lib/safe-action';
import { updateProfileSchema } from '@/lib/forms/account.schema';

export const updateProfile = authActionClient
  .inputSchema(updateProfileSchema)
  .action(async ({ parsedInput, ctx }) => {
    // ctx.session is narrowed (auth middleware ran)
    // throw SafeError for typed failure modes
    // return data on success
    // redirect() OUTSIDE try/catch (it throws NEXT_REDIRECT internally)
  });
```

### Tiered action clients

```
actionClient        # base — no auth required (signup intent, contact form)
authActionClient    # session required (account mutations, subscription changes)
adminActionClient   # admin role required (future)
```

Each tier composes middlewares: rate-limit, telemetry, audit logging, PHI assertion.

### Canonical Route Handler shape

```ts
// apps/web/app/api/webhooks/stripe/route.ts
import { defaultResponder } from '@/lib/route-handler';
import { verifyStripeWebhook } from '@/lib/billing/verify-webhook';
import { dispatchToEventBridge } from '@/lib/billing/dispatch';

export const POST = defaultResponder(async (req) => {
  const event = await verifyStripeWebhook(req); // throws on signature mismatch
  await dispatchToEventBridge(event); // forwards to Rust consumer
  return { received: true }; // wrapper formats as NextResponse.json + 200
});
```

### Error response shape (R3 convergent)

**`{ message: string, status: number }`** — NOT RFC 7807 Problem Details (not in production use).

For Server Actions: `next-safe-action`'s `{ data?, validationErrors?, serverError? }` discriminated union.

### Discipline

- `'use server'` at FILE TOP, never per-function
- `redirect()` OUTSIDE try/catch (it throws `NEXT_REDIRECT` internally)
- Validation re-runs on the server even when client validated
- Logging via wrapped logger; never `console.log` directly (enforced by ESLint)
- Per-action `requestId` (UUID4) logged server-side; never echoed to response body

---

## 6. Form pattern (Wave 2-3 readiness)

### Convergent shape (R5)

| Layer                   | Pattern                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------- |
| Submission target       | Server Action (NOT Route Handler) for first-party forms                                                   |
| Schema                  | `lib/forms/<feature>.schema.ts` — Zod shared client+server                                                |
| Validation              | `parseWithZod` via Conform; server is the authority                                                       |
| Return shape            | `next-safe-action` discriminated union or Conform's `SubmissionResult`                                    |
| Bot defence layering    | Edge rate-limit → honeypot → time-trap → CAPTCHA (cheap → expensive)                                      |
| Honeypot                | Encrypted hidden field with rotating name (`name__confirm`)                                               |
| Time-trap               | HMAC-signed render timestamp; min 1500ms interaction time                                                 |
| CAPTCHA                 | Turnstile only on signup / password-reset / payment-method change                                         |
| CSRF                    | Next.js's Origin check + encrypted action IDs cover Server Actions; double-submit only for Route Handlers |
| Progressive enhancement | `<form action={serverAction}>`, NOT `onSubmit`. `noValidate` post-hydration only.                         |
| Error display           | Field-level inline + form-level summary, both `aria-live="polite"`                                        |

### Forms-canonical pattern (D113) — implementation location

`@quilty/security`'s `csrf.ts` + `honeypot.ts` + `time-trap.ts` stubs ship the contract surface today. Real implementation lands when first form ships (Wave 2-3).

---

## 7. Webhook receiver pattern (Wave 5-7 readiness)

### Convergent shape (R2)

```
apps/web/app/api/webhooks/<provider>/route.ts
apps/web/lib/billing/             # for Stripe (R2 reference)
├── verify-stripe.ts              # constructEvent + raw-body extraction
├── idempotency.ts                # DDB-backed dedup (ONLY for non-idempotent side effects)
└── dispatch.ts                   # EventBridge fan-out → Rust consumer
```

### Canonical Route Handler body (R2)

```ts
export const POST = defaultResponder(async (req) => {
  const event = await verifyStripeWebhook(req); // throws on signature mismatch
  await dispatchToEventBridge(event); // queue-dispatch to Rust
  return { received: true }; // 200 even on logical failures
});
```

### Discipline

- **Receiver-side dedup table is absent for idempotent state transitions.** Vendor event ID + DB upsert/conditional-write handles the common case (Vercel + Cal.com pattern).
- **`idempotency.ts` reserved for non-idempotent side effects** (sending emails, charging cards, triggering external systems) — DDB `attribute_not_exists(event_id)` conditional put with 30-45 day TTL.
- **Signature verification ALWAYS extracted to a helper** — never inline in the route. Vendor SDK does the cryptographic work.
- **2xx response after signature verification** — prevents Stripe retry storms.
- **EventBridge fan-out to Rust consumer** — the Next.js Route Handler is a token-broker; business logic lives in Rust per D48.

---

## 8. Anti-patterns we explicitly avoid

| Anti-pattern                                 | Why avoided                                                                                 | Alternative                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `export *` from barrels                      | Defeats tree-shaking (Hagemeister 60-80% test speedup; Vercel #27401 50KB→25KB bundle drop) | Named re-exports; banned by ESLint                |
| God-object Container with optional fields    | Late refactor is dozens of files (Optique 1.0 + Total TypeScript)                           | Discriminated union per runtime (ADR-0011)        |
| Factory wrappers over stateless functions    | Documented over-engineering (Bespoyasov, Fukuda, Abramov's "Wet Codebase")                  | Direct function exports                           |
| Port-owned-by-consumer                       | Cycle risk; provider-consumer arrow inverted                                                | Port-owned-by-provider (ADR-0009)                 |
| NestJS-style reflection DI                   | Edge runtime incompatible + RSC + test pollution (Trigger.dev / Mastra reject)              | Manual composition root + functional factories    |
| `__fakes__/` dir name                        | Not Jest-official; Apollo/tRPC/TanStack use `testing/`                                      | `testing/`                                        |
| RFC 7807 Problem Details responses           | Not in production use anywhere (R3)                                                         | `{ message, status }` shape                       |
| `'use server'` per-function                  | Confuses tooling; per-file is idiomatic                                                     | `'use server'` at file top                        |
| `redirect()` inside try/catch                | Catches `NEXT_REDIRECT` (#1 Server Action bug)                                              | `redirect()` outside try/catch                    |
| Inline `Sentry.captureException` in handlers | Bypasses scope/tag context                                                                  | HOF wrapper sets context once                     |
| Hexagonal port abstraction for auth          | Production teams reject for in-house BFFs (R1)                                              | Flat `lib/auth/*.ts` modules + concrete functions |
| Receiver-side webhook dedup table by default | Vendor event ID + upsert is the canonical pattern (R2)                                      | DDB dedup only for non-idempotent side effects    |
| Auth code in Client Components               | Bundle leak + session-lookup exposure                                                       | `import 'server-only'` at every auth-related file |
| Per-call vendor SDK init                     | Cold-start cost + chokepoint bypass                                                         | Singleton through composition root                |
| Accessibility overlay products               | FTC settlement vs accessiBe; rejected industry-wide                                         | Ship native a11y                                  |

---

## 9. Things that emerge OVER TIME (don't pre-create)

R4 convergent finding: production teams DON'T pre-create these. Wait for the trigger.

| Pattern                                   | Trigger                                      | Don't add until                             |
| ----------------------------------------- | -------------------------------------------- | ------------------------------------------- |
| `internal-packages/` tier                 | 2nd app or runtime needs shared code         | M5-M6                                       |
| `apps/worker/`                            | 3 concrete jobs that need >15s runtime       | M7+                                         |
| `apps/marketing/` separated from portal   | Significant content-team workflow divergence | Post-M9 (low probability)                   |
| `modules/` or `features/` next to `lib/`  | `lib/` grows past ~30 files                  | ~M5                                         |
| `tools/` (TSC-compiled)                   | First tooling lives outside `apps/`          | Post-M3                                     |
| `scripts/`                                | First shell/node one-shot needed             | Add when needed                             |
| `tasker.ts` / `lib/jobs/`                 | EventBridge wiring lands                     | M6-M7                                       |
| Cache layer (Redis/DAX)                   | First N+1 query problem at scale             | Post-M7                                     |
| `packages/contracts/` (shared port types) | 3rd cross-package port consumer              | Stay with port-owned-by-provider until then |

---

## 10. Decision references

Every decision in this blueprint maps to an ADR or D-number:

| Decision                                              | ADR / Source                                                               |
| ----------------------------------------------------- | -------------------------------------------------------------------------- |
| Modular monolith with workspace packages              | ADR-0008                                                                   |
| Hexagonal-by-boundary internal package shape          | ADR-0009                                                                   |
| Composition root with globalThis singleton            | ADR-0010                                                                   |
| Container discriminated union                         | ADR-0011                                                                   |
| Monorepo shape (apps + packages)                      | ADR-0001                                                                   |
| Session cookie pattern (opaque + DDB)                 | ADR-0002                                                                   |
| OpenAPI codegen direction (Rust → TS)                 | ADR-0003                                                                   |
| Observability stack (Sentry + Amplitude + CloudWatch) | ADR-0004 (revised 2026-06-04)                                              |
| CSP two-tier (marketing static / portal nonce)        | ADR-0005                                                                   |
| Content layer (Velite + Zod)                          | ADR-0006                                                                   |
| Dev tooling adoption                                  | ADR-0007                                                                   |
| Vendor matrix locks                                   | D42b _revised_ (Amplitude web + mobile), D44 (Stripe), D45 (my-quilty.com) |
| Chokepoint disciplines                                | D31 (zero PHI in runtime), D35 (default-deny consent), D67 (PHI sanitizer) |
| Auth surface                                          | D5/D7/D9/D11/D51 (BFF pattern, opaque session, EventBridge fan-out)        |

---

## Maintenance

When research surfaces a new convergent pattern OR an ADR-worthy decision lands, update this file. Do not let it rot. Treat it as the entry-point doc for "where does X go in the Quilty website codebase."
