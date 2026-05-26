# @quilty/test-fixtures

Seeded test-data factories for cross-package fixtures. Wraps
[`@faker-js/faker`](https://github.com/faker-js/faker) +
[`fishery`](https://github.com/thoughtbot/fishery) with Zod-shaped
builders so every fixture stays in sync with its source-of-truth
schema.

## Why a separate package

Co-locating fixtures with the package they describe (e.g., a
`ContactFormFactory` next to the contact route handler) creates
two failure modes:

1. **Drift.** When fixtures live next to one consumer, a second
   consumer that needs the same shape forks its own copy — and the
   two drift the moment a field is added.
2. **Workspace cycles.** When the consumer package and the fixture-
   provider package depend on the same workspace package, importing
   fixtures across the cycle requires either a `package.json` games
   or a heavyweight dependency-cruiser exception.

A standalone `@quilty/test-fixtures` workspace package consolidates
both. Every package in the monorepo imports from one place.

## What ships today

| Factory                  | Source-of-truth shape                                   | Owner package           |
| ------------------------ | ------------------------------------------------------- | ----------------------- |
| `ContactFormFactory`     | `contactFormSchema` (Zod) in the marketing contact form | `apps/web`              |
| `ConsentSnapshotFactory` | `ConsentSnapshot` port                                  | `@quilty/consent`       |
| `AnalyticsEventFactory`  | `AnalyticsEvent` typed union                            | `@quilty/observability` |
| `ProblemDetailsFactory`  | RFC 9457 envelope (12-slug registry)                    | `@quilty/api-client`    |

Plus HIPAA-safe helpers: `safeEmail()`, `safePhone()`,
`safeAdultBirthDate()`, and a seeded `faker` re-export.

## What's deferred (and when it lands)

The original plan named seven factories. The four above ship now
because their canonical schemas exist in the codebase today. The
others gate on the canonical schema landing:

| Factory                | Trigger                                                                  |
| ---------------------- | ------------------------------------------------------------------------ |
| `PersonFactory`        | OpenAPI Person/Profile emission from the Rust auth-user crate (ADR-0003) |
| `AccountFactory`       | Same trigger as Person                                                   |
| `SessionFactory`       | BFF session-cookie shape stabilises (D51 + D52 deliverables)             |
| `SubscriptionFactory`  | Stripe → Rust bridge activation per `docs/website_workflow_roadmap.md`   |
| `MfaEnrollmentFactory` | D55 Argon2id backup-codes surface lands                                  |

The pattern documented here (faker singleton + Zod-mirror + fishery
`Factory.define` + `afterBuild` for invariants) is sufficient for
each of those when their shapes land; no infrastructure change is
required.

## HIPAA safety

Every generator avoids real-world identifier ranges:

- **Emails:** `@example.test` / `@quilty.test` (IANA RFC 6761 §6.4
  reserved test TLD).
- **Phones:** `+1 555 XXX XXXX` (NANP §10.6 fictional-use 555 prefix).
- **Birth dates:** synthesized adult range (18-90 years) anchored to
  the faker singleton's reference date (pinned via `setFixtureSeed` for
  determinism, live wall-clock otherwise) — never tied to a real DOB.

Direct imports from `@faker-js/faker` in consumer test files are
discouraged; importing `faker` from this package ensures every
test eventually routes through the safe helpers when the shape needs
HIPAA-safe values.

## Usage

```ts
import {
  ContactFormFactory,
  ConsentSnapshotFactory,
  AnalyticsEventFactory,
  ProblemDetailsFactory,
  setFixtureSeed,
} from '@quilty/test-fixtures';

// Deterministic test file
beforeAll(() => setFixtureSeed(42));

// Schema-valid randomized contact form
const body = ContactFormFactory.build();

// Pin specific fields
const denied = ConsentSnapshotFactory.build({ analytics: false });

// GPC invariant: detected GPC forces analytics + marketing off
// regardless of overrides (matches production ConsentReader).
const gpc = ConsentSnapshotFactory.build({
  gpc_detected: true,
  analytics: true, // ← forced to false by afterBuild hook
});

// Discriminated-union event builders
const pageView = AnalyticsEventFactory.pageView({ route: '/account' });

// 12-slug problem registry coverage
const rateLimit = ProblemDetailsFactory.rateLimit({ retryAfterMs: 5000 });
```

## Adding a new factory

1. Create `src/factories/<entity>.ts` exporting a `<Entity>Factory`
   from `fishery`.
2. Mirror the canonical Zod schema inline (avoid workspace-cycle
   imports). Add a contract test that catches drift.
3. Enforce invariants via `afterBuild` (fishery v2 merges
   `.build({...})` overrides ON TOP of the generator output, so
   pre-merge invariant logic is overwritten).
4. Re-export from `src/index.ts`.
5. Add HIPAA-safety + Zod-validity + determinism + override-
   propagation tests under `__tests__/factories.test.ts`.
