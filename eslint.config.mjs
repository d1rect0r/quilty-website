import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

/**
 * ESLint 9 flat config (D22 + D67).
 *
 * Stack:
 *   - typescript-eslint strict + stylistic (TS correctness)
 *   - eslint-config-next/core-web-vitals (Next.js core-web-vitals
 *     ruleset + jsx-a11y at recommended tier — Next 16 docs prescribe
 *     this subpath, NOT bare `eslint-config-next` which loads only the
 *     base ruleset per Round-5 cross-check)
 *   - eslint-config-next/typescript (TS-specific Next overrides)
 *   - Explicit jsx-a11y/strict-tier rules added in the custom block
 *     since eslint-config-next ships jsx-a11y at recommended only —
 *     D22 WCAG 2.2 AA fail-on-violation discipline requires strict
 *
 * Custom rules per D67 + ADR-0004:
 *   1. no-console — every log emission must go through
 *      lib/observability/logger.ts so sanitize() runs first.
 *   2. no-restricted-imports — block direct vendor SDK imports outside
 *      lib/observability/. Forces every observability call through the
 *      adapter layer (track, logError, flag) where consent gating +
 *      PHI sanitization run.
 *   3. jsx-a11y strict-tier additions surfaced by Round-5 reviewer:
 *      no-autofocus, no-aria-hidden-on-focusable, prefer-tag-over-role,
 *      anchor-ambiguous-text, label-has-associated-control, etc.
 */

const VENDOR_SDK_IMPORTS = [
  {
    name: '@sentry/nextjs',
    message:
      'Import observability primitives from @quilty/observability (ErrorReporter / Replay / Logger ports). Direct @sentry/nextjs imports bypass the PHI sanitizer chokepoint per D67.',
  },
  {
    name: '@amplitude/analytics-browser',
    message:
      'Import analytics via @quilty/observability (Analytics port). Direct Amplitude imports bypass the consent gate + PHI sanitizer per D35 + D67.',
  },
  {
    name: '@amplitude/analytics-node',
    message:
      'Import analytics via @quilty/observability (Analytics port). Direct Amplitude imports bypass the consent gate + PHI sanitizer per D35 + D67.',
  },
  {
    name: 'posthog-js',
    message:
      'Import analytics via @quilty/observability (Analytics port). Direct PostHog imports bypass the consent gate + PHI sanitizer per D35 + D67. (Gate set ahead of any posthog-js install to close the FTC capability + configuration gap from day one.)',
  },
  {
    name: 'posthog-node',
    message:
      'Import analytics via @quilty/observability (Analytics port). Direct PostHog imports bypass the consent gate + PHI sanitizer per D35 + D67.',
  },
  {
    name: '@faker-js/faker',
    message:
      'Import fixture helpers (faker, safeEmail, safePhone, safeAdultBirthDate, setFixtureSeed) from @quilty/test-fixtures. Direct @faker-js/faker imports bypass the HIPAA-safe wrappers (RFC 6761 .test TLD + NANP 555 prefix + seeded refDate) and can leak realistic identifiers into test artifacts that share a transport with production logs.',
  },
];

// D148 — PHI-denylist regex for identifier names that must never appear
// inside thrown Error template literals, captureException calls, or
// constructor `super(...)` invocations. Cerebral $7M settlement
// precedent: PHI flowing into Sentry breadcrumbs + CloudWatch logs
// through error-message interpolation is the precise failure mode the
// FTC §5 deceptive-acts theory targeted. The list mirrors the sanitizer
// denylist in packages/security/src/domain/sanitizer.ts but is
// anchored + case-insensitive so the AST selector regex compares
// identifier-name strings only (not free-text matches).
//
// Allowlisted by omission (safe to interpolate into error messages):
//   quilty_sub, request_id, trace_id, route, error_code, flag_name,
//   locale, version, digest, code, id, status, method, duration_ms
const PHI_DENYLIST_REGEX =
  '^(?:email|phone|phone_number|ssn|dob|date_of_birth|full_name|first_name|last_name|patient_name|patient_id|address|street_address|diagnosis|symptom|medication|prescription|condition|treatment|mrn|mrn_id|npi|npi_number|dea|dea_number|prescriber_id|provider_id|member_id|subscriber_id|claim_id|eob|prior_auth|prior_authorization|full_face_photo|face_print|voice_print|biometric_identifier|fingerprint|precise_location|lat_lng|geo_lat|geo_lng|latitude|longitude|phq2|phq9|audit_c|dast|dast_10|promis|bdi|cssrs|device_id|advertising_id|idfa|idfv|gaid)$';

