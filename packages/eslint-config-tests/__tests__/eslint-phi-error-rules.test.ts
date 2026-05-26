import path from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

/**
 * Unit tests for the D148 PHI-in-error-message rule (eslint.config.mjs
 * no-restricted-syntax PHI_IN_ERROR_SELECTORS).
 *
 * Strategy:
 *   - Spin up an ESLint instance bound to the repository config.
 *   - Lint fixture strings via `lintText`, varying the virtual filePath
 *     so the per-file `files:` overrides resolve correctly.
 *   - Assert positive (rule fires on PHI identifier names interpolated
 *     into Error / captureException / super() / message-assignment)
 *     + negative (allowlisted identifier names + non-error code paths
 *     do not trip the rule).
 *
 * The fixtures are tiny TS snippets — they would fail typecheck on
 * their own but ESLint runs without type-info for no-restricted-syntax
 * so this is fine.
 */

const repoRoot = path.resolve(__dirname, '../../..');

function makeEslint(): ESLint {
  return new ESLint({
    cwd: repoRoot,
    overrideConfigFile: path.join(repoRoot, 'eslint.config.mjs'),
    errorOnUnmatchedPattern: false,
  });
}

async function lintFixture(eslint: ESLint, source: string, filePath: string) {
  const results = await eslint.lintText(source, { filePath });
  return results[0];
}

function hasPhiErrorViolation(
  result: { messages: { message: string; ruleId: string | null }[] } | undefined,
): boolean {
  if (!result) return false;
  return result.messages.some(
    (m) => m.ruleId === 'no-restricted-syntax' && /PHI-denylisted identifier/.test(m.message),
  );
}

const FIXTURE_PATH = 'apps/web/lib/fake-fixture.ts';

describe('D148: PHI denylist — fires inside new Error() template literals', () => {
  it('fires on `throw new Error(`got ${email}`)`', async () => {
    const eslint = makeEslint();
    const result = await lintFixture(
      eslint,
      `const email = 'x';\nthrow new Error(\`got \${email}\`);\n`,
      path.join(repoRoot, FIXTURE_PATH),
    );
    expect(hasPhiErrorViolation(result)).toBe(true);
  });

  it('fires on phone, ssn, mrn, npi, dea, claim_id, prescriber_id, biometric_identifier', async () => {
    const eslint = makeEslint();
    const denylistNames = [
      'phone',
      'ssn',
      'mrn',
      'npi',
      'dea',
      'claim_id',
      'prescriber_id',
      'biometric_identifier',
    ] as const;
    for (const name of denylistNames) {
      const source = `const ${name} = 'x';\nthrow new Error(\`failed for \${${name}}\`);\n`;
      const result = await lintFixture(eslint, source, path.join(repoRoot, FIXTURE_PATH));
      expect(hasPhiErrorViolation(result), `expected ${name} to trip the rule`).toBe(true);
    }
  });

  it('fires on clinical-instrument names (phq9, audit_c, dast, cssrs)', async () => {
    const eslint = makeEslint();
    const instruments = ['phq9', 'audit_c', 'dast', 'cssrs'] as const;
    for (const name of instruments) {
      const source = `const ${name} = 1;\nthrow new Error(\`score \${${name}}\`);\n`;
      const result = await lintFixture(eslint, source, path.join(repoRoot, FIXTURE_PATH));
      expect(hasPhiErrorViolation(result), `expected ${name} to trip the rule`).toBe(true);
    }
  });

  it('fires on device/ad identifier names (device_id, advertising_id, idfa, gaid)', async () => {
    const eslint = makeEslint();
    const ids = ['device_id', 'advertising_id', 'idfa', 'gaid'] as const;
    for (const name of ids) {
      const source = `const ${name} = 'x';\nthrow new Error(\`got \${${name}}\`);\n`;
      const result = await lintFixture(eslint, source, path.join(repoRoot, FIXTURE_PATH));
      expect(hasPhiErrorViolation(result), `expected ${name} to trip the rule`).toBe(true);
    }
  });

  it('fires on geo-precision names (precise_location, lat_lng, geo_lat, latitude)', async () => {
    const eslint = makeEslint();
    const geo = ['precise_location', 'lat_lng', 'geo_lat', 'latitude'] as const;
    for (const name of geo) {
      const source = `const ${name} = 0;\nthrow new Error(\`pos \${${name}}\`);\n`;
      const result = await lintFixture(eslint, source, path.join(repoRoot, FIXTURE_PATH));
      expect(hasPhiErrorViolation(result), `expected ${name} to trip the rule`).toBe(true);
    }
  });
});

describe('D148: PHI denylist — fires on bare Identifier argument', () => {
  it('fires on `new Error(email)`', async () => {
    const eslint = makeEslint();
    const result = await lintFixture(
      eslint,
      `const email = 'x';\nthrow new Error(email);\n`,
      path.join(repoRoot, FIXTURE_PATH),
    );
    expect(hasPhiErrorViolation(result)).toBe(true);
  });
});

describe('D148: PHI denylist — fires on custom Error subclass super() with PHI', () => {
  it('fires when constructor super() interpolates a PHI identifier', async () => {
    const eslint = makeEslint();
    const source = `class FooError extends Error {\n  constructor(email: string) {\n    super(\`got \${email}\`);\n  }\n}\nexport { FooError };\n`;
    const result = await lintFixture(eslint, source, path.join(repoRoot, FIXTURE_PATH));
    expect(hasPhiErrorViolation(result)).toBe(true);
  });
});

