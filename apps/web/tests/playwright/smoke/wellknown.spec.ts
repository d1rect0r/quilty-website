import { expect, test } from '@playwright/test';

/**
 * .well-known mobile-deeplink manifests — content type, schema, and
 * absence-of-legacy-keys guards.
 *
 * Both files must serve as `application/json` regardless of file
 * extension (iOS `swcd` silently fails universal-link verification on
 * `application/octet-stream`). The schema assertions catch silent
 * drift — a mobile-team coordination request that drops a bundle
 * variant but is not synced to the website, or a cleanup pass that
 * re-introduces legacy keys.
 */

// 10-char Team ID + dotted bundle suffix; each segment alphanumeric or
// hyphen, no trailing dot. Apple `swcd` rejects malformed appIDs silently.
const APPLE_BUNDLE_ID_PATTERN = /^[A-Z0-9]{10}\.([A-Za-z0-9-]+\.)*[A-Za-z0-9-]+$/;
const SHA256_FINGERPRINT_PATTERN = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;
// Google Play rejects uppercase package names at upload, so the pattern
// is intentionally case-sensitive (no `/i` flag).
const ANDROID_PACKAGE_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/;

test('@smoke .well-known/apple-app-site-association serves as application/json', async ({
  request,
}) => {
  const response = await request.get('/.well-known/apple-app-site-association');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/json');
});

test('@smoke .well-known/assetlinks.json serves as application/json', async ({ request }) => {
  const response = await request.get('/.well-known/assetlinks.json');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/json');
});

test('@smoke AASA matches modern applinks.details[].components schema (no legacy keys)', async ({
  request,
}) => {
  const aasaResponse = await request.get('/.well-known/apple-app-site-association');
  const aasa = (await aasaResponse.json()) as Record<string, unknown>;

  // iOS 13+ `swcd` consumes only `applinks.details[].components`. The
  // legacy `applinks.details[].paths` array remains parseable but is
  // ignored when `components` is present. Shipping both is harmless on
  // modern iOS but signals stale configuration to AASA validators.
  // (The root-level `paths` check is intentionally omitted — `paths`
  // is never valid at the root per the Apple AASA spec, so a root
  // assertion would be dead coverage. The per-detail-entry check
  // below at line ~70 is the real guard.)
  expect(aasa['appclips']).toBeUndefined();
  // `webcredentials` (Shared Web Credentials) is only consumed when the
  // iOS app declares the matching entitlement. Until mobile confirms
  // the entitlement is wired, the block stays out of AASA.
  expect(aasa['webcredentials']).toBeUndefined();

  const applinks = aasa['applinks'];
  expect(applinks).not.toBeNull();
  expect(typeof applinks).toBe('object');
  const applinksRecord = applinks as Record<string, unknown>;
  expect(Array.isArray(applinksRecord['apps'])).toBe(true);
  expect((applinksRecord['apps'] as unknown[]).length).toBe(0);

  const details = applinksRecord['details'] as readonly {
    appIDs?: unknown;
    components?: unknown;
    paths?: unknown;
  }[];
  expect(Array.isArray(details)).toBe(true);
  expect(details.length).toBeGreaterThanOrEqual(1);

  const aasaAppIdSet = new Set<string>();
  for (const detail of details) {
    // Legacy `paths` must not coexist with modern `components` — same
    // information twice creates a stale-config smell.
    expect(detail.paths).toBeUndefined();

    const appIDs = detail.appIDs as readonly string[];
    expect(Array.isArray(appIDs)).toBe(true);
    expect(appIDs.length).toBeGreaterThanOrEqual(1);
    for (const appID of appIDs) {
      expect(appID).toMatch(APPLE_BUNDLE_ID_PATTERN);
      aasaAppIdSet.add(appID);
    }

    // `components: []` is the intentional empty-claim signal — Apple
    // validators treat the absence of any pattern as "no Universal
    // Links claimed yet" (informational, not warning). When auth
    // routes ship, claims land here.
    expect(Array.isArray(detail.components)).toBe(true);
    // Negative-assert empty today so a premature path claim — added
    // without the mobile-team coordination gate in the deeplink-
    // manifests runbook — fails CI. Remove or relax this assertion
    // when the first real claim ships through the gate.
    expect((detail.components as unknown[]).length).toBe(0);
  }

  // Cross-file parity: the count of Android assetlinks statements must
  // match the count of iOS AASA appIDs. A coordination drift (e.g.,
  // mobile adds a new iOS variant but forgets the Android counterpart)
  // would otherwise pass both per-file tests silently.
  const assetlinksResponse = await request.get('/.well-known/assetlinks.json');
  const assetlinksStatements = (await assetlinksResponse.json()) as readonly unknown[];
  expect(assetlinksStatements.length).toBe(aasaAppIdSet.size);
});

test('@smoke assetlinks.json matches Digital Asset Links schema + valid SHA256 fingerprints', async ({
  request,
}) => {
  const response = await request.get('/.well-known/assetlinks.json');
  const statements = (await response.json()) as readonly {
    relation?: readonly string[];
    target?: { namespace?: string; package_name?: string; sha256_cert_fingerprints?: string[] };
  }[];

  expect(Array.isArray(statements)).toBe(true);
  expect(statements.length).toBeGreaterThanOrEqual(1);

  for (const statement of statements) {
    expect(Array.isArray(statement.relation)).toBe(true);
    expect(statement.relation).toContain('delegate_permission/common.handle_all_urls');

    const target = statement.target;
    expect(target).not.toBeNull();
    expect(target).toBeDefined();
    expect(target?.namespace).toBe('android_app');
    expect(target?.package_name ?? '').toMatch(ANDROID_PACKAGE_PATTERN);

    const fingerprints = target?.sha256_cert_fingerprints ?? [];
    expect(fingerprints.length).toBeGreaterThanOrEqual(1);
    for (const fp of fingerprints) {
      expect(fp).toMatch(SHA256_FINGERPRINT_PATTERN);
    }
  }
});
