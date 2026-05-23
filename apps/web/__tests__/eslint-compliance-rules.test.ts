import path from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

/**
 * Unit tests for the D104 "HIPAA-compliant" ban + D136 "DPO"
 * self-applied-title ban (eslint.config.mjs no-restricted-syntax
 * rules added in commit 28).
 *
 * Strategy:
 *   - Spin up an ESLint instance bound to the repository config.
 *   - Lint fixture strings in-memory via `lintText`, varying the
 *     virtual filePath so the per-file `files:` overrides resolve
 *     correctly (legal-page paths get the DPO-allowed override;
 *     all other paths get the strict ban).
 *   - Assert positive (rule fires) + negative (allowed-form passes)
 *     cases for both rules.
 *
 * The fixtures are tiny TS snippets — they would fail typecheck on
 * their own but ESLint runs without type-info for `no-restricted-
 * syntax` so this is fine.
 */

const repoRoot = path.resolve(__dirname, '../../..');

function makeEslint(): ESLint {
  return new ESLint({
    cwd: repoRoot,
    overrideConfigFile: path.join(repoRoot, 'eslint.config.mjs'),
    // Stop on the first config-load error rather than warning across
    // every fixture.
    errorOnUnmatchedPattern: false,
  });
}

async function lintFixture(eslint: ESLint, source: string, filePath: string) {
  const results = await eslint.lintText(source, { filePath });
  return results[0];
}

function hasMessageMatching(
  result: { messages: { message: string; ruleId: string | null }[] } | undefined,
  ruleId: string,
  pattern: RegExp,
): boolean {
  if (!result) return false;
  return result.messages.some((m) => m.ruleId === ruleId && pattern.test(m.message));
}

describe('D104: ban "HIPAA-compliant" in source', () => {
  it('fires on a string literal claiming "HIPAA-compliant"', async () => {
    const eslint = makeEslint();
    const result = await lintFixture(
      eslint,
      `export const claim = "We are HIPAA-compliant in every release.";\n`,
      path.join(repoRoot, 'apps/web/lib/fake-fixture.ts'),
    );
    expect(hasMessageMatching(result, 'no-restricted-syntax', /HIPAA-compliant/)).toBe(true);
  });

  it('fires on a template-literal claim "HIPAA compliant" (case-insensitive, space-or-dash)', async () => {
    const eslint = makeEslint();
    const result = await lintFixture(
      eslint,
      'export const claim = `We are hipaa compliant in every release.`;\n',
      path.join(repoRoot, 'apps/web/lib/fake-fixture.ts'),
    );
    expect(hasMessageMatching(result, 'no-restricted-syntax', /HIPAA/)).toBe(true);
  });

  it('passes on the allowed "HIPAA-aligned" form', async () => {
    const eslint = makeEslint();
    const result = await lintFixture(
      eslint,
      `export const claim = "We are HIPAA-aligned in every release.";\n`,
      path.join(repoRoot, 'apps/web/lib/fake-fixture.ts'),
    );
    expect(hasMessageMatching(result, 'no-restricted-syntax', /HIPAA/)).toBe(false);
  });

  it('fires inside the legal-page directory too (compliant ban is universal)', async () => {
    const eslint = makeEslint();
    const result = await lintFixture(
      eslint,
      `export const claim = "We are HIPAA-compliant.";\n`,
      path.join(repoRoot, 'apps/web/app/[locale]/(marketing)/legal/privacy/fixture.ts'),
    );
    expect(hasMessageMatching(result, 'no-restricted-syntax', /HIPAA-compliant/)).toBe(true);
  });
});

describe('D136: ban "DPO" self-applied title in source', () => {
  it('fires on a bare "DPO" string literal outside legal-page directories', async () => {
    const eslint = makeEslint();
    const result = await lintFixture(
      eslint,
      `export const title = "Our DPO will respond to your request.";\n`,
      path.join(repoRoot, 'apps/web/components/site/fixture.ts'),
    );
    expect(hasMessageMatching(result, 'no-restricted-syntax', /DPO/)).toBe(true);
  });

  it('allows "DPO" inside legal-page directories (Art 37 disclosure context)', async () => {
    const eslint = makeEslint();
    const result = await lintFixture(
      eslint,
      `export const claim = "We do not employ a DPO at this time.";\n`,
      path.join(repoRoot, 'apps/web/app/[locale]/(marketing)/legal/privacy/fixture.ts'),
    );
    expect(hasMessageMatching(result, 'no-restricted-syntax', /DPO/)).toBe(false);
  });

  it('passes on the allowed "Privacy Lead" form everywhere', async () => {
    const eslint = makeEslint();
    const result = await lintFixture(
      eslint,
      `export const title = "Our Privacy Lead will respond.";\n`,
      path.join(repoRoot, 'apps/web/components/site/fixture.ts'),
    );
    expect(hasMessageMatching(result, 'no-restricted-syntax', /DPO/)).toBe(false);
  });

  it('does NOT fire on identifiers that merely contain DPO as a substring (word-boundary discipline)', async () => {
    const eslint = makeEslint();
    // The rule uses \bDPO\b so internal-substring matches in
    // identifier-like strings (e.g., a hypothetical service name
    // such as "myDPOservice") must not trigger it. A regression
    // that degraded the regex to bare /DPO/i would catch this case
    // + the test would fail.
    const result = await lintFixture(
      eslint,
      `export const x = "myDPOservice runs on apiendpointA";\n`,
      path.join(repoRoot, 'apps/web/components/site/fixture.ts'),
    );
    expect(hasMessageMatching(result, 'no-restricted-syntax', /DPO/)).toBe(false);
  });

  it('fires on the lowercase variant "dpo" (case-insensitive)', async () => {
    const eslint = makeEslint();
    const result = await lintFixture(
      eslint,
      `export const title = "Our dpo will respond.";\n`,
      path.join(repoRoot, 'apps/web/components/site/fixture.ts'),
    );
    expect(hasMessageMatching(result, 'no-restricted-syntax', /DPO/)).toBe(true);
  });
});

describe('D104 noun form: ban "HIPAA compliance"', () => {
  it('fires on the noun form "HIPAA compliance" (regex covers compliant + compliance)', async () => {
    const eslint = makeEslint();
    const result = await lintFixture(
      eslint,
      `export const claim = "Our HIPAA compliance framework is robust.";\n`,
      path.join(repoRoot, 'apps/web/lib/fake-fixture.ts'),
    );
    expect(hasMessageMatching(result, 'no-restricted-syntax', /HIPAA/)).toBe(true);
  });

  it('passes on "HIPAA alignment" (alignment is the allowed noun form)', async () => {
    const eslint = makeEslint();
    const result = await lintFixture(
      eslint,
      `export const claim = "Our HIPAA alignment is documented.";\n`,
      path.join(repoRoot, 'apps/web/lib/fake-fixture.ts'),
    );
    expect(hasMessageMatching(result, 'no-restricted-syntax', /HIPAA/)).toBe(false);
  });
});

describe('D104 JSXText: ban claims in React-rendered text', () => {
  it('fires on JSXText content claiming "HIPAA-compliant"', async () => {
    const eslint = makeEslint();
    const result = await lintFixture(
      eslint,
      `export const Page = () => <p>We are HIPAA-compliant across the board.</p>;\n`,
      path.join(repoRoot, 'apps/web/components/site/fixture.tsx'),
    );
    expect(hasMessageMatching(result, 'no-restricted-syntax', /HIPAA/)).toBe(true);
  });
});