const PHI_ERROR_MESSAGE =
  'PHI-denylisted identifier appears inside an Error / captureException / constructor super() / error.message assignment. Errors propagate to Sentry breadcrumbs + CloudWatch logs; PHI must never reach those sinks. Use a sanitized error code, HMAC-pseudonymised quilty_sub, or request_id instead. [D148]';

// AST selectors that detect PHI-denylisted identifier names in the
// five canonical error-construction code paths. Each selector is
// scoped narrowly to its surrounding construct so the rule fires on
// the construction site, not on every mention of the identifier name
// in unrelated code.
//
// Selectors:
//   1. `new Error(\`...${denylisted}...\`)` — any NewExpression
//      bound to identifier `Error` with a TemplateLiteral whose
//      interpolation references a denylisted Identifier.
//   2. `new Error(denylisted)` — bare Identifier argument.
//   3. `class extends Error { constructor() { super(\`...${denylisted}\`) } }` —
//      custom error subclass propagating PHI through super().
//   4. `errorReporter.captureException(...) / Sentry.captureMessage(\`...${denylisted}\`)` —
//      observability-vendor call shapes that flow PHI to the sink.
//   5. `error.message = \`...${denylisted}...\`` — direct mutation of
//      the message field after construction.
const PHI_IN_ERROR_SELECTORS = [
  {
    selector: `NewExpression[callee.name='Error'] TemplateLiteral Identifier[name=/${PHI_DENYLIST_REGEX}/i]`,
    message: PHI_ERROR_MESSAGE,
  },
  {
    selector: `NewExpression[callee.name='Error'] > Identifier[name=/${PHI_DENYLIST_REGEX}/i]`,
    message: PHI_ERROR_MESSAGE,
  },
  {
    selector: `MethodDefinition[kind='constructor'] CallExpression[callee.type='Super'] TemplateLiteral Identifier[name=/${PHI_DENYLIST_REGEX}/i]`,
    message: PHI_ERROR_MESSAGE,
  },
  {
    selector: `CallExpression[callee.property.name=/^(captureException|captureMessage)$/] TemplateLiteral Identifier[name=/${PHI_DENYLIST_REGEX}/i]`,
    message: PHI_ERROR_MESSAGE,
  },
  {
    selector: `AssignmentExpression[left.property.name='message'] TemplateLiteral Identifier[name=/${PHI_DENYLIST_REGEX}/i]`,
    message: PHI_ERROR_MESSAGE,
  },
  // Structured-log field-name leak: `logger.error('msg', { email })` —
  // the runtime sanitizer's key denylist catches this, but the
  // author-time guard closes the gap so a logger call carrying a
  // PHI-named field never compiles. Covers logger.{debug,info,warn,error}
  // + container.logger.{...} property-chain shapes via the descendant
  // ObjectExpression > Property selector.
  {
    selector: `CallExpression[callee.property.name=/^(debug|info|warn|error)$/] ObjectExpression > Property[key.name=/${PHI_DENYLIST_REGEX}/i]`,
    message:
      'PHI-denylisted identifier appears as a logger field-name. Structured-log fields are emitted to CloudWatch + Sentry breadcrumbs; PHI must never reach those sinks. Use a sanitized key (quilty_sub, request_id, trace_id, error_code) instead. [D148]',
  },
];

