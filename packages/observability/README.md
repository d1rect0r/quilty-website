# @quilty/observability

The observability spine — analytics, error reporting, logging, replay, and feature-flag evaluation behind 5 typed ports.

## Architecture

Every adapter is wrapped by a **factory wrapper** at the composition root. The wrapper composes the cross-cutting concerns the Cerebral $7M settlement made architectural:

| Wrapper             | Concerns applied                                                            | Decision  |
| ------------------- | --------------------------------------------------------------------------- | --------- |
| `wrapAnalytics`     | **Default-deny consent gate** + PHI sanitizer + runtime PHI assertion (dev) | D35 + D67 |
| `wrapErrorReporter` | PHI sanitizer on error context                                              | D67       |
| `wrapLogger`        | PHI sanitizer on log fields                                                 | D67       |
| `wrapReplay`        | Mask-all + block-clinical + force `replaysSessionSampleRate: 0` floor       | D68       |

The raw vendor adapter must **never** appear as a Container property. ESLint + dep-cruiser enforce the import-graph chokepoint; the wrapper composition enforces the runtime chokepoint.

## Ports

| Port                   | Adapters                            | Notes                                                                                                                                                              |
| ---------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Analytics`            | `amplitude` + in-memory             | D42b: Amplitude all-in. Pre-production ships a logger-only stub; events flow to CloudWatch via the Logger port until the BAA upgrade lands at the M8 launch gate.  |
| `ErrorReporter`        | `sentry-error-reporter` + in-memory | Isomorphic — `captureException` is the named import path that Next.js resolves to the right SDK (client / server / edge) in each subtree.                          |
| `Logger`               | `cloudwatch-logger` + in-memory     | Structured JSON. `console.log` is the underlying writer (Lambda forwards to CloudWatch). ESLint bans direct console outside this adapter.                          |
| `Replay`               | `sentry-replay` + in-memory         | Error-triggered only per D68. `replaysSessionSampleRate: 0`; the wrapper rejects any config that tries to raise it. Amplitude Session Replay is rejected outright. |
| `FeatureFlagEvaluator` | `env-flags` + in-memory             | Reads typed env vars from `apps/web/lib/flags/features.ts`. The PostHog flags swap lands at the runtime-toggle trigger (D43).                                      |

## Consent gate primitive

`ConsentReader` is a minimal interface defined here so `wrapAnalytics` can compose the default-deny gate without a circular dependency on `@quilty/consent` (which lands in a later extraction). The `@quilty/consent` `ConsentStore` will structurally satisfy `ConsentReader`, so the composition root will swap the in-memory default-deny stub for the real store without changing the wrapper API.

## Public API

```ts
import {
  // Ports
  type Analytics,
  type ErrorReporter,
  type Logger,
  type Replay,
  type FeatureFlagEvaluator,
  type ConsentReader,
  type ConsentSnapshot,
  type AnalyticsEvent,
  type AccountDeleteReason,
  // Factory wrappers (composition root consumes these)
  wrapAnalytics,
  wrapErrorReporter,
  wrapLogger,
  wrapReplay,
  // Adapters
  makeCloudWatchLogger,
  makeSentryErrorReporter,
  makeSentryReplay,
  makeAmplitudeAnalytics,
  makeEnvFlagEvaluator,
  // Constants
  REPLAY_BLOCK_CLASS,
  REPLAY_MASK_CLASS,
  REPLAY_IGNORE_CLASS,
  CLINICAL_PROTECTED_CLASSES,
  // Components
  WebVitalsReporter,
} from '@quilty/observability';
```

Testing barrel:

```ts
import {
  makeAnalyticsFake,
  makeErrorReporterFake,
  makeLoggerFake,
  makeReplayFake,
  makeFeatureFlagEvaluatorFake,
  makeConsentReaderFake,
} from '@quilty/observability/testing';
```

## Tests

Parameterized contract tests verify the architectural seal:

- Analytics no-ops when ConsentReader returns `analytics: false` (default-deny default).
- Analytics no-ops when ConsentReader throws (fail-closed posture).
- Direct adapter call without wrapping fails the chokepoint contract test.
- Logger / ErrorReporter / EmailSender pass payloads through Sanitizer recursively.
- WebVitalsReporter emits the structured shape Logger expects.

Run with `pnpm --filter @quilty/observability test`.
