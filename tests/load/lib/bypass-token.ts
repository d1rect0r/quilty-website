/**
 * Read the load-test bypass token from the k6 environment.
 * Documented at `tests/load/README.md` + ADR-0017.
 *
 * The token is supplied per-run via the k6 CLI:
 *   `RATELIMIT_BYPASS_TOKEN=secret k6 run scenarios/contact-submission.k6.ts`
 *
 * In CI we source it from the `RATELIMIT_BYPASS_TOKEN` GHA secret;
 * locally each developer sets it in their shell when invoking k6.
 *
 * Defensive failure mode: when the env var is unset, the bypass
 * helper returns an empty string so the request lands without a
 * bypass header (k6 will hit the rate-limit ceiling). This matches
 * the production stance where the env is unset and the bypass is
 * inert.
 */

// `__ENV` is the k6-injected environment object; types come from
// `@types/k6` which isn't in our devDependencies (k6 runs inside its
// own Go runtime, not Node). Casting through `unknown` here keeps
// the file lint-clean without adding an unused type dep.
const k6Env = (globalThis as unknown as { __ENV?: Record<string, string> }).__ENV ?? {};

export function readBypassToken(): string {
  return k6Env['RATELIMIT_BYPASS_TOKEN'] ?? '';
}

export function bypassHeader(): Record<string, string> {
  const token = readBypassToken();
  return token.length > 0 ? { 'X-Load-Test-Bypass': token } : {};
}
