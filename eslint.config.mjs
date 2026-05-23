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
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportAllDeclaration',
          message:
            'Use named re-exports (`export { foo } from`) instead of `export *` — star re-exports defeat tree-shaking. See Hagemeister + Vercel #27401.',
        },
        {
          selector: 'Literal[value=/HIPAA[-\\s]compli(?:ant|ance)/i]',
          message:
            'Never claim "HIPAA-compliant" or "HIPAA compliance" — use "HIPAA-aligned." Compliance without third-party attestation is FTC §5 deceptive-acts (Cerebral $7M settlement precedent). [D104]',
        },
        {
          selector: 'TemplateElement[value.raw=/HIPAA[-\\s]compli(?:ant|ance)/i]',
          message:
            'Never claim "HIPAA-compliant" or "HIPAA compliance" — use "HIPAA-aligned." Compliance without third-party attestation is FTC §5 deceptive-acts (Cerebral $7M settlement precedent). [D104]',
        },
        {
          selector: 'JSXText[value=/HIPAA[-\\s]compli(?:ant|ance)/i]',
          message:
            'Never claim "HIPAA-compliant" or "HIPAA compliance" — use "HIPAA-aligned." Compliance without third-party attestation is FTC §5 deceptive-acts (Cerebral $7M settlement precedent). [D104]',
        },
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
      ],

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
    ],
    rules: {
      'no-console': 'off',
    },
  },
  // Allow vendor SDK imports inside the adapter chokepoint surface.
  // Two tiers covered by this override:
  //   1. The Sentry init files at apps/web/sentry.{client,server,edge}.config.ts
  //      + apps/web/instrumentation.ts. These are Next.js convention files
  //      bound to their fixed paths and cannot live inside a workspace
  //      package; they retain direct @sentry/nextjs import access.
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
      'packages/*/src/adapters/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': 'off',
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
      // D104 HIPAA-compliant ban retained (universal — even legal
      // copy must use "HIPAA-aligned") + JSXText selector added so
      // the rule catches React-rendered policy claims.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportAllDeclaration',
          message:
            'Use named re-exports (`export { foo } from`) instead of `export *` — star re-exports defeat tree-shaking. See Hagemeister + Vercel #27401.',
        },
        {
          selector: 'Literal[value=/HIPAA[-\\s]compli(?:ant|ance)/i]',
          message:
            'Never claim "HIPAA-compliant" or "HIPAA compliance" — use "HIPAA-aligned." Compliance without third-party attestation is FTC §5 deceptive-acts (Cerebral $7M settlement precedent). [D104]',
        },
        {
          selector: 'TemplateElement[value.raw=/HIPAA[-\\s]compli(?:ant|ance)/i]',
          message:
            'Never claim "HIPAA-compliant" or "HIPAA compliance" — use "HIPAA-aligned." Compliance without third-party attestation is FTC §5 deceptive-acts (Cerebral $7M settlement precedent). [D104]',
        },
        {
          selector: 'JSXText[value=/HIPAA[-\\s]compli(?:ant|ance)/i]',
          message:
            'Never claim "HIPAA-compliant" or "HIPAA compliance" — use "HIPAA-aligned." Compliance without third-party attestation is FTC §5 deceptive-acts (Cerebral $7M settlement precedent). [D104]',
        },
        // DPO ban LIFTED for legal copy — the Art 37 non-appointment
        // disclosure requires the verbatim term. Drift to "DPO" as a
        // self-applied title is caught by Pass A reviewer discipline +
        // the privacy-policy.spec.ts negative-disclosure test.
      ],
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
      'no-restricted-imports': 'off',
      'no-restricted-syntax': 'off',
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
    files: ['eslint.config.mjs', 'scripts/check-compliance-language.mjs'],
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
