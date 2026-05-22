# Mobile deeplink manifests runbook

> **Owned files:** `apps/web/public/.well-known/apple-app-site-association`, `apps/web/public/.well-known/assetlinks.json`
> **Audience:** web platform + mobile platform; changes require mobile-team sign-off
> **Architectural reference:** ADR-0008 (modular monolith) — deeplink manifests are website-owned static assets; the mobile app is the consumer
> **Spec references:** Apple AASA (https://developer.apple.com/documentation/xcode/supporting-associated-domains), Google Digital Asset Links (https://developers.google.com/digital-asset-links)

## Scope

Apple Universal Links + Android App Links bind specific HTTPS URLs on `my-quilty.com` to the installed mobile apps. Misconfigured manifests do not break the website — they break the mobile install + open flow silently. iOS's `swcd` daemon and Android's `Verifier` service fetch these files on app install + on every periodic re-verification cycle; broken claims trigger a `verifiedLinks` state of `notVerified` on the device that can persist for the lifetime of the app install.

This runbook covers:

- Canonical AASA + assetlinks.json shapes the website ships today
- Pre-deploy checklist mobile must sign off on before any manifest change ships
- Per-variant SHA256 + bundle-ID inventory
- Rollback procedure if a manifest change breaks production app opens

## Status legend

- **CLAIMED** — pattern is live; the OS verifier has fetched + cached the claim
- **RESERVED** — pattern intentionally absent today; will land at the named milestone
- **DROPPED** — pattern removed from a previous shipped manifest; documented to prevent re-introduction

## Today's manifest shapes

### Apple Universal Links (`apple-app-site-association`)

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appIDs": [
          "7XGU6BN3K3.app.quilty.myquilty",
          "7XGU6BN3K3.app.quilty.myquilty.staging",
          "7XGU6BN3K3.app.quilty.myquilty.dev"
        ],
        "components": []
      }
    ]
  },
  "webcredentials": {
    "apps": [
      "7XGU6BN3K3.app.quilty.myquilty",
      "7XGU6BN3K3.app.quilty.myquilty.staging",
      "7XGU6BN3K3.app.quilty.myquilty.dev"
    ]
  }
}
```

`components: []` is the **intentional empty-claim signal** — Apple validators treat the absence of any pattern as "no Universal Links claimed yet" (informational, not warning). When auth-related routes ship on the website, entries land in this array; until then the website does not open the mobile app.

**Why no `paths` key:** the legacy `applinks.details[].paths` form is Apple-deprecated since iOS 13. iOS 13+ `swcd` reads only `components`. Shipping both forms together (which the prior manifest did) leaves stale paths in the manifest that AASA validators flag as warnings.

**`webcredentials` block (passkey-readiness):** Shared Web Credentials + Passkey/WebAuthn credential autofill association is consumed only when the iOS app declares the matching entitlement (`com.apple.developer.associated-domains` with `webcredentials:my-quilty.com`). The block ships pre-emptively so iOS Safari + Chrome credential autofill association lights up the moment the mobile team wires the matching entitlement — there is zero behavior change on devices without the entitlement (`swcd` parses the block cleanly and emits no warning). Lists all 3 iOS bundle variants in lockstep with `applinks.details[].appIDs`; the cross-file parity check in `wellknown.spec.ts` fails CI on drift between the two arrays. **Mobile-team coordination dependency:** the iOS entitlements file must declare `webcredentials:my-quilty.com` BEFORE any real passkey UX ships in the mobile build; until then the block is dormant.

### Android App Links (`assetlinks.json`)

3 Digital Asset Links statements — one per Android variant (`production`, `staging`, `dev`) — each delegating BOTH `delegate_permission/common.handle_all_urls` (App Links — deep-link opening) AND `delegate_permission/common.get_login_creds` (Passkey-readiness — Android's equivalent of iOS Shared Web Credentials; Chrome Credential Manager association). The `get_login_creds` relation ships pre-emptively for the same reason as iOS `webcredentials`: zero behavior change on devices until the mobile Passkey-association library is wired, then credential autofill lights up automatically. All 3 variants currently share a **single SHA256 fingerprint**: `50:0C:AE:2E:D2:E1:18:0F:F5:6F:EC:6E:2D:99:CB:94:C6:E9:71:5F:25:28:15:1A:96:7B:86:DC:FD:58:71:19`.

The shared-fingerprint posture means a single signing-key compromise rotates 3 variants in lockstep. The mobile team has not confirmed whether they intend to migrate to distinct keystores per variant. Until they confirm, the shared posture is the documented state — DO NOT change `assetlinks.json` without explicit mobile sign-off on the new fingerprint list.

> **Pre-launch gate (Play App Signing key confirmation):** Google Play has required Play App Signing for new apps since August 2021. When that enrollment is active, `assetlinks.json` must list the **app signing key** SHA256 fingerprint (Play Console → Setup → App Signing → "App signing key certificate"), NOT the upload key. The currently committed fingerprint has been mirrored from mobile but has not been independently verified against Play Console; this verification is a one-time pre-launch gate item that blocks public Android distribution. If the fingerprint listed here is actually the upload key, App Links verification will fail silently on every device after Play resigns the APK/AAB.

### Cache headers on `/.well-known/`

`apps/web/next.config.ts` currently serves both manifests with `Cache-Control: public, max-age=300` (5 minutes). This is a deliberate **launch-ramp value** — it gives a tight rollback window during M1-M2 while no real install base exists. The intended steady-state value once the 8-item coordination gate is in routine operation is `public, max-age=86400, stale-while-revalidate=3600` (24h + 1h SWR), promoted in a single config change pre-public-launch. Apple's AASA CDN re-fetches from origin on its own schedule (~24-72h for stable production content); Android Verifier re-fetches on app install + periodic re-verification (~30 days). At production install scale the 5-minute TTL drives most Android re-verification fetches to origin — fine at zero traffic, costly at scale.

## Per-variant inventory

| Platform | Variant    | Identifier                               | Fingerprint (SHA256)                                                                              |
| -------- | ---------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| iOS      | production | `7XGU6BN3K3.app.quilty.myquilty`         | n/a (Apple uses Team ID, not key fingerprint)                                                     |
| iOS      | staging    | `7XGU6BN3K3.app.quilty.myquilty.staging` | n/a                                                                                               |
| iOS      | dev        | `7XGU6BN3K3.app.quilty.myquilty.dev`     | n/a                                                                                               |
| Android  | production | `app.quilty.myquilty`                    | `50:0C:AE:2E:D2:E1:18:0F:F5:6F:EC:6E:2D:99:CB:94:C6:E9:71:5F:25:28:15:1A:96:7B:86:DC:FD:58:71:19` |
| Android  | staging    | `app.quilty.myquilty.staging`            | `50:0C:AE:2E:D2:E1:18:0F:F5:6F:EC:6E:2D:99:CB:94:C6:E9:71:5F:25:28:15:1A:96:7B:86:DC:FD:58:71:19` |
| Android  | dev        | `app.quilty.myquilty.dev`                | `50:0C:AE:2E:D2:E1:18:0F:F5:6F:EC:6E:2D:99:CB:94:C6:E9:71:5F:25:28:15:1A:96:7B:86:DC:FD:58:71:19` |

## Pre-deploy mobile-team sign-off checklist

Before any change to `apple-app-site-association` or `assetlinks.json` ships, the mobile team must confirm the following 8 items in writing (Slack thread + linked PR comment is sufficient):

1. **iOS Team ID** — `7XGU6BN3K3` matches the Apple Developer Program team that signs the production iOS build. Confirm via Xcode → Signing & Capabilities → Team picker.
2. **iOS bundle variants** — production / staging / dev bundle identifiers in the deploying AASA exactly match the bundle IDs configured in the 3 Xcode build schemes. Mismatch (even by case) causes `swcd` to fail verification silently.
3. **Android package variants** — production / staging / dev package names in `assetlinks.json` match `applicationId` (NOT `applicationIdSuffix`) in each Gradle build variant. The `.staging` + `.dev` suffix in the package names is intentional and mirrors the iOS variant.
4. **Android SHA256 strategy** — if the change moves from shared-fingerprint to distinct-per-variant, the new fingerprints are produced via `keytool -list -v -keystore <production.keystore>` and verified to match the keystore Play App Signing actually signs builds with (NOT the upload key — App Links uses the signing key after Play resigns). **Passkey-readiness amplifies this:** the `delegate_permission/common.get_login_creds` relation (Chrome Credential Manager association) shares the same fingerprint as App Links — an upload-key-vs-signing-key mismatch silently breaks credential autofill on Android alongside App Links verification. Before mobile wires the Passkey-association library, the Play App Signing key fingerprint MUST be independently confirmed against Play Console → Setup → App Signing → "App signing key certificate".
5. **iOS entitlements** — the Xcode entitlements file declares `associated-domains` with `applinks:my-quilty.com` (apex). If `webcredentials` is being re-added, the entitlement also declares `webcredentials:my-quilty.com`.
6. **Android intent filters** — `AndroidManifest.xml` declares `<intent-filter android:autoVerify="true">` with `<data android:scheme="https" android:host="my-quilty.com" />`. Without `autoVerify="true"`, the Android Verifier never fetches `assetlinks.json` and links open in a chooser instead of the app.
7. **App handler safety** — every `components` pattern + every `assetlinks.json`-claimed route MUST have a corresponding in-app deep-link handler. An unhandled deep-link crash or "page not found" inside the app post-redirect is a worse UX than no claim at all.
8. **CDN cache flush** — after deploying the change, mobile confirms iOS + Android verifier services have refreshed by checking the Apple AASA cache CDN (`https://app-site-association.cdn-apple.com/a/v1/my-quilty.com`) + Google Digital Asset Links API (`https://digitalassetlinks.googleapis.com/v1/statements:list?...`) return the new content. Apple cache TTL is ~60s; Google's verifier refresh on device requires app reinstall in some scenarios.

