#!/usr/bin/env node
/**
 * CI gate: validates `apps/web/public/.well-known/security.txt`
 * exists, parses cleanly, and has an `Expires:` value more than 30
 * days in the future. Fails fast with a descriptive message naming
 * the fix.
 *
 * RFC 9116 §2.5: Expires must be ≤ 1 year from the current date.
 * Enterprise practice (Stripe, Anthropic, Linear, BetterHelp): rotate
 * annually on December 31.
 *
 * GitHub's security.txt linter + HackerOne's own tooling warn at 30
 * days; this script fails CI at the same threshold so the rotation
 * lands before the file goes stale in production.
 *
 * Run locally: node scripts/check-security-txt-expires.mjs
 * Run in CI:   wired into the hygiene job via `pnpm security-txt:check`.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Repo-root script (cross-cutting CI hygiene gate) reaching into the
// apps/web workspace. The relative path mirrors the workspace shape
// fixed by `pnpm-workspace.yaml` + the Turborepo monorepo convention;
// it would only break under a deliberate workspace relocation, which
// would also require a pnpm-workspace.yaml edit + `pnpm install`.
const SECURITY_TXT_PATH = join(
  __dirname,
  '..',
  'apps',
  'web',
  'public',
  '.well-known',
  'security.txt',
);

const WARN_WINDOW_DAYS = 30;
const WARN_WINDOW_MS = WARN_WINDOW_DAYS * 24 * 60 * 60 * 1000;

async function main() {
  let raw;
  try {
    raw = await readFile(SECURITY_TXT_PATH, 'utf-8');
  } catch {
    // eslint-disable-next-line no-console -- build-time CI script
    console.error(
      `[security-txt] ERROR: File not found at ${SECURITY_TXT_PATH}\n` +
        '  Create apps/web/public/.well-known/security.txt with a valid Expires field.',
    );
    process.exit(1);
  }

  const lines = raw.split('\n').map((l) => l.trim());
  const expiresLine = lines.find((l) => l.startsWith('Expires:'));

  if (!expiresLine) {
    // eslint-disable-next-line no-console -- build-time CI script
    console.error(
      '[security-txt] ERROR: No "Expires:" field found in security.txt.\n' +
        '  Add a line like:  Expires: 2026-12-31T23:59:00.000Z',
    );
    process.exit(1);
  }

  const rawValue = expiresLine.replace(/^Expires:\s*/, '').trim();

  // Strict RFC 3339 with Z suffix — defends against the V8 Date
  // parser silently accepting locale strings like "December 31, 2026"
  // or unzoned ISO 8601. The RFC 9116 §2.5 example uses exactly this
  // shape; security.txt linters (securitytxt.org validator) reject
  // anything else.
  const RFC3339_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
  if (!RFC3339_UTC_PATTERN.test(rawValue)) {
    // eslint-disable-next-line no-console -- build-time CI script
    console.error(
      `[security-txt] ERROR: Expires value "${rawValue}" is not RFC 3339 with UTC Z suffix.\n` +
        '  Expected format: 2026-12-31T23:59:00.000Z',
    );
    process.exit(1);
  }

  const expiresDate = new Date(rawValue);

  if (Number.isNaN(expiresDate.getTime())) {
    // eslint-disable-next-line no-console -- build-time CI script
    console.error(
      `[security-txt] ERROR: Expires value "${rawValue}" is not a valid date.\n` +
        '  Expected format: 2026-12-31T23:59:00.000Z',
    );
    process.exit(1);
  }

  const now = Date.now();
  const msUntilExpiry = expiresDate.getTime() - now;
  const daysUntilExpiry = Math.floor(msUntilExpiry / (24 * 60 * 60 * 1000));

  if (msUntilExpiry <= 0) {
    // eslint-disable-next-line no-console -- build-time CI script
    console.error(
      `[security-txt] ERROR: security.txt expired ${Math.abs(daysUntilExpiry)} day(s) ago.\n` +
        '  Update Expires: to a future RFC 3339 date (≤ 1 year from today, RFC 9116 §2.5).',
    );
    process.exit(1);
  }

  if (msUntilExpiry < WARN_WINDOW_MS) {
    // eslint-disable-next-line no-console -- build-time CI script
    console.error(
      `[security-txt] ERROR: security.txt expires in ${daysUntilExpiry} day(s) — within the ${WARN_WINDOW_DAYS}-day rotation window.\n` +
        '  Update Expires: to a future date before merging. RFC 9116 §2.5 caps the value at 1 year out.',
    );
    process.exit(1);
  }

  // eslint-disable-next-line no-console -- build-time CI script
  console.log(`[security-txt] OK: Expires ${rawValue} — ${daysUntilExpiry} days remaining.`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console -- build-time CI script
  console.error('[security-txt] Unexpected error:', err);
  process.exit(1);
});