// `no-restricted-syntax` replaces (does not merge) its selector array per
// matching config block. These shared selector groups are composed into the
// global, rendering-tier, and legal-page blocks so a scoped block can ADD a
// selector (e.g. the env-access ban) without silently dropping the
// compliance selectors (HIPAA / DPO / PHI). [flat-config array-replace]
const EXPORT_ALL_SELECTOR = {
  selector: 'ExportAllDeclaration',
  message:
    'Use named re-exports (`export { foo } from`) instead of `export *` — star re-exports defeat tree-shaking. See Hagemeister + Vercel #27401.',
};

const HIPAA_CLAIM_MESSAGE =
  'Never claim "HIPAA-compliant" or "HIPAA compliance" — use "HIPAA-aligned." Compliance without third-party attestation is FTC §5 deceptive-acts (Cerebral $7M settlement precedent). [D104]';
const HIPAA_CLAIM_SELECTORS = [
  { selector: 'Literal[value=/HIPAA[-\\s]compli(?:ant|ance)/i]', message: HIPAA_CLAIM_MESSAGE },
  {
    selector: 'TemplateElement[value.raw=/HIPAA[-\\s]compli(?:ant|ance)/i]',
    message: HIPAA_CLAIM_MESSAGE,
  },
  { selector: 'JSXText[value=/HIPAA[-\\s]compli(?:ant|ance)/i]', message: HIPAA_CLAIM_MESSAGE },
];

const DPO_TITLE_SELECTORS = [
  {
    selector: 'Literal[value=/\\bDPO\\b/i]',
    message:
      'Use "Privacy Lead" — never "DPO" as a self-applied title. Claiming a Data Protection Officer without GDPR Art 37 appointment is fineable (Austrian €5K + CJEU C-453/21 + Belgian €50K precedents). [D136] (Legal pages may name "Data Protection Officer" in the Art 37 non-appointment disclosure — that exception is scoped via files: override.)',
  },
  {
    selector: 'TemplateElement[value.raw=/\\bDPO\\b/i]',
    message:
      'Use "Privacy Lead" — never "DPO" as a self-applied title. Claiming a Data Protection Officer without GDPR Art 37 appointment is fineable (Austrian €5K + CJEU C-453/21 + Belgian €50K precedents). [D136]',
  },
  {
    selector: 'JSXText[value=/\\bDPO\\b/i]',
    message:
      'Use "Privacy Lead" — never "DPO" as a self-applied title. Claiming a Data Protection Officer without GDPR Art 37 appointment is fineable (Austrian €5K + CJEU C-453/21 + Belgian €50K precedents). [D136]',
  },
];

// Bans raw `process.env.<KEY>` in the rendering tier (see the rendering-tier
// block below for scope + rationale). `process.env.NODE_ENV` is exempted by
// both dot (`property.name`) and computed (`property.value`) access so the
// bundler's dead-code-elimination guard keeps working.
const ENV_ACCESS_SELECTOR = {
  selector:
    "MemberExpression[object.object.name='process'][object.property.name='env'][property.name!='NODE_ENV'][property.value!='NODE_ENV']",
  message:
    'Read configuration through the validated `@/lib/env` module, not raw `process.env`, so a missing/malformed value fails the build at boot (ADR-0030). Exceptions: `process.env.NODE_ENV` (bundler dead-code elimination) and route handlers (app/api/**), which read request-time / server / optional-fallback env that t3-env cannot model (non-obvious raw reads carry an inline rationale at the read site).',
};

