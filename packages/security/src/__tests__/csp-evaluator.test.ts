/**
 * Lints the CSP outputs against Google's csp_evaluator.
 *
 * Catches well-known CSP bypass classes (overly-broad whitelists,
 * unsafe-inline + nonce coexistence, missing strict-dynamic, etc.).
 * Trusted Types is MDN Baseline as of 2026; our spine ships
 * `require-trusted-types-for 'script'` report-only and enforces at the
 * M8 launch gate — csp_evaluator surfaces Trusted-Types-relevant findings
 * too.
 *
 * Fails on any HIGH severity finding.
 */
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { buildMarketingCsp, buildPortalCsp } from '../domain/csp-builder';
// csp_evaluator ships CommonJS only; createRequire is the documented bridge.
const nodeRequire = createRequire(import.meta.url);
const { CspParser } = nodeRequire('csp_evaluator/dist/parser.js');
const { CspEvaluator } = nodeRequire('csp_evaluator/dist/evaluator.js');
const { Severity } = nodeRequire('csp_evaluator/dist/finding.js');

interface Finding {
  severity: number;
  directive: string;
  description: string;
}

function highFindings(cspValue: string): Finding[] {
  const parsed = new CspParser(cspValue).csp;
  const evaluator = new CspEvaluator(parsed);
  const findings: Finding[] = evaluator.evaluate();
  return findings.filter((f) => f.severity === Severity.HIGH);
}

describe('csp_evaluator — Google bypass database', () => {
  it('marketing CSP has zero HIGH severity findings', () => {
    const csp = buildMarketingCsp({ isDevelopment: false });
    const high = highFindings(csp);
    if (high.length > 0) {
      // eslint-disable-next-line no-console
      console.error('Marketing CSP HIGH findings:', high);
    }
    expect(high).toEqual([]);
  });

  it('portal CSP has zero HIGH severity findings', () => {
    const csp = buildPortalCsp('TEST_NONCE_FOR_LINT_ONLY', { isDevelopment: false });
    const high = highFindings(csp);
    if (high.length > 0) {
      // eslint-disable-next-line no-console
      console.error('Portal CSP HIGH findings:', high);
    }
    expect(high).toEqual([]);
  });
});
