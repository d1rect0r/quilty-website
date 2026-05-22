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
  // `webcredentials` (Shared Web Credentials) is shipped pre-emptively
  // as passkey-readiness — iOS Safari + Chrome credential autofill
  // association lights up the moment the mobile team wires the
  // matching `webcredentials:my-quilty.com` entitlement. Until then
  // the block parses cleanly under `swcd` with zero behavior change.
  // The apps array must list every iOS bundle variant.
  const webcredentials = aasa['webcredentials'];
  expect(webcredentials).not.toBeNull();
  expect(typeof webcredentials).toBe('object');
  const webcredentialsRecord = webcredentials as Record<string, unknown>;
  // Narrow from `unknown` before casting — under
  // noUncheckedIndexedAccess + exactOptionalPropertyTypes, the direct
  // `as readonly unknown[]` cast silently accepts a missing key
  // (undefined) and pushes the failure to the runtime arrayContaining
  // check. The explicit guard fails as a test, not as an exception.
  const rawApps = webcredentialsRecord['apps'];
  expect(Array.isArray(rawApps)).toBe(true);
  const webcredentialApps = rawApps as readonly unknown[];
  expect(webcredentialApps.length).toBeGreaterThanOrEqual(1);
  for (const appID of webcredentialApps) {
    expect(typeof appID).toBe('string');
    expect(appID).toMatch(APPLE_BUNDLE_ID_PATTERN);
  }

  const applinks = aasa['applinks'];
  expect(applinks).not.toBeNull();
  expect(typeof applinks).toBe('object');
  const applinksRecord = applinks as Record<string, unknown>;
  // Apple's modern AASA schema (iOS 13+) drops the `applinks.apps`
  // key entirely. Older Apple samples + Branch.io's validator flag
  // its presence as a legacy-schema smell. The Universal Links
  // `apps:` placeholder is NOT the same as the `webcredentials.apps`
  // array — the latter is the modern shape, the former is dead.
  expect(applinksRecord['apps']).toBeUndefined();

  // Narrow `details` from `unknown` with a runtime guard before the
  // structural cast — same pattern as the gpc-json + webcredentials
  // specs in this batch (the direct-cast form silently accepts an
  // absent `details` key and pushes failures to runtime `.length`).
  const rawDetails = applinksRecord['details'];
  expect(Array.isArray(rawDetails)).toBe(true);
  const details = rawDetails as readonly {
    appIDs?: unknown;
    components?: unknown;
    paths?: unknown;
  }[];
  expect(details.length).toBeGreaterThanOrEqual(1);

  const aasaAppIdSet = new Set<string>();
  for (const detail of details) {
    // Legacy `paths` must not coexist with modern `components` — same
    // information twice creates a stale-config smell.
    expect(detail.paths).toBeUndefined();

    // Same narrowing pattern applied to detail.appIDs.
    const rawAppIDs = detail.appIDs;
    expect(Array.isArray(rawAppIDs)).toBe(true);
    const appIDs = rawAppIDs as readonly string[];
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

  // Passkey-readiness parity: every iOS bundle in the applinks claim
  // must also appear in the webcredentials apps array (and vice
  // versa). A mismatch would leave one variant without credential
  // autofill association once the mobile entitlement lights up.
  const webcredentialAppSet = new Set<string>(
    webcredentialApps.filter((a): a is string => typeof a === 'string'),
  );
  expect(webcredentialAppSet).toEqual(aasaAppIdSet);

  // Cross-file parity: the count of Android assetlinks statements
  // must match the count of iOS bundle variants. Use the
  // webcredentialAppSet (which is set-equal to aasaAppIdSet by the
  // line above) so a webcredentials-only edit that bypasses applinks
  // is still caught — without the set-equality check this comparison
  // would be vacuous against the Android count.
  const assetlinksResponse = await request.get('/.well-known/assetlinks.json');
  const assetlinksStatements = (await assetlinksResponse.json()) as readonly unknown[];
  expect(assetlinksStatements.length).toBe(webcredentialAppSet.size);
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
    // Passkey-readiness: `delegate_permission/common.get_login_creds`
    // is the Android equivalent of iOS's `webcredentials` block.
    // Shipping it pre-emptively means Chrome Credential Manager
    // association lights up the moment the mobile Passkey-association
    // library is wired in the Android app.
    expect(statement.relation).toContain('delegate_permission/common.get_login_creds');

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
