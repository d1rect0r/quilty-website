import type { PlopTypes } from '@turbo/gen';

/**
 * Turborepo + Plop generator suite for workspace packages.
 *
 * Five generators map to the hexagonal-by-boundary architecture:
 *
 *   package          — full hexagonal package skeleton with one initial port +
 *                      one in-memory adapter + parameterized contract test
 *   port             — add a new port (interface + fake + contract test) to an
 *                      existing package
 *   adapter          — add a vendor adapter implementation for an existing port
 *   fake             — add an in-memory fake adapter for an existing port
 *   utility-package  — pure utility package (no ports/adapters layer); used for
 *                      seo, content, shared-types-style helpers
 *
 * Invocation:
 *
 *   pnpm exec turbo gen package
 *   pnpm exec turbo gen port
 *   pnpm exec turbo gen adapter
 *   pnpm exec turbo gen fake
 *   pnpm exec turbo gen utility-package
 *
 * The Plop runner prompts for the name/role and any other inputs.
 *
 * Naming discipline (META-1):
 *   role names are vendor-agnostic ("analytics", "email", "captcha") — never
 *   "amplitude", "ses", "turnstile". Vendor names appear ONLY in adapter file
 *   names (packages/<role>/src/adapters/<vendor>.ts). The vendor prompt in the
 *   adapter generator enforces lowercase + role-vendor convention.
 *
 * Barrel discipline (D78/D79):
 *   every package exports through src/index.ts and src/__fakes__/index.ts ONLY.
 *   These are the two paths the .dependency-cruiser.cjs allowlist regex
 *   permits cross-package imports from. Generators MUST emit these exact
 *   filenames; consumers MUST import from them and nowhere else.
 */