## Activation triggers

| When                                                              | Action                                                                                                                                                                                                                    |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Website ships an auth-related route the mobile app should own     | Add a single entry to `applinks.details[].components` + the corresponding Android `path_pattern` intent filter. Run the 8-item checklist.                                                                                 |
| Mobile team confirms Shared Web Credentials / Passkey entitlement | iOS entitlements file declares `webcredentials:my-quilty.com`; Android Passkey-association library wired. The website-side blocks already ship and become live automatically — no manifest change required at activation. |
| Mobile team migrates to distinct per-variant keystores            | Update each variant's `sha256_cert_fingerprints` array in `assetlinks.json`. Each variant becomes a distinct rotation surface.                                                                                            |
| App Clips entitlement lands                                       | Add `appclips` block with the App Clip Bundle IDs.                                                                                                                                                                        |
| Mobile team rotates a signing key                                 | The displaced variant block in `assetlinks.json` must list BOTH old + new fingerprints during the rollover (production rollover: 7-14 days).                                                                              |

## Rollback procedure

If a manifest change breaks production app opens (symptoms: users report "deep link opened in Safari/Chrome instead of the app" within 24h of a manifest deploy):

1. `git revert <commit-sha>` to restore the previous manifest contents
2. Deploy via the standard website-deploy pipeline
3. Apple AASA CDN cache TTL is ~60s — production iOS devices re-verify on the next app launch
4. Android requires a device-side re-verification — most users see correction within 24-48h via the periodic `Verifier` service; affected users can manually force re-verification via Settings → Apps → Quilty → Open by default → Add link
5. Post-incident: open a ticket against `app.quilty.myquilty` to confirm the entitlement + intent filter state the mobile team expected matches the manifest state the website intended to ship

## Validation tooling

- **Apple Branch.io AASA validator** — `https://branch.io/resources/aasa-validator/` (paste preview deploy URL; expect "Valid AASA file" + "0 path claims" informational)
- **Google Digital Asset Links validator** — `https://developers.google.com/digital-asset-links/tools/generator` (verifies host + package + fingerprint binding)
- **Local Playwright smoke** — `pnpm --filter web test:e2e --grep "@smoke wellknown"` covers MIME, schema, bundle-ID format, SHA256 format, intentional-empty-components signal, no-legacy-keys

## What this document is NOT

It is not a substitute for the mobile-team-owned source-of-truth bundle/package/keystore registry. The values in the inventory table are mirrored from mobile + verified at every change — if they ever drift, the mobile registry wins and this runbook updates to match.
