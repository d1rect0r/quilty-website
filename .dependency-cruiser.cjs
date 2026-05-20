/**
 * dependency-cruiser config.
 *
 * Enforces graph-level rules that ESLint can't see (it sees per-file,
 * depcruise sees the whole import graph):
 *
 *   1. shadcn primitives (apps/web/components/ui/) MUST NOT import from
 *      anywhere else in the app. Wrappers (apps/web/components/app/)
 *      can pull from them; reverse is a structural violation. Mirrors
 *      D18 "wrap-don't-edit" — the PreToolUse hook protects file
 *      writes; this rule protects the import graph.
 *   2. Direct vendor SDK imports (@sentry/*, @amplitude/*) MUST live
 *      ONLY under packages/<role>/src/adapters/ + the Next.js Sentry
 *      convention files (sentry.{client,server,edge}.config.ts +
 *      instrumentation.ts). ESLint catches per-file static imports;
 *      depcruise catches transitive imports too.
 *   3. Cross-package imports go through the package barrel only
 *      (index.ts or __fakes__/index.ts).
 *   4. No cycles. No orphans (depcruise defaults).
 *
 * Run on demand via `pnpm depcruise`; CI runs `--validate` (exit non-
 * zero on rule violation).
 */
module.exports = {
  forbidden: [
    {
      name: 'no-cycles',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-shadcn-importing-app',
      comment: 'shadcn primitives are wrap-only (D18); they must stay framework-agnostic.',
      severity: 'error',
      from: { path: '^apps/web/components/ui/' },
      to: {
        path: '^apps/web/(?!components/ui/|lib/utils)',
        pathNot: ['^apps/web/lib/utils\\.ts$'],
      },
    },
    {
      name: 'no-direct-vendor-sdk-outside-adapter-chokepoint',
      comment:
        'D67 + D78: vendor SDKs must be imported only through the adapter chokepoint. The adapter surface comprises (a) packages/<role>/src/adapters/<vendor>.ts files for workspace-package adapters and (b) the Next.js convention files apps/web/sentry.{client,server,edge}.config.ts + apps/web/instrumentation.ts which are bound to fixed paths and cannot live inside a workspace package. Direct vendor imports anywhere else bypass the PHI sanitizer chokepoint and consent gating.',
      severity: 'error',
      from: {
        pathNot: [
          '^packages/[^/]+/src/adapters/',
          '^apps/web/sentry\\.(client|server|edge)\\.config\\.ts$',
          '^apps/web/instrumentation\\.ts$',
        ],
      },
      to: {
        path: '^node_modules/(@sentry|@amplitude)',
      },
    },
    {
      name: 'cross-package-imports-must-use-barrel',
      comment:
        'Workspace packages expose their public API through index.ts (or src/__fakes__/index.ts for consumer tests). Deep imports into a package internal path bypass the public-API contract and re-create the chokepoint risk D67/D78 close. ESLint enforces this at the import statement layer; depcruise enforces it across the transitive graph.',
      severity: 'error',
      from: { path: '^apps/web/' },
      to: {
        path: '^packages/[^/]+/src/(?!index\\.ts$|__fakes__/index\\.ts$)',
      },
    },
    {
      name: 'no-orphans',
      comment:
        'No source files that nothing else imports. Scaffolded deliverables (block library + lib/flags) are excluded — they exist to be consumed by Velite MDX content + the runtime-toggle flags adapter at their activation triggers.',
      severity: 'warn',
      from: {
        orphan: true,
        pathNot: [
          '\\.d\\.ts$',
          '(^|/)\\.[^/]+\\.(js|cjs|mjs|ts|json)$',
          '\\.config\\.(js|cjs|mjs|ts)$',
          // Next.js convention files are loaded by the framework, not imported
          'apps/web/app/.+\\.(tsx?|mjs)$',
          'apps/web/instrumentation\\.ts$',
          'apps/web/instrumentation-client\\.ts$',
          'apps/web/proxy\\.ts$',
          'apps/web/sentry\\..+\\.ts$',
          // Composition roots + container accessor — entrypoints consumed
          // by Next.js runtime hooks (instrumentation register, Route
          // Handler init, proxy bootstrap). They are wired in as the
          // workspace packages land in subsequent extraction commits;
          // until then they are intentionally orphan.
          'apps/web/composition\\.(server|client|edge)\\.ts$',
          'apps/web/lib/get-container\\.ts$',
          'apps/web/next-env\\.d\\.ts$',
          '__tests__|\\.test\\.|\\.spec\\.',
          'tests/playwright/',
          // Scaffolded for future activation — consumed at content-layer
          // activation when MDX content lands.
          'apps/web/components/blocks/',
          'apps/web/lib/flags/',
          'apps/web/lib/utils\\.ts$',
          // Indirectly consumed via Next.js conventions or framework hooks
          'apps/web/lib/seo/schemas\\.ts$',
          'apps/web/components/site/SkipLink\\.tsx$',
          'apps/web/components/seo/JsonLd\\.tsx$',
          // Vitest setup files are loaded via vitest.config.ts setupFiles
          'apps/web/vitest\\.setup\\.ts$',
          // Empty workspace entrypoint — populated by OpenAPI codegen at M5
          'packages/shared-types/src/index\\.ts$',
          // Type-only modules in workspace packages. depcruise with
          // tsPreCompilationDeps: false does not follow `import type`
          // edges, so type-only `ports.ts` + `errors.ts` files surface as
          // orphan even though they ARE imported via `import type` from
          // their package's index barrel + tests. Re-evaluate when M5
          // flips tsPreCompilationDeps on.
          'packages/[^/]+/src/(ports|errors)\\.ts$',
        ],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: {
      path: [
        '\\.next/',
        '\\.velite/',
        '\\.turbo/',
        '\\.sst/',
        'dist/',
        'coverage/',
        'playwright-report/',
        'test-results/',
        '__tests__/',
        '\\.test\\.',
        '\\.spec\\.',
        'tests/playwright/',
      ],
    },
    // AST-only (no `tsConfig`): graph-structural rules don't need
    // type-aware resolution and the workspace `extends` chain trips
    // depcruise's tsconfig loader. Re-enable at M5 when the OpenAPI
    // codegen pipeline lands and per-type analysis becomes valuable.
    tsPreCompilationDeps: false,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
