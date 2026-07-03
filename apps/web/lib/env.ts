import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

/**
 * Centralised, boot-time-validated environment access (the 2025-26
 * enterprise standard: `@t3-oss/env-nextjs` + Zod). Imported in
 * `next.config.ts` so validation runs at BUILD time (Next.js #79536:
 * `instrumentation.ts` is unreliable for build-time validation), and
 * re-exported for typed runtime access.
 *
 * Scope discipline (ADR-0030):
 *   - Build-relevant + non-secret config is validated here.
 *   - Runtime-only SECRETS keep their own dedicated module-init guards and
 *     are `.optional()` here: `CSRF_SECRET` (`packages/security`
 *     `csrf.ts` + `csrf-edge.ts` throw if < 32 chars at request time) and
 *     `QUILTY_PSEUDONYM_PEPPER` (`sst.config.ts` throws at deploy). The CI
 *     build job intentionally omits those secrets, so marking them required
 *     here would fail the build — their guards run where the value is
 *     actually used.
 *   - Edge-runtime module-init guards in `proxy.ts` (cookie registry, CSRF
 *     mint) stay as-is — this module is for the build + Node/Client tiers.
 *   - The fail-closed adapter opt-in `QUILTY_ALLOW_INMEMORY_ADAPTERS` is
 *     declared here (so a malformed value fails the build), but the runtime
 *     guard reads it from `process.env` via `lib/fail-closed.ts` so the Node
 *     + Edge roots resolve it identically (ADR-0030).
 */