// Global default — every source file. (DPO allowed-by-omission exception is
// applied via the legal-page block, which swaps in LEGAL_RESTRICTED_SYNTAX.)
const BASE_RESTRICTED_SYNTAX = [
  EXPORT_ALL_SELECTOR,
  ...HIPAA_CLAIM_SELECTORS,
  ...DPO_TITLE_SELECTORS,
  ...PHI_IN_ERROR_SELECTORS,
];
// Legal pages — same as base minus the DPO ban (GDPR Art 37 disclosure).
const LEGAL_RESTRICTED_SYNTAX = [
  EXPORT_ALL_SELECTOR,
  ...HIPAA_CLAIM_SELECTORS,
  ...PHI_IN_ERROR_SELECTORS,
];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/.velite/**',
      '**/.turbo/**',
      '**/.sst/**',
      '**/.open-next/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'packages/shared-types/src/generated/**',
      '*.tsbuildinfo',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  ...nextCoreWebVitals,
  ...nextTypescript,
  // CommonJS config files (.cjs) — declare the script env so `module`,
  // `require`, `__dirname` resolve. ESLint 9 flat config doesn't infer
  // this from the file extension.
  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        module: 'readonly',
        require: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        global: 'readonly',
      },
    },
    rules: {
      // `require()` IS the module system for CommonJS config files
      // (`.size-limit.cjs`, `scripts/size-limit-first-load.cjs`); the
      // tseslint-strict ban on require-imports targets ESM source, not
      // these build-config peers.
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  // Custom rules block — only applies to TS/TSX/JS/JSX source files.
  // Critical: the `files:` restriction is what keeps the `jsx-a11y/*`
  // rule references in-scope only where eslint-config-next/core-web-vitals
  // registered the plugin. Without `files:` this block would apply to
  // `.cjs` config files (like `.dependency-cruiser.cjs`) where the
  // jsx-a11y plugin isn't loaded → "Cannot find plugin" config error
  // when lint-staged runs against arbitrary staged files.
  {
    files: ['**/*.{ts,tsx,js,jsx,mjs}'],
    ignores: ['**/*.cjs', '**/*.config.cjs'],
    rules: {
      // PHI defense + observability chokepoint enforcement (D67)
      'no-console': 'error',
      'no-restricted-imports': ['error', { paths: VENDOR_SDK_IMPORTS }],

      // Ban `export *` + ban "HIPAA-compliant" + ban "DPO" self-applied
      // title in source files.
      //
      // Rule 1 — ExportAllDeclaration ban: barrel re-exports force the
      // bundler to evaluate every sibling module at the import site,
      // which defeats tree-shaking + inflates client-bundle weight
      // (Hagemeister benchmarks: 60-80% test speedup from removal;
      // Vercel #27401: bundle halved after the switch). Named re-exports
      // (`export { foo } from`) are tree-shakeable; star re-exports are
      // not.
      //
      // Rule 2 + 3 — "HIPAA-compliant" + "HIPAA compliant" string ban
      // in source files (D104). Claiming HIPAA compliance without
      // third-party audit attestation is FTC §5 deceptive-acts
      // territory; the Cerebral $7M settlement (March 2023) was
      // exactly this claim/posture mismatch. The ceiling is
      // "HIPAA-aligned" — never "compliant." Rule fires on both
      // string literals + template literal parts.
      //
      // Rule 4 + 5 — "DPO" self-applied title ban (D136). Claiming a
      // Data Protection Officer that does not exist or has not been
      // formally appointed under GDPR Article 37 is fineable risk:
      // Austrian DPB €5K + CJEU C-453/21 X-FAB + Belgian DPA €50K
      // precedents. The mandated title at Quilty's scale is "Privacy
      // Lead." Legal-page directories carry a scoped exception
      // (configured below) so the policy may name "Data Protection
      // Officer" in the "we do not employ a designated DPO" Article 37
      // transparency disclosure.
      // Scope note (D104 + D136): the regex covers the adjective
      // ("compliant") + noun ("compliance") forms with dash or space
      // separator. It does NOT catch the no-separator camelCase
      // variant (e.g., `HIPAACompliant` as an identifier name) by
      // design — identifier naming is a separate concern from
      // string-literal claims. The DPO selector carries the /i flag
      // so lowercase + mixed-case variants also fire; mailbox strings
      // like `dpo@my-quilty.com` would also trip the rule, so they
      // must live under the legal-page override or be referenced via
      // an indirection. JSXText selectors catch React-rendered claims
      // that bypass string-literal AST nodes.
      'no-restricted-syntax': ['error', ...BASE_RESTRICTED_SYNTAX],

      // jsx-a11y strict-tier additions (D22 + Round-5 reviewer):
      // eslint-config-next ships jsx-a11y at "recommended" only; these
      // strict-tier rules catch the most common consumer-health
      // regressions and are required for WCAG 2.2 AA fail-on-violation.
      'jsx-a11y/no-autofocus': 'error',
      'jsx-a11y/no-aria-hidden-on-focusable': 'error',
      'jsx-a11y/prefer-tag-over-role': 'error',
      'jsx-a11y/anchor-ambiguous-text': 'error',
      'jsx-a11y/label-has-associated-control': 'error',
      'jsx-a11y/mouse-events-have-key-events': 'error',
      'jsx-a11y/no-static-element-interactions': 'error',
      'jsx-a11y/no-noninteractive-tabindex': 'error',
      'jsx-a11y/control-has-associated-label': ['error', { ignoreElements: ['main', 'section'] }],

      // Import ordering — prevents accidental same-file-but-different-
      // alias drift over time. `@/` alias classified as internal via
      // typescript resolver.
      'import/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
            'object',
            'type',
          ],
          'newlines-between': 'never',
        },
      ],

      // TS strict overrides — already covered by tseslint.configs.strict
      // but keeping these explicit so a future tseslint upgrade doesn't
      // silently relax them
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: ['./apps/web/tsconfig.json', './packages/*/tsconfig.json'],
        },
      },
    },
  },
  // Allow console in the Logger adapter chokepoints + the WebVitalsReporter
  // component — the three chokepoints that own direct console.log emission.
  // All other code must call container.logger.* methods, which compose the
  // PHI sanitizer wrapper around the chokepoint adapter.
  {
    files: [
      'packages/observability/src/adapters/cloudwatch-logger.ts',
      'packages/observability/src/adapters/browser-logger.ts',
      'packages/observability/src/components/WebVitalsReporter.tsx',
      // CLI gate that prints to stdout/stderr per the Unix exit-code-bearing
      // script pattern; observability-chokepoint discipline applies to
      // runtime code paths, not to pre-commit / build-verify scripts.
      'packages/tokens/scripts/verify-css-diff.mjs',
      // apps/web/scripts/vendor-workbox.mjs is the same pattern — a
      // build-time CLI that copies Workbox runtime files into
      // public/workbox/ during the prebuild hook.
      'apps/web/scripts/vendor-workbox.mjs',
      // scripts/mint-maintenance-bypass.mjs — ops CLI that prints the
      // signed bypass token to stdout (the whole point of the tool).
      'scripts/mint-maintenance-bypass.mjs',
      // apps/web/public/sw.js is the hand-rolled Service Worker.
      // It executes in the SW thread (no DOM, no logger import); the
      // fallback console.warn surfaces a Workbox-load failure in the
      // browser DevTools where SW developers operate. The chokepoint
      // discipline applies to RSC + Lambda runtime, not the SW thread.
      'apps/web/public/sw.js',
    ],
    rules: {
      'no-console': 'off',
    },
  },
  // Allow vendor SDK imports inside the adapter chokepoint surface.
  // Two tiers covered by this override:
  //   1. The Sentry init + build files: apps/web/sentry.{server,edge}.config.ts,
  //      apps/web/instrumentation-client.ts (the v10 client-init convention
  //      that replaced the legacy sentry.client.config.ts) + its lazily-
  //      imported apps/web/lib/observability/sentry-client-init.ts (the
  //      @sentry/nextjs init moved off the first-load critical path),
  //      apps/web/instrumentation.ts (server/edge register), and
  //      apps/web/next.config.ts (the withSentryConfig build wrapper). These
  //      are Next.js convention files bound to fixed paths and cannot live
  //      inside a workspace package; they retain direct @sentry/nextjs import
  //      access. withSentryConfig is a BUILD-TIME helper — it never touches
  //      runtime PHI, so the D67 sanitizer-chokepoint rationale doesn't apply.
  //   2. The workspace package adapter surface
  //      (packages/<role>/src/adapters/*). Each adapter file IS the
  //      chokepoint by design — vendor names appear only in adapter
  //      filenames per META-1 (vendor-agnostic role-shaped identifiers
  //      everywhere else). depcruise enforces the same boundary at the
  //      transitive graph layer.
  {
    files: [
      'apps/web/sentry.*.config.ts',
      'apps/web/instrumentation.ts',
      'apps/web/instrumentation-client.ts',
      // The lazy Sentry client-init module — `instrumentation-client.ts`
      // dynamically import()s it on idle so @sentry/nextjs lands in a
      // separate vendor chunk off the first-load critical path (ADR-0018).
      // It IS the client init chokepoint by design (mirrors the moved-out
      // Sentry.init that previously lived in instrumentation-client.ts).
      'apps/web/lib/observability/sentry-client-init.ts',
      'apps/web/next.config.ts',
      'packages/*/src/adapters/**/*.ts',
      // The HIPAA-safe faker singleton wraps @faker-js/faker at exactly
      // one location in the repo; every other consumer routes through
      // @quilty/test-fixtures.
      'packages/test-fixtures/src/faker.ts',
    ],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  // Rendering tier (pages, layouts, components) must read configuration
  // through the validated `@/lib/env` module (apps/web/lib/env.ts), never
  // raw `process.env` — a missing/malformed value then fails the build at
  // boot (ADR-0030 fail-closed config) instead of rendering with `undefined`.
  // Adds ENV_ACCESS_SELECTOR to the base compliance selectors (the array is
  // composed, not replaced, so HIPAA/DPO/PHI enforcement is preserved here).
  // `process.env.NODE_ENV` is exempted by the selector itself, so the
  // dev-only DCE guard (ReactQuery devtools, Spotlight) needs no file
  // exemption. Scope excludes:
  //   - `app/api/**` route handlers — the runtime/BFF tier legitimately
  //     reads request-time env and stubs it per-test. `@t3-oss/env-nextjs`
  //     snapshots `process.env` at import, so a request-time read must stay
  //     raw to observe runtime/test mutation. (A build-time public var read
  //     in a handler — e.g. robots' NEXT_PUBLIC_SITE_URL — is a conscious
  //     choice and carries an inline rationale at the read site; an eventual
  //     `requestEnv()` typed accessor would let this carve-out shrink.)
  //   - `app/dev/boom/page.tsx` — a dev-only diagnostic that reads a raw
  //     `QUILTY_TEST_BOOM_ENABLED` toggle (never shipped behaviour).
  {
    files: ['apps/web/app/**/*.{ts,tsx}', 'apps/web/components/**/*.{ts,tsx}'],
    ignores: ['apps/web/app/api/**', 'apps/web/app/dev/boom/page.tsx'],
    rules: {
      'no-restricted-syntax': ['error', ...BASE_RESTRICTED_SYNTAX, ENV_ACCESS_SELECTOR],
    },
  },
  // Legal-page directories (D104 + D136 exception). The Privacy
  // Policy must include the GDPR Art 37 transparency disclosure
  // naming "Data Protection Officer" in the "we do not employ a
  // designated Data Protection Officer" non-appointment context;
  // banning DPO entirely would force a paraphrase that loses the
  // Art 37 cite. The "HIPAA-compliant" string remains banned —
  // legal copy must use "HIPAA-aligned" too. Tests covering this
  // copy also inherit the exception so they can assert on the
  // verbatim DPO disclosure shape.
  //
  // Glob pattern note: ESLint flat-config `files:` uses minimatch,
  // and `[locale]` / `(marketing)` literal Next.js route-group
  // segments are minimatch metacharacters (character class +
  // extglob alternation). We therefore use the directory-name-only
  // `**/legal/**` pattern; the legal/ directory name is unique in
  // the apps/web tree so the broader match is safe.
  {
    files: [
      'apps/web/app/**/legal/**/*.{ts,tsx}',
      'apps/web/tests/playwright/a11y/privacy-policy.spec.ts',
    ],
    rules: {
      // LEGAL_RESTRICTED_SYNTAX = base minus the DPO ban: the Art 37
      // non-appointment disclosure requires the verbatim "Data Protection
      // Officer" term (drift to a self-applied title is caught by reviewer
      // discipline + the privacy-policy.spec.ts negative-disclosure test).
      // The HIPAA-compliant ban + the PHI-in-error ban (D148) are retained.
      // ENV_ACCESS_SELECTOR is kept so legal pages stay on the validated
      // env module (they consume NEXT_PUBLIC_SITE_URL via `@/lib/env`).
      'no-restricted-syntax': ['error', ...LEGAL_RESTRICTED_SYNTAX, ENV_ACCESS_SELECTOR],
    },
  },
  // Tests can use the bare expectations Vitest/Playwright matchers expect.
  // `no-restricted-syntax` is OFF in tests because compliance-rule
  // unit tests deliberately embed the banned strings as fixtures to
  // verify the rule fires; the lint-staged hook would otherwise reject
  // a valid + necessary test file. The ExportAllDeclaration ban + the
  // D104/D136 source bans are still enforced on production code by
  // the rule block above.
  {
    files: ['**/__tests__/**', '**/tests/**', '**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      // Soften the broad vendor-SDK ban for tests — adapter contract
      // tests legitimately import their vendor SDK to verify the
      // adapter shape — BUT keep the @faker-js/faker restriction in
      // place so HIPAA-safe fixture wrappers stay load-bearing. Direct
      // faker imports in tests would bypass the .test TLD + 555 NANP +
      // seeded-refDate guarantees from @quilty/test-fixtures.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@faker-js/faker',
              message:
                'Import fixture helpers from @quilty/test-fixtures (faker, safeEmail, safePhone, safeAdultBirthDate, setFixtureSeed). Direct @faker-js/faker imports bypass the HIPAA-safe wrappers.',
            },
          ],
        },
      ],
      // OFF in tests: compliance-rule unit tests embed the banned strings as
      // fixtures, and tests read/stub `process.env` (vi.stubEnv) to drive the
      // env-validation + adapter-selection paths. Both the compliance bans and
      // the rendering-tier env-access ban (ENV_ACCESS_SELECTOR) live in this
      // single rule, so one `off` covers them.
      'no-restricted-syntax': 'off',
    },
  },
  // The faker singleton itself MUST import @faker-js/faker — restore
  // unrestricted imports on this one file, which the test-file rule
  // above otherwise re-enables.
  {
    files: ['packages/test-fixtures/src/faker.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  // Meta-tooling files that DOCUMENT the bans must be allowed to
  // contain the banned strings in their own source (rule messages,
  // error output, regex patterns). These files are not user-facing
  // content + cannot trigger the deceptive-acts risk the bans target;
  // they are the enforcement layer itself.
  //
  // `no-console` is also lifted on the compliance-check script — it
  // is a CLI gate that prints violations to stderr, which is the
  // documented Unix-tool pattern for exit-code-bearing scripts (the
  // observability chokepoint discipline applies to runtime code paths,
  // not to a standalone pre-commit script).
  {
    files: [
      'eslint.config.mjs',
      'scripts/check-compliance-language.mjs',
      'scripts/check-no-workflow-context.mjs',
    ],
    rules: {
      'no-restricted-syntax': 'off',
      'no-console': 'off',
    },
  },
  // sst.config.ts uses the SST-canonical triple-slash reference to its
  // generated `.sst/platform/config.d.ts` — SST docs prescribe exactly
  // this form, and the alternative (import-style) does not work because
  // `.sst/` is gitignored and only materializes on first `sst dev`.
  {
    files: ['sst.config.ts'],
    rules: {
      '@typescript-eslint/triple-slash-reference': 'off',
    },
  },
);