describe('D148: PHI denylist — fires on captureException / captureMessage', () => {
  it('fires on Sentry.captureMessage with PHI template', async () => {
    const eslint = makeEslint();
    const source = `declare const Sentry: { captureMessage(s: string): void };\nconst email = 'x';\nSentry.captureMessage(\`for \${email}\`);\n`;
    const result = await lintFixture(eslint, source, path.join(repoRoot, FIXTURE_PATH));
    expect(hasPhiErrorViolation(result)).toBe(true);
  });

  it('fires on errorReporter.captureException with PHI in template message arg', async () => {
    const eslint = makeEslint();
    const source = `declare const errorReporter: { captureException(e: unknown, ctx?: unknown): void };\nconst phone = 'x';\nerrorReporter.captureException(new Error('outer'), { extra: \`tagged \${phone}\` });\n`;
    const result = await lintFixture(eslint, source, path.join(repoRoot, FIXTURE_PATH));
    expect(hasPhiErrorViolation(result)).toBe(true);
  });
});

describe('D148: PHI denylist — fires on error.message assignment', () => {
  it('fires when error.message is rewritten with a PHI template', async () => {
    const eslint = makeEslint();
    const source = `const ssn = 'x';\nconst err = new Error('base');\nerr.message = \`updated \${ssn}\`;\nthrow err;\n`;
    const result = await lintFixture(eslint, source, path.join(repoRoot, FIXTURE_PATH));
    expect(hasPhiErrorViolation(result)).toBe(true);
  });
});

describe('D148: PHI denylist — allowlist (does NOT fire on safe identifiers)', () => {
  it('passes for quilty_sub interpolation (HMAC-pseudonymised, safe)', async () => {
    const eslint = makeEslint();
    const result = await lintFixture(
      eslint,
      `const quilty_sub = 'h:abc';\nthrow new Error(\`failed for \${quilty_sub}\`);\n`,
      path.join(repoRoot, FIXTURE_PATH),
    );
    expect(hasPhiErrorViolation(result)).toBe(false);
  });

  it('passes for request_id, trace_id, route, error_code, flag_name, locale, version, digest', async () => {
    const eslint = makeEslint();
    const allowlisted = [
      'request_id',
      'trace_id',
      'route',
      'error_code',
      'flag_name',
      'locale',
      'version',
      'digest',
    ] as const;
    for (const name of allowlisted) {
      const source = `const ${name} = 'x';\nthrow new Error(\`failed \${${name}}\`);\n`;
      const result = await lintFixture(eslint, source, path.join(repoRoot, FIXTURE_PATH));
      expect(hasPhiErrorViolation(result), `expected ${name} to be allowlisted`).toBe(false);
    }
  });

  it('passes for plain string-only Error messages with no interpolation', async () => {
    const eslint = makeEslint();
    const result = await lintFixture(
      eslint,
      `throw new Error('something went wrong');\n`,
      path.join(repoRoot, FIXTURE_PATH),
    );
    expect(hasPhiErrorViolation(result)).toBe(false);
  });
});

describe('D148: PHI denylist — fires on logger.{debug,info,warn,error} structured-log field-names', () => {
  it('fires on `logger.error("msg", { email })` shorthand property', async () => {
    const eslint = makeEslint();
    const source = `declare const logger: { error(m: string, f?: unknown): void };\nconst email = 'x';\nlogger.error('failed', { email });\n`;
    const result = await lintFixture(eslint, source, path.join(repoRoot, FIXTURE_PATH));
    expect(hasPhiErrorViolation(result)).toBe(true);
  });

  it('fires on container.logger.warn with PHI-keyed object', async () => {
    const eslint = makeEslint();
    const source = `declare const container: { logger: { warn(m: string, f?: unknown): void } };\ncontainer.logger.warn('event', { phone: 'x', mrn: 'y' });\n`;
    const result = await lintFixture(eslint, source, path.join(repoRoot, FIXTURE_PATH));
    expect(hasPhiErrorViolation(result)).toBe(true);
  });

  it('passes on logger.info with allowlisted fields (request_id, route)', async () => {
    const eslint = makeEslint();
    const source = `declare const logger: { info(m: string, f?: unknown): void };\nconst request_id = 'r';\nconst route = '/x';\nlogger.info('hit', { request_id, route });\n`;
    const result = await lintFixture(eslint, source, path.join(repoRoot, FIXTURE_PATH));
    expect(hasPhiErrorViolation(result)).toBe(false);
  });
});

describe('D148: PHI denylist — legal-page override still enforces the PHI rule', () => {
  it('fires inside legal-page directories too (PHI defense is universal)', async () => {
    const eslint = makeEslint();
    const source = `const email = 'x';\nthrow new Error(\`got \${email}\`);\n`;
    const result = await lintFixture(
      eslint,
      source,
      path.join(repoRoot, 'apps/web/app/[locale]/(marketing)/legal/privacy/fixture.ts'),
    );
    expect(hasPhiErrorViolation(result)).toBe(true);
  });
});
