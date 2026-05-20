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
  // Allow console in the CloudWatch logger adapter + the WebVitalsReporter
  // component — the two chokepoints that own direct console.log emission.
  // All other code must call container.logger.* methods, which compose the
  // PHI sanitizer wrapper around the chokepoint adapter.
  {
    files: [
      'packages/observability/src/adapters/cloudwatch-logger.ts',
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
  // Tests can use the bare expectations Vitest/Playwright matchers expect.
  {
    files: ['**/__tests__/**', '**/tests/**', '**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-restricted-imports': 'off',
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