export default function generator(plop: PlopTypes.NodePlopAPI): void {
  plop.setGenerator('package', {
    description:
      'Create a new hexagonal workspace package (ports + adapters + fakes + contract tests)',
    prompts: [
      {
        type: 'input',
        name: 'name',
        message:
          'Package role name (kebab-case, vendor-agnostic — e.g. "security", "email", "captcha"):',
        validate: (input: string) => {
          if (!/^[a-z][a-z0-9-]*[a-z0-9]$/.test(input)) {
            return 'Use lowercase kebab-case (e.g. "rate-limit", "consent"); no leading numbers, no trailing hyphen.';
          }
          if (['ui', 'app', 'src', 'lib', 'utils', 'config'].includes(input)) {
            return `Reserved name "${input}" — choose a role-shaped name.`;
          }
          return true;
        },
      },
      {
        type: 'input',
        name: 'description',
        message: 'One-line description of the package role:',
        validate: (input: string) => (input.trim().length > 0 ? true : 'Description required'),
      },
      {
        type: 'input',
        name: 'portName',
        message: 'Initial port name (PascalCase — e.g. "Analytics", "EmailSender", "Captcha"):',
        validate: (input: string) => {
          if (!/^[A-Z][A-Za-z0-9]*$/.test(input)) {
            return 'Use PascalCase (e.g. "EmailSender"); no spaces, no hyphens.';
          }
          if (input.endsWith('Service')) {
            return '"Service" suffix is banned (META-1) — use a role-shaped noun (EmailSender, not EmailService).';
          }
          return true;
        },
      },
    ],
    actions: [
      {
        type: 'add',
        path: 'packages/{{ kebabCase name }}/package.json',
        templateFile: 'templates/package/package.json.hbs',
      },
      {
        type: 'add',
        path: 'packages/{{ kebabCase name }}/tsconfig.json',
        templateFile: 'templates/package/tsconfig.json.hbs',
      },
      {
        type: 'add',
        path: 'packages/{{ kebabCase name }}/README.md',
        templateFile: 'templates/package/README.md.hbs',
      },
      {
        type: 'add',
        path: 'packages/{{ kebabCase name }}/src/index.ts',
        templateFile: 'templates/package/src/index.ts.hbs',
      },
      {
        type: 'add',
        path: 'packages/{{ kebabCase name }}/src/ports.ts',
        templateFile: 'templates/package/src/ports.ts.hbs',
      },
      {
        type: 'add',
        path: 'packages/{{ kebabCase name }}/src/errors.ts',
        templateFile: 'templates/package/src/errors.ts.hbs',
      },
      {
        type: 'add',
        path: 'packages/{{ kebabCase name }}/src/adapters/in-memory.ts',
        templateFile: 'templates/package/src/adapters/in-memory.ts.hbs',
      },
      {
        type: 'add',
        path: 'packages/{{ kebabCase name }}/src/__fakes__/index.ts',
        templateFile: 'templates/package/src/__fakes__/index.ts.hbs',
      },
      {
        type: 'add',
        path: 'packages/{{ kebabCase name }}/src/__fakes__/{{ kebabCase portName }}.fake.ts',
        templateFile: 'templates/package/src/__fakes__/port.fake.ts.hbs',
      },
      {
        type: 'add',
        path: 'packages/{{ kebabCase name }}/src/__tests__/{{ kebabCase portName }}.contract.test.ts',
        templateFile: 'templates/package/src/__tests__/port.contract.test.ts.hbs',
      },
    ],
  });

  plop.setGenerator('utility-package', {
    description: 'Create a new utility workspace package (no ports/adapters; just typed exports)',
    prompts: [
      {
        type: 'input',
        name: 'name',
        message: 'Package role name (kebab-case — e.g. "seo", "content", "shared-types"):',
        validate: (input: string) => {
          if (!/^[a-z][a-z0-9-]*[a-z0-9]$/.test(input)) {
            return 'Use lowercase kebab-case (e.g. "shared-types"); no leading numbers, no trailing hyphen.';
          }
          return true;
        },
      },
      {
        type: 'input',
        name: 'description',
        message: 'One-line description of the package:',
        validate: (input: string) => (input.trim().length > 0 ? true : 'Description required'),
      },
    ],
    actions: [
      {
        type: 'add',
        path: 'packages/{{ kebabCase name }}/package.json',
        templateFile: 'templates/utility-package/package.json.hbs',
      },
      {
        type: 'add',
        path: 'packages/{{ kebabCase name }}/tsconfig.json',
        templateFile: 'templates/utility-package/tsconfig.json.hbs',
      },
      {
        type: 'add',
        path: 'packages/{{ kebabCase name }}/README.md',
        templateFile: 'templates/utility-package/README.md.hbs',
      },
      {
        type: 'add',
        path: 'packages/{{ kebabCase name }}/src/index.ts',
        templateFile: 'templates/utility-package/src/index.ts.hbs',
      },
    ],
  });

  plop.setGenerator('port', {
    description: 'Add a new port (interface + fake + contract test) to an existing package',
    prompts: [
      {
        type: 'input',
        name: 'package',
        message: 'Target package (kebab-case — e.g. "security", "observability"):',
        validate: (input: string) =>
          /^[a-z][a-z0-9-]*[a-z0-9]$/.test(input) || 'Use lowercase kebab-case',
      },
      {
        type: 'input',
        name: 'portName',
        message: 'Port name (PascalCase — e.g. "RateLimiter", "Captcha"):',
        validate: (input: string) => {
          if (!/^[A-Z][A-Za-z0-9]*$/.test(input)) {
            return 'Use PascalCase';
          }
          if (input.endsWith('Service')) {
            return '"Service" suffix is banned (META-1) — use a role-shaped noun.';
          }
          return true;
        },
      },
    ],
    actions: [
      {
        type: 'add',
        path: 'packages/{{ kebabCase package }}/src/__fakes__/{{ kebabCase portName }}.fake.ts',
        templateFile: 'templates/port/port.fake.ts.hbs',
      },
      {
        type: 'add',
        path: 'packages/{{ kebabCase package }}/src/__tests__/{{ kebabCase portName }}.contract.test.ts',
        templateFile: 'templates/port/port.contract.test.ts.hbs',
      },
      {
        type: 'append',
        path: 'packages/{{ kebabCase package }}/src/ports.ts',
        templateFile: 'templates/port/ports-snippet.ts.hbs',
        separator: '\n',
      },
      {
        // Without this append, the new fake is unreachable via the
        // "@quilty/<role>/testing" subpath export and the parameterized
        // contract test fails with a module-not-found error.
        type: 'append',
        path: 'packages/{{ kebabCase package }}/src/__fakes__/index.ts',
        templateFile: 'templates/port/fakes-barrel-snippet.ts.hbs',
        separator: '',
      },
    ],
  });

  plop.setGenerator('adapter', {
    description: 'Add a vendor adapter implementation for an existing port',
    prompts: [
      {
        type: 'input',
        name: 'package',
        message: 'Target package (kebab-case):',
        validate: (input: string) =>
          /^[a-z][a-z0-9-]*[a-z0-9]$/.test(input) || 'Use lowercase kebab-case',
      },
      {
        type: 'input',
        name: 'portName',
        message: 'Port being implemented (PascalCase — e.g. "Analytics", "EmailSender"):',
        validate: (input: string) => /^[A-Z][A-Za-z0-9]*$/.test(input) || 'Use PascalCase',
      },
      {
        type: 'input',
        name: 'vendor',
        message: 'Vendor name (lowercase — e.g. "amplitude", "ses", "turnstile", "sentry"):',
        validate: (input: string) =>
          /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(input) ||
          'Use lowercase kebab-case; no leading or trailing hyphen',
      },
    ],
    actions: [
      {
        type: 'add',
        path: 'packages/{{ kebabCase package }}/src/adapters/{{ kebabCase vendor }}.ts',
        templateFile: 'templates/adapter/adapter.ts.hbs',
      },
      {
        type: 'add',
        path: 'packages/{{ kebabCase package }}/src/adapters/{{ kebabCase vendor }}.test.ts',
        templateFile: 'templates/adapter/adapter.test.ts.hbs',
      },
    ],
  });

  plop.setGenerator('fake', {
    description: 'Add (or replace) the in-memory fake adapter for an existing port',
    prompts: [
      {
        type: 'input',
        name: 'package',
        message: 'Target package (kebab-case):',
        validate: (input: string) =>
          /^[a-z][a-z0-9-]*[a-z0-9]$/.test(input) || 'Use lowercase kebab-case',
      },
      {
        type: 'input',
        name: 'portName',
        message: 'Port being faked (PascalCase):',
        validate: (input: string) => /^[A-Z][A-Za-z0-9]*$/.test(input) || 'Use PascalCase',
      },
    ],
    actions: [
      {
        type: 'add',
        path: 'packages/{{ kebabCase package }}/src/adapters/in-memory.ts',
        templateFile: 'templates/fake/in-memory.ts.hbs',
        force: true,
      },
    ],
  });
}