export const env = createEnv({
  server: {
    // Outbound Rust-backend base URL (BFF proxy target).
    QUILTY_API_BASE_URL: z.string().url().optional(),
    // Sentry build-plugin config (source-map upload at deploy).
    SENTRY_ORG: z.string().min(1).optional(),
    SENTRY_PROJECT: z.string().min(1).optional(),
    SENTRY_AUTH_TOKEN: z.string().min(1).optional(),
    SENTRY_INGEST_HOST: z.string().min(1).optional(),
    SENTRY_CSP_REPORT_URI: z.string().url().optional(),
    AMPLITUDE_SERVER_API_KEY: z.string().min(1).optional(),
    // Runtime-only secrets — validated by their dedicated guards, optional
    // here so the secret-less CI build does not fail.
    CSRF_SECRET: z.string().min(32).optional(),
    QUILTY_PSEUDONYM_PEPPER: z.string().min(1).optional(),
    QUILTY_MAINTENANCE_BYPASS_SECRET: z.string().min(32).optional(),
    QUILTY_SITE_ORIGIN: z.string().url().optional(),
    RATELIMIT_BYPASS_TOKEN: z.string().min(1).optional(),
    // Real-adapter activation envs (DynamoDB tables). Presence selects the
    // real adapter over the in-memory one (rate-limit/consent/guest-state in
    // the composition root; idempotency inside lib/idempotency.ts).
    QUILTY_RATE_LIMIT_TABLE: z.string().min(1).optional(),
    QUILTY_IDEMPOTENCY_TABLE: z.string().min(1).optional(),
    QUILTY_CONSENT_TABLE: z.string().min(1).optional(),
    QUILTY_GUEST_STATE_TABLE: z.string().min(1).optional(),
    // Fail-closed escape hatch (ADR-0030): an EXPLICIT, documented, audited
    // opt-in to run the rate-limiter + consent-store in-memory adapters in a
    // `production` runtime during the AWS-parked interim (before the DynamoDB
    // adapters land). Absent in production => the composition root THROWS
    // rather than silently shipping in-memory (OWASP secure-by-default).
    // `'true'` opts in; audit-logged once per process. NOTE: the email +
    // captcha in-memory adapters self-guard with their own
    // QUILTY_ALLOW_INMEMORY_{EMAIL,CAPTCHA}_IN_PROD=1 flags — an interim
    // production deploy needs all three (see ADR-0030 flag inventory).
    QUILTY_ALLOW_INMEMORY_ADAPTERS: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => v === 'true'),
    // Pre-launch SEO fail-safe. When 'true' the site emits a sitewide
    // noindex (X-Robots-Tag header in next.config.ts + meta robots in
    // layout.tsx) so the live placeholder is reachable but unindexed.
    // FAIL-SAFE DIRECTION: absent/'false' => indexable (the safe prod
    // default), so a forgotten/misconfigured prod env can never silently
    // de-index the launched site. Set 'true' only in the placeholder deploy
    // env; remove at launch + trigger a fresh deploy (sst.config.ts
    // `invalidation: { wait: true }` auto-purges the edge — no manual
    // invalidation needed). A deploy.yml post-deploy gate fails the release
    // if prod's index posture ever disagrees with this flag.
    SITE_FORCE_NOINDEX: z
      .enum(['true', 'false'])
      .optional()
      .transform((v) => v === 'true'),
  },
  client: {
    // Required: the metadata + canonical-URL builders need it at build.
    NEXT_PUBLIC_SITE_URL: z.string().url(),
    // Sentry client ingest — optional (gated off until a real DSN lands;
    // `instrumentation-client.ts` re-validates the host shape).
    NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: z.string().min(1).optional(),
    NEXT_PUBLIC_AMPLITUDE_API_KEY: z.string().min(1).optional(),
  },
  // Next.js inlines NEXT_PUBLIC_* at build; server vars are read from
  // process.env. Every key must be listed explicitly.
  runtimeEnv: {
    QUILTY_API_BASE_URL: process.env.QUILTY_API_BASE_URL,
    SENTRY_ORG: process.env.SENTRY_ORG,
    SENTRY_PROJECT: process.env.SENTRY_PROJECT,
    SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
    SENTRY_INGEST_HOST: process.env.SENTRY_INGEST_HOST,
    SENTRY_CSP_REPORT_URI: process.env.SENTRY_CSP_REPORT_URI,
    AMPLITUDE_SERVER_API_KEY: process.env.AMPLITUDE_SERVER_API_KEY,
    CSRF_SECRET: process.env.CSRF_SECRET,
    QUILTY_PSEUDONYM_PEPPER: process.env.QUILTY_PSEUDONYM_PEPPER,
    QUILTY_MAINTENANCE_BYPASS_SECRET: process.env.QUILTY_MAINTENANCE_BYPASS_SECRET,
    QUILTY_SITE_ORIGIN: process.env.QUILTY_SITE_ORIGIN,
    RATELIMIT_BYPASS_TOKEN: process.env.RATELIMIT_BYPASS_TOKEN,
    QUILTY_RATE_LIMIT_TABLE: process.env.QUILTY_RATE_LIMIT_TABLE,
    QUILTY_IDEMPOTENCY_TABLE: process.env.QUILTY_IDEMPOTENCY_TABLE,
    QUILTY_CONSENT_TABLE: process.env.QUILTY_CONSENT_TABLE,
    QUILTY_GUEST_STATE_TABLE: process.env.QUILTY_GUEST_STATE_TABLE,
    QUILTY_ALLOW_INMEMORY_ADAPTERS: process.env.QUILTY_ALLOW_INMEMORY_ADAPTERS,
    SITE_FORCE_NOINDEX: process.env.SITE_FORCE_NOINDEX,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
    NEXT_PUBLIC_AMPLITUDE_API_KEY: process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY,
  },
  // Coerce '' → undefined so a blank env var trips `.optional()` rather
  // than passing a malformed empty string downstream.
  emptyStringAsUndefined: true,
  // Vitest sets NODE_ENV=test and does not provision the build envs;
  // SKIP_ENV_VALIDATION is the standard t3-env escape for tooling that
  // imports the module without a populated environment. CAVEAT: when
  // skipValidation is true, t3-env returns raw process.env strings WITHOUT
  // running the Zod transforms, so e.g. `env.QUILTY_ALLOW_INMEMORY_ADAPTERS`
  // is typed `boolean` but is `string | undefined` at runtime under test.
  // This is safe in practice: the only consumer (composition.server.ts)
  // imports `server-only` and cannot run under Vitest, and the runtime guard
  // reads the opt-in from process.env via lib/fail-closed.ts regardless.
  skipValidation: process.env.NODE_ENV === 'test' || Boolean(process.env.SKIP_ENV_VALIDATION),
});
