# Round 6 Foundation Audit — Track 1, Agent B: Mobile Stack Recon

> **Scope:** Read-only inventory of `/Users/d1rect0r_interneta/AppBuilding/quilty` (Flutter mobile app) — map every SDK, service, identifier, and convention that constrains the website foundation.
> **Date:** 2026-05-19
> **Status:** Read-only audit. No mobile-repo files modified.

---

## 1. Executive summary

Mobile is materially _out of phase_ with several locked website decisions. Five misalignments dominate the rest of the audit:

1. **Wrong domain.** Mobile's production universal-link domain, public-facing URLs (privacy/terms/support), API host, and live AASA/assetlinks files all anchor on `my-quilty.app` — not the website's locked public domain `my-quilty.com` (D45). The mobile repo even ships an in-tree Cloudflare Pages site at `quilty-website/` that already owns `my-quilty.app`'s AASA contract.
2. **Wrong auth backend.** Mobile is currently on **Supabase** for email/OTP/password-reset, with Google+Apple OAuth flowing through a Supabase Edge Function (`validate-oauth-token`). Cognito is referenced everywhere only as the _Phase 3 swap_ (planned, not shipped). The website's D6/D7/D9/D11/D51-D55 architecture assumes the Cognito migration has already happened on mobile — it has not.
3. **Wrong analytics stack.** Mobile ships **PostHog Cloud EU + TelemetryDeck** (with PostHog **Session Replay on, mask-all-text/images**) plus Sentry. The website's 2026-05-19 pivot (D42b reverted) locks **Amplitude all-in for web + mobile**. Mobile has an _ADR draft_ for Amplitude but the code is still PostHog. No Amplitude SDK is present anywhere in `lib/`.
4. **Replay vendor conflict.** Mobile already runs PostHog Session Replay in production-bound code. Website D68 explicitly rejects PostHog replay (and Amplitude Session Replay) for clinical surfaces. The mobile choice was made before the Round-5 attribute-leak / HIPAA analysis that produced D68.
5. **Feature flags = PostHog flags.** Mobile uses PostHog flags as the runtime gate. Website D43 (after the 2026-05-19 revert) is Amplitude Experiment at trigger. So both surfaces will need to swap flag vendors during the Amplitude consolidation.

The Apple Team ID + bundle (`7XGU6BN3K3.app.quilty.myquilty`) and the Android package (`app.quilty.myquilty`) match CLAUDE.md exactly. Locales (`en`, `es`, `ru`) extend beyond the website's English-only launch posture (D14/D25). Mobile is **OneSignal** for push and **RevenueCat** for IAP with a `subscription_enums.dart` that already includes a `web/Stripe` platform tier — so the website's M7 RevenueCat-Web + Stripe + cross-platform entitlement reconciliation has a clean enum to map into.

---

## 2. Inventory (per focus area)

### 2.1 SDK + service integrations

Source: `/Users/d1rect0r_interneta/AppBuilding/quilty/pubspec.yaml`

| Category                   | Package(s)                                                                                         | Version | Notes                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------- | -------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Error tracking             | `sentry_flutter`, `sentry_dio`, `sentry_dart_plugin` (devdep)                                      | ^9.18.0 | Sentry org `quilty-01`, project `flutter`; uploads debug symbols + source maps. `tracesSampleRate` 1.0 debug / 0.2 prod; `profilesSampleRate` 0.1 prod; `enableUserInteractionTracing: true`; `enableAutoPerformanceTracing: true`; `sendDefaultPii: false`. Has a `beforeSend` PHI scrubber (`lib/src/core/logging/sentry_phi_scrubber.dart`) — fail-closed (drops event on scrubber error, never sends unscrubbed). |
| Analytics primary          | `posthog_flutter`                                                                                  | ^5.23.2 | **PostHog Cloud EU** (`https://eu.i.posthog.com`). `flushAt: 20`, `maxQueueSize: 1000`, `flushInterval: 30s`. `personProfiles: identifiedOnly`. `sessionReplay: true` with `maskAllTexts`, `maskAllImages`, `throttleDelay: 1000ms`. `sendFeatureFlagEvents: false`. `preloadFeatureFlags: true`.                                                                                                                     |
| Analytics secondary        | `telemetrydecksdk`                                                                                 | ^3.0.0  | **TelemetryDeck** — privacy-safe, **always-on, no consent required** (double-hashed user IDs, anonymized). Used for baseline metrics from 100% of users including consent-decliners.                                                                                                                                                                                                                                  |
| Push notifications         | `onesignal_flutter`                                                                                | ^5.5.1  | **OneSignal**. `OneSignal.consentRequired(true)` set before `initialize()` (GDPR-correct). `consentGiven` toggled with privacy consent. Deep-link routing on notification tap.                                                                                                                                                                                                                                        |
| Push transport             | `firebase_messaging`                                                                               | ^16.2.0 | **Firebase Cloud Messaging** still the actual transport for Android + the background-sync poke channel (silent FCM data-messages drive sync). `BGTaskSchedulerPermittedIdentifiers` registers `app.quilty.sync` for iOS BGProcessingTask.                                                                                                                                                                             |
| App Check                  | `firebase_app_check`                                                                               | ^0.4.3  | Active.                                                                                                                                                                                                                                                                                                                                                                                                               |
| IAP                        | `purchases_flutter` (RevenueCat)                                                                   | ^10.0.1 | `Purchases.configure(PurchasesConfiguration(Env.revenueCatApiKey))`. Non-fatal init (app works without subs). Subscription tier/status/platform enums **already include `web/Stripe`** as a target platform — see §2.5.                                                                                                                                                                                               |
| Auth (social)              | `sign_in_with_apple` ^7.0.1, `google_sign_in` ^7.2.0                                               | n/a     | Native social sign-in flows: Google iOS client ID `144327334263-8gaiknfcghlhjin13qpttmf4smvda7qi.apps.googleusercontent.com`, Android client ID `144327334263-3nf8o01dl328u10mqd6b589k2uhjftcj.apps.googleusercontent.com`. Apple entitlement `com.apple.developer.applesignin: Default`. Both tokens currently posted to Supabase Edge Function `validate-oauth-token`.                                              |
| Local auth                 | `local_auth` ^3.0.0                                                                                | n/a     | Face ID / Touch ID / fingerprint.                                                                                                                                                                                                                                                                                                                                                                                     |
| Device integrity           | `flutter_jailbreak_detection`, `safe_device` (Play Integrity + App Attest)                         | n/a     | Used at startup.                                                                                                                                                                                                                                                                                                                                                                                                      |
| Secure storage             | `flutter_secure_storage` ^10.0.0                                                                   | n/a     | iOS Keychain / Android EncryptedSharedPreferences. Stores `access_token`, `refresh_token`, `user_id`, `expires_at`.                                                                                                                                                                                                                                                                                                   |
| DB                         | `drift` ^2.32.1 + `sqlite3mc` (SQLite3MultipleCiphers, ChaCha20-Poly1305 AEAD)                     | n/a     | Encrypted local DB.                                                                                                                                                                                                                                                                                                                                                                                                   |
| Consent CMP                | `usercentrics_sdk` ^2.26.2                                                                         | n/a     | **Usercentrics** with geolocation routing: EU → GDPR ruleset, US → MSPL. Template IDs catalogued per processor: PostHog `uRoG9JxhEUtI4V`, Sentry `rH1vNPCFR`, SendGrid `JH-hXkWhk`, Cloudflare Turnstile `xQ7R_MtouldLmR`, OneSignal `_SUFIQuxf`, Google Sign-in `XJGT8f-58`, Apple Sign-in `cBl03wBXG`. _Auth-provider templates explicitly TODO-marked as awaiting the AWS/Cognito rebuild sprint._                 |
| Logging                    | `talker` family ^5.1.16                                                                            | n/a     | Structured client logging.                                                                                                                                                                                                                                                                                                                                                                                            |
| WebView                    | `webview_flutter` ^4.10.0                                                                          | n/a     | **Used only for Cloudflare Turnstile CAPTCHA** in the password-flow. Tightly URL-validated; not used for in-app marketing surfaces.                                                                                                                                                                                                                                                                                   |
| HTTP                       | `dio` ^5.9.1 + `dio_smart_retry` + `dio_cache_interceptor` + Amazon CA cert bundle for TLS pinning | n/a     | TLS-pinned against Amazon Trust Services — already AWS-flavoured even pre-Cognito.                                                                                                                                                                                                                                                                                                                                    |
| Background work            | `workmanager` ^0.9.0+3, `flutter_local_notifications` ^21.0.0                                      | n/a     | Background sync + scheduled notifications.                                                                                                                                                                                                                                                                                                                                                                            |
| Health Connect / HealthKit | `health` ^13.3.0                                                                                   | n/a     | Hardware health-data integration. Constrains the dependency tree (caps `device_info_plus`, `share_plus`, `package_info_plus`).                                                                                                                                                                                                                                                                                        |
| Bluetooth + NFC            | `flutter_blue_plus`, `nfc_manager`                                                                 | n/a     | Hardware pairing path.                                                                                                                                                                                                                                                                                                                                                                                                |
| Consent / privacy posture  | n/a                                                                                                | n/a     | `PrivacyService` central toggle for analytics + crash-reports. `_globalPrivacyService` referenced in Sentry `beforeSend` and PostHog `setAnalyticsCollectionEnabled`.                                                                                                                                                                                                                                                 |
| Internationalization       | `slang` + `slang_flutter` ^4.12.0 + `flutter_localizations`                                        | n/a     | NOT next-intl. Different translation backend than D25.                                                                                                                                                                                                                                                                                                                                                                |
| Code metrics               | `dcm` (Dart Code Metrics)                                                                          | n/a     | Pro license referenced.                                                                                                                                                                                                                                                                                                                                                                                               |
| Removed                    | `firebase_analytics`, `firebase_performance`, `firebase_crashlytics`                               | n/a     | All three explicitly removed (`pubspec.yaml` comments). Sentry replaced Crashlytics + Performance; PostHog replaced Analytics + Remote Config.                                                                                                                                                                                                                                                                        |

**Notable absences:** No Amplitude SDK. No LaunchDarkly / Statsig / GrowthBook. No Mixpanel. No Cognito SDK / `amplify_auth_cognito`. No `aws_sdk_*`. No Plain / Intercom / Zendesk. No image/media SDK (Cloudinary/Mux). No maps. No Stripe (which is consistent — Stripe lives on web for the cross-platform pay-flow per `SubscriptionPlatform.web`).

### 2.2 Auth implementation

Source: `lib/src/features/auth/README.md`, `lib/src/core/auth/`, `lib/src/features/auth/`, `lib/src/core/security/consent/consent_constants.dart`.

- **Auth backend: Supabase** (NOT Cognito).
  - Email/password → OTP → verify → authenticated, via Edge Functions `signup-with-session`, `verify-signup-otp`.
  - Password reset = Supabase Auth native.
  - Google / Apple OAuth → token validation via Edge Function `validate-oauth-token`.
  - `core/auth/token_storage/auth_token_service.dart` stores `access_token`, `refresh_token`, `user_id`, `expires_at` in `FlutterSecureStorage` (Keychain / EncryptedSharedPreferences).
- **Cognito references** all describe a **planned future state**: "Phase 3 swap", "the auth backend [removed]; Phase 3 swaps in `CognitoTokenProvider`", consent template TODO `// TODO(auth-v2): legacy auth-processor consent templates ... Rebuild registers the new AWS/Cognito-backed processor's Usercentrics templates when the auth rebuild sprint lands.` Phase 3 has not happened.
- **Session model:** `SessionService` (`@lazySingleton`) just holds a `_currentUserId: String?` in memory. There is no opaque session ID, no DynamoDB session store, no `quilty_sid`. The whole concept of D51 (BFF opaque session ID + DynamoDB) is web-only — mobile uses Supabase JWTs directly via `Authorization: Bearer …`.
- **Sign-in surfaces** route through `OAuthCubit.signInWithGoogle()` / `signInWithApple()`, talking to `SocialAuthService` (`core/auth/social_auth_service.dart`) before submitting the resulting token to Supabase.
- **Magic-link / token-hash handling** — `lib/src/core/auth/magic_link_handler.dart` (sets a Supabase session from `#access_token=…&type=recovery` fragments) and `token_hash_handler.dart` (verifies `?token_hash=xxx&type=signup` against `verifyOTPWithTokenHash`). Both processed by `DeepLinkGuard` in the router.
- **Backup codes service** is in-app and was renamed from a legacy Cognito-shaped helper.

### 2.3 Deeplink configuration

Source: `ios/Runner/Runner.entitlements`, `ios/Runner/Info.plist`, `android/app/src/main/AndroidManifest.xml`, `android/app/build.gradle.kts`, `lib/src/core/routing/router_config.dart`, mobile-repo `quilty-website/.well-known/`.

- **iOS Associated Domains:** `applinks:my-quilty.app` and `webcredentials:my-quilty.app` (entitlement). **Note: `my-quilty.app`, NOT `my-quilty.com`.**
- **Keychain access group:** `$(AppIdentifierPrefix)app.quilty.myquilty` — matches the bundle `app.quilty.myquilty` and Apple Team ID `7XGU6BN3K3`.
- **iOS URL schemes registered:**
  - `$(APP_URL_SCHEME)` — flavor-driven: `quilty` (prod), `quilty-staging`, `quilty-dev`.
  - `com.googleusercontent.apps.144327334263-8gaiknfcghlhjin13qpttmf4smvda7qi` — Google OAuth reversed client ID.
  - `quilty-debug` — debug-only smoke-test scheme (release builds no-op the handler).
- **`FlutterDeepLinkingEnabled: true`** is set, so iOS routes deeplinks through Flutter's mechanism.
- **Android intent filters (per Gradle flavour, `manifestPlaceholders["deepLinkScheme"]`):**
  - Legacy scheme `com.quilty://login-callback/` (locked-down: only the exact path `/`, no subpaths — prevents scheme hijacking).
  - Flavor scheme (`quilty` / `quilty-staging` / `quilty-dev`) with hosts `login-callback`, `signup-callback`, `reset-callback`, `link-callback`, `journey`, `stats`, `settings`, `puff`, `plan`, `achievements`, `devices`, `profile`.
  - **`autoVerify="true"` Android App Links on `https://my-quilty.app/` (all paths).**
- **Mobile-repo `quilty-website/.well-known/apple-app-site-association`** (deployed via `deploy-website.yml` to Cloudflare Pages):
  - App IDs: `7XGU6BN3K3.app.quilty.myquilty[.staging|.dev]`.
  - Live paths claimed by the mobile binary: `/auth/*`, `/journey`, `/stats`, `/settings`, `/settings/*`, `/profile`, `/puff`, `/puff-log`, `/plan`, `/achievements`, `/devices`, `/notifications`, `/share/*`.
  - `webcredentials` registered for the three bundles + appclips array reserved (empty).
- **Mobile-repo `quilty-website/.well-known/assetlinks.json`:**
  - Three Android packages: `app.quilty.myquilty`, `app.quilty.myquilty.dev`, `app.quilty.myquilty.staging`.
  - Single shared SHA256 fingerprint `50:0C:AE:2E:D2:E1:18:0F:F5:6F:EC:6E:2D:99:CB:94:C6:E9:71:5F:25:28:15:1A:96:7B:86:DC:FD:58:71:19`.
  - `delegate_permission/common.handle_all_urls` + `delegate_permission/common.get_login_creds`.
  - One entry declares `"site": "https://my-quilty.app"` — confirming the actively-running domain.
- **iOS Runner-level companion AASA** (in `ios/Runner/` only, not the one served at the domain) lists `app.quilty.myquilty` + paths `/auth/*`, `/reset-password`, `/verify-email`.

### 2.4 Push notification configuration

- **OneSignal** as the developer-facing API. App ID = `Env.onesignalAppId` (env-injected). `OneSignal.consentRequired(true)` gates initialization on user consent state; `consentGiven` is mirrored to `PrivacyService.analyticsEnabled`.
- **FCM** is the underlying Android transport AND the silent-data-message channel for background-sync pokes (`BGTaskSchedulerPermittedIdentifiers: ['app.quilty.sync']`, `UIBackgroundModes: [processing, remote-notification]`).
- **APNS** entitlement: `aps-environment: production`.
- **Firebase project:** `quilty-485207` (`GoogleService-Info.plist`), iOS GCM Sender ID `144327334263`, iOS App ID `1:144327334263:ios:281937fba6de9d34e96972`. **IS_ANALYTICS_ENABLED: false** (Firebase Analytics intentionally off — PostHog replaced it).
- **Click routing:** `OneSignalService` parses click events and navigates to in-app routes (e.g. `/journey`, `/puff`, etc.) — these are the same hosts the Android App Links match against. No browser involvement.

### 2.5 Subscription / IAP

- `purchases_flutter` (RevenueCat) ^10.0.1, configured non-fatally at bootstrap.
- `lib/src/core/enums/subscription_enums.dart` defines:
  - `SubscriptionTier`: `free`, `premium`.
  - `SubscriptionStatus`: `active`, `cancelled`, `expired`, `trial`.
  - `SubscriptionPlatform`: `ios`, `android`, **`web`** (commented "Web / Stripe").
- A Drift table `subscriptions` exists with DAO scaffolding — mobile already persists subscription state locally and is shaped to receive cross-platform entitlements (incl. web/Stripe purchases).
- No RevenueCat entitlement IDs / product IDs surfaced in the Dart source — values flow from `.env` (`REVENUECAT_API_KEY` only).
- Subscription page (`settings/presentation/pages/subscription_page.dart`) exists.

### 2.6 Analytics event taxonomy

Source: `lib/src/core/analytics/analytics_events.dart` + `lib/src/core/analytics/events/*.dart` + `lib/src/core/analytics/analytics_service.dart`.

- **Naming convention: strict `snake_case`** (e.g. `signup_started`, `puff_logged`, `device_connected`, `analytics_consent_changed`, `route_not_found`). Hard rule per the docstring: "lowercase with underscores, starts with a letter".
- ~150+ event names defined as `static const` on a sealed `AnalyticsEvents` final class. Categories: auth funnel (signup/login/logout), puff logging, plans, day-off, mode switch, day cycle, journey/milestones, devices, settings, 2FA, engagement (`app_open`, `app_background`, `session_start` _deprecated — PostHog manages sessions natively via `$session_id`_, `session_end`, `app_foregrounded`), errors, feature flags, timing, funnels, ATT (App Tracking Transparency), compliance (`terms_accepted`, `privacy_policy_accepted`, `marketing_consent_changed`, `analytics_consent_changed`, `crash_reports_consent_changed`), routing & deep links, version/maintenance, database, health check, startup funnel.
- **Param keys: `snake_case`** as well — `method`, `source`, `plan_type`, `error_type`, `flag_name`, `enabled`, `session_id`, `app_version`, `platform`, `environment`, `locale`, `path`, `is_cold_start`, `total_duration_ms`, etc.
- **Super properties / global context:** `app_version`, `app_build`, `platform` (`ios` / `android`), `environment`, `locale`, `session_id`.
- **Person identity:** PostHog `personProfiles: identifiedOnly`. `_currentUserId` tracked client-side. **Identity is the Supabase user UUID today** — not `cognito_sub`. Pending user properties queue replays into PostHog on next `setUserId`.
- **PII deny-list at the client:** `_piiDenyKeys` blocks `email`, `email_address`, `user_email`, `password`, `token`, `secret`, `api_key`, `phone`, `phone_number`, `ssn`, `credit_card`, `card_number`. Regex strips email / phone / IPv4 from event payloads even when the key isn't deny-listed. Recursive nested-map scrubbing.
- **Debouncing + rate-limiting** inside the client: `puff_logged` debounced 500ms, global 60-event/10-second sliding window.
- **Circuit breaker** wraps PostHog calls (closed / half-open / open) to avoid CPU/battery waste during outages. Exposes `healthLevel` for observability.
- **Compliance events** are persisted locally in a Drift `compliance_events` table by the same service (DAO injected) — gives you a local audit log of consent changes independent of the analytics destination.

### 2.7 PHI surface in mobile

- The clinical/PHI-implying inputs include: puff logging with tier-2 feelings + notes (`tier2_feeling_selected`, `tier2_note_saved`), slip / craving CT logging, plan calibration, return survey, mood/feeling tags. Plus Bluetooth-connected hardware puff devices and optional location tagging of puffs.
- **PostHog Session Replay is ON** (`sessionReplay: true`) with `maskAllTexts: true`, `maskAllImages: true`. Requires `PostHogWidget` wrapper in the widget tree.
- **Sentry PHI scrubber** (`lib/src/core/logging/sentry_phi_scrubber.dart`) is fail-closed (drops event on scrubber error) and covers message, exceptions, breadcrumbs, tags, extra, contexts, user, request.
- **Health-data integration via `health: ^13.3.0`** — pulls from Apple HealthKit / Android Health Connect. This is the highest-risk PHI surface and lives entirely in `lib/`.
- **iOS privacy manifest** (`PrivacyInfo.xcprivacy`): `NSPrivacyTracking: false`, `NSPrivacyTrackingDomains: []`, `NSPrivacyCollectedDataTypes: []` (deferring to SDK manifests). Declares required-reason API usage for `UserDefaults`, `FileTimestamp`, `SystemBootTime`, `DiskSpace`.

### 2.8 App identifiers

| Identifier                        | Value                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------- |
| iOS bundle (prod)                 | `app.quilty.myquilty`                                                                             |
| iOS bundle (staging)              | `app.quilty.myquilty.staging`                                                                     |
| iOS bundle (dev)                  | `app.quilty.myquilty.dev`                                                                         |
| Apple Team ID                     | `7XGU6BN3K3`                                                                                      |
| Apple App ID prefix (AASA)        | `7XGU6BN3K3.app.quilty.myquilty[.staging\|.dev]`                                                  |
| Android package (prod)            | `app.quilty.myquilty`                                                                             |
| Android package (staging)         | `app.quilty.myquilty.staging`                                                                     |
| Android package (dev)             | `app.quilty.myquilty.dev`                                                                         |
| Android SHA256 (current keystore) | `50:0C:AE:2E:D2:E1:18:0F:F5:6F:EC:6E:2D:99:CB:94:C6:E9:71:5F:25:28:15:1A:96:7B:86:DC:FD:58:71:19` |
| Firebase project                  | `quilty-485207`                                                                                   |
| Google iOS OAuth client           | `144327334263-8gaiknfcghlhjin13qpttmf4smvda7qi.apps.googleusercontent.com`                        |
| Google Android OAuth client       | `144327334263-3nf8o01dl328u10mqd6b589k2uhjftcj.apps.googleusercontent.com`                        |
| Universal Link domain (active)    | **`my-quilty.app`**                                                                               |
| Custom URL schemes                | `quilty` / `quilty-staging` / `quilty-dev` / `com.quilty` (legacy) / `quilty-debug`               |

**Stale references found in `lib/src/core/config/app_constants.dart`:**

- Line 490: `androidPackageName = 'com.quiltyapp.quilty'` — inconsistent with Gradle's `app.quilty.myquilty` (used elsewhere in the same file on line 521 in the Play Store URL). Looks like dead constant.
- Line 497: `supportEmail = 'support@quiltyapp.com'` — but `operational_config.dart` and feature flags use `support@my-quilty.app`. Two support emails in flight.
- Line 517: `iosAppStoreUrl = 'https://apps.apple.com/app/quilty/id1234567890'` (placeholder).

### 2.9 Native config quirks

- iOS deployment target: **16.0** minimum.
- Android minSdk: **26** (Android 8.0+) — driven by `flutter_local_notifications`. compileSdk via Flutter SDK. Java/Kotlin: **17**.
- Android **R8 + minify + shrinkResources enabled** in release.
- **`network_security_config.xml`**, `backup_rules`, `data_extraction_rules` referenced — custom Android transport security with TLS pinning against bundled Amazon Trust Services root CAs (already AWS-flavoured even on the Supabase auth path because the sync API lives behind AWS API Gateway).
- iOS `Info.plist` permission strings: NFC, Bluetooth (always + peripheral), Face ID, Location (always-and-when-in-use + when-in-use), **NSUserTrackingUsageDescription** (ATT prompt), Photo Library, Camera. `BGTaskSchedulerPermittedIdentifiers: [app.quilty.sync]`, `UIBackgroundModes: [processing, remote-notification]` (no `fetch`).
- Android permissions: INTERNET, ACCESS_NETWORK_STATE, BLUETOOTH (+ admin/connect/scan/neverForLocation), ACCESS_FINE/COARSE_LOCATION, NFC, USE_BIOMETRIC, CAMERA, READ_EXTERNAL_STORAGE/READ_MEDIA_IMAGES, POST_NOTIFICATIONS, VIBRATE, SCHEDULE_EXACT_ALARM.
- Drift native hook bundles `sqlite3mc` (SQLite3MultipleCiphers) — encrypts the local DB with ChaCha20-Poly1305 AEAD. Podfile has a guard that fails the build if legacy SQLCipher pods linger.

### 2.10 Build / deploy pipeline

- **Fastlane** for iOS (`ios/fastlane/`) with App Store Connect API key auth, match-based code signing.
- **Husky** for git hooks (`husky: ^0.1.7`), commitlintrc, gitleaks.
- **FVM** (Flutter Version Management) — `.fvmrc` pins Flutter version (`FLUTTER_VERSION: '3.41.7'` in CI).
- **GitHub Actions workflows** (~30+ in `.github/workflows/`):
  - `build.yml`, `test.yml`, `deploy.yml`, `release.yml`, `release-drafter.yml`.
  - **`deploy-website.yml`** — deploys the in-repo `quilty-website/` to Cloudflare Pages (project `quilty-website`, branch `main`) — this is the AASA host for `my-quilty.app`.
  - `deploy-widgetbook.yml`, `accessibility.yml`, `app-size-check.yml`, `architecture.yml`, `cert_bundle_monitor.yml`, `chaos_nightly.yml`, `dcm.yml`, `dev-flags-check.yml`, `file-size-check.yml`, `lockfile-check.yml`, `navigation-lint.yml`, `pr-governance.yml`, `second-app-canary.yml`, `security.yml`, `sonarcloud.yml`, `subscription-check.yml`, `tracking-plan-check.yml`, `toggle-expiry-check.yml`, `widget-lifecycle-tests.yml`.
- **No EAS / Codemagic / Bitrise** — pure GitHub Actions + Fastlane.

### 2.11 Dependency on web URLs

- **`my-quilty.app/privacy`** and **`my-quilty.app/terms`** hard-coded as defaults in `operational_config.dart` and feature-flag config — these URLs must resolve in production today.
- `support@my-quilty.app` is the support email used by operational config + feature flags (the stray `support@quiltyapp.com` is dead).
- The mobile in-repo Cloudflare site at `quilty-website/` ships four bouncer pages — `auth/callback`, `auth/confirm-deletion`, `auth/reset-password`, `auth/verify-email` — that detect a JWT in the URL hash/query, validate locally, then open the app via universal link. All four hard-link to App Store + Play Store URLs.
- **No in-app WebView pointing at any `my-quilty.*` marketing/help/legal URL.** `webview_flutter` is only used for the Cloudflare Turnstile CAPTCHA in the password flow, with URL-allowlist validation. So marketing/help/legal surfaces are launched via `url_launcher` to an external browser — _not_ embedded.
- `url_launcher` is the path for: support email, store rating fallback, About page links, help/FAQ links, security/privacy settings links, force-update store URLs.

### 2.12 Locale + i18n

- Mobile supports **`en` (default), `es`, `ru`** (`lib/src/core/config/supported_locales.dart`).
- Translation backend: **`slang`** (`^4.12.0`) + `slang_flutter` + `flutter_localizations` — NOT `next-intl`.
- Date/time/currency: `intl: ^0.20.2`, `timezone: ^0.11.0`, `flutter_timezone: ^5.0.2`, `ntp: ^2.0.0`.

### 2.13 Feature flag state

- **PostHog feature flags** are the runtime gate.
- `lib/src/core/feature_flags/posthog_feature_flag_service.dart` exists and references config keys (e.g. `support_email`, `privacy_policy_url`, `terms_of_service_url`). PostHog config has `preloadFeatureFlags: true` and `sendFeatureFlagEvents: false` (the service explicitly suppresses background-refresh noise).
- Toggle-expiry CI check is set up (`toggle-expiry-check.yml`).

### 2.14 Anything unexpected

1. **The mobile repo already ships a Cloudflare Pages site at `my-quilty.app`.** Soft-nuking this is a separate exercise from the website M1 SST scaffold — the AASA on `my-quilty.app` is live and the mobile app's universal links depend on it. Until the website at `my-quilty.com` also serves an AASA covering `app.quilty.myquilty`, switching mobile to claim `my-quilty.com` instead would break universal links.
2. **`SubscriptionPlatform.web` already exists in the mobile enum** — i.e. mobile expects an entitlement that originated from a Stripe purchase on the website to round-trip back through the Rust backend and update the local Drift cache. The web subscription surface (M7) just needs to write this enum value.
3. **TelemetryDeck is mobile-only.** It's a consent-exempt baseline-metrics layer (double-hashed user IDs, anonymized). No equivalent decision exists for the website tier. If "baseline metrics from 100% of users including consent-decliners" is a real product requirement, the website needs to either add TelemetryDeck or accept that pre-consent visitors will be invisible.
4. **Sentry is configured with `enableUserInteractionTracing: true` on mobile.** This captures button-tap names. If a button label includes anything PHI-shaped (e.g. "Save this craving"), it ends up in Sentry breadcrumbs even with `sendDefaultPii: false`. The website's Sentry config should default this off until verified safe.
5. **Maestro + Patrol** are the mobile E2E test stacks (`.maestro/`, `patrol: ^4.5.0`). The mobile repo has a `TestSeamServer` listening on `:8788` in debug for test-time seam handlers — informative for any future web↔mobile E2E coordination but irrelevant to the website foundation.
6. **`mcp_toolkit: ^0.4.0`** — mobile integrates with Claude Code's MCP. Out of website-foundation scope but interesting cultural alignment.

---

## 3. Web-coupling matrix

| Mobile integration                                                                              | Website foundation decision implicated                                                                                    | Coupling                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Universal-link domain = **`my-quilty.app`**                                                     | **D45** (public domain = `my-quilty.com`)                                                                                 | **HARD CONFLICT.** Mobile production AASA is on `.app`, not `.com`. Either (a) keep `.app` as the deeplink host and never serve AASA from `.com`, or (b) at M1 cutover, serve AASA from `.com` for the SAME bundle IDs and migrate mobile's `applinks:` entitlement.                                                                                                                      |
| Apple Team ID + bundle `7XGU6BN3K3.app.quilty.myquilty`                                         | CLAUDE.md NEVER list, future `apps/web/public/.well-known/apple-app-site-association`                                     | If website serves AASA from `my-quilty.com`, it MUST list `7XGU6BN3K3.app.quilty.myquilty[.staging\|.dev]` (three bundles), plus mirror the path list from `quilty-website/.well-known/apple-app-site-association`.                                                                                                                                                                       |
| Android packages + SHA256 `50:0C:AE:2E:…71:19`                                                  | `apps/web/public/.well-known/assetlinks.json` (future)                                                                    | Same — three packages with shared SHA256. Mobile's release keystore is one keystore for all flavors.                                                                                                                                                                                                                                                                                      |
| Auth backend = **Supabase** (Cognito is Phase 3 swap, unshipped)                                | **D6 / D7 / D9 / D11 / D51-D55** (Cognito Managed Login + opaque session ID + EventBridge fan-out)                        | The website's auth architecture is **ahead of mobile.** Either (a) mobile's Phase 3 ships before the website's M6 (real-auth integration), or (b) the website builds Cognito alone and the cross-device EventBridge fan-out (D9/D11) is half-wired until mobile migrates. The Usercentrics consent templates carry a `TODO(auth-v2)` block confirming the auth-rebuild sprint is pending. |
| Supabase-issued user UUIDs as analytics identity                                                | **D11** (`cognito_sub` is the cross-device join key)                                                                      | Until mobile Phase 3 ships, `cognito_sub` isn't the join key — it's the Supabase UUID. Cross-device flows that assume `cognito_sub` will need a translation table during the transition.                                                                                                                                                                                                  |
| Analytics primary = **PostHog Cloud EU**                                                        | **D42b** revised 2026-05-19 → **Amplitude all-in (web + mobile)**                                                         | **HARD CONFLICT.** Mobile is on PostHog. The 2026-05-19 pivot assumed mobile would migrate to Amplitude; mobile has only an ADR draft (`docs/architecture/ADR_ANALYTICS_PLATFORM_MIGRATION.md`) that explicitly **rejected Amplitude as primary** because "no mobile session replay, no built-in feature flags".                                                                          |
| PostHog Session Replay enabled with mask-all-text/images                                        | **D68** (Sentry replay only on web; Amplitude SR rejected; PostHog replay deemed unsafe for clinical surfaces in Round 5) | **HARD CONFLICT.** Mobile has shipped what the website explicitly rejected. Round-5 finding on PostHog HTML-attribute leak/`block` semantics needs to be relayed to the mobile team for review.                                                                                                                                                                                           |
| Feature flags = **PostHog flags** (`getFeatureFlagResult`)                                      | **D43** revised 2026-05-19 → **Amplitude Experiment** at trigger; typed env-var `features.ts` day-one                     | Mobile flag taxonomy + naming + payloads will need to migrate. CI gate `toggle-expiry-check.yml` already exists — port the convention.                                                                                                                                                                                                                                                    |
| Consent CMP = **Usercentrics** with template IDs catalogued                                     | **D35** (server-side `ConsentState` single source of truth; GPC at edge)                                                  | Website does NOT plan to use Usercentrics — it builds its own `ConsentState`. Two consent UIs in flight. The shared concept is "consent state" — surface a stable `analytics_consent` / `crash_reports_consent` / `marketing_consent` schema that both surfaces can read/write to the Rust backend.                                                                                       |
| OneSignal push                                                                                  | (no current web decision)                                                                                                 | Web pre-launch likely has no push. If web push is added (M9+), reuse OneSignal or accept divergence. OneSignal's `templateIdOneSignal` is already in Usercentrics.                                                                                                                                                                                                                        |
| Firebase Messaging + Firebase project `quilty-485207`                                           | (no current web decision)                                                                                                 | Web does not need Firebase. Out of scope.                                                                                                                                                                                                                                                                                                                                                 |
| RevenueCat IAP + `SubscriptionPlatform.web` already defined                                     | **M7** (Stripe + RevenueCat IAP)                                                                                          | **CLEAN HANDOFF.** Mobile is shaped to receive a `web` platform purchase. Website's Stripe surface should call RevenueCat's web SDK (or post to RC's REST API) so the entitlement reaches the user across all three platforms.                                                                                                                                                            |
| Sentry org `quilty-01` / project `flutter`, PHI scrubber pattern                                | **D42a** (Sentry Business tier from day-one) + **D67** (PHI sanitizer + `assertNoPHI`)                                    | **CLEAN ALIGNMENT.** Use the same Sentry org. Port the `sentry_phi_scrubber.dart` fail-closed pattern to the website's `lib/observability/`. Add a second Sentry project (e.g. `quilty-01/web`).                                                                                                                                                                                          |
| `sendDefaultPii: false` everywhere, `enableUserInteractionTracing: true`                        | **D67**                                                                                                                   | Match `sendDefaultPii: false`. Default **OFF** on `enableUserInteractionTracing` for web until evaluated.                                                                                                                                                                                                                                                                                 |
| TLS pinning against Amazon Trust Services                                                       | **D2** (SST → AWS)                                                                                                        | Mobile already trusts your AWS-issued ACM certs by Amazon root, so the API host on `api.my-quilty.app` (or the website's eventual API origin) will need to use ACM certs.                                                                                                                                                                                                                 |
| Locales `en`, `es`, `ru` via `slang`                                                            | **D14 / D25** (`/[locale]/` segment reserved, English-only at launch, **`next-intl`** as engine)                          | **No conflict.** Mobile supports more locales than web at launch. Web's reserved `/[locale]/` segment will accommodate `es` / `ru` later. `slang` ≠ `next-intl`, so the translation files are NOT directly shareable; design for separate translation backends from day one and reconcile only the source-of-truth string IDs / namespacing.                                              |
| Snake_case event names + `app_version` / `platform` / `environment` / `locale` super properties | (no web decision yet)                                                                                                     | **Lock the convention.** Adopt the same `snake_case` event-name convention on web, mirror the same super properties (`platform: 'web'`), and pre-seed the same compliance + consent + routing event names so cross-platform funnels work.                                                                                                                                                 |
| PII deny-list + email/phone/IPv4 regex client-side scrubbing                                    | **D67** (PHI sanitizer)                                                                                                   | **Port verbatim.** `_piiDenyKeys` + `_emailRegex` + `_phoneRegex` + `_ipv4Regex` is a battle-tested set — `lib/observability/phi-sanitizer.ts` should mirror them.                                                                                                                                                                                                                        |
| `health: ^13.3.0` → HealthKit / Health Connect on device                                        | **D31** (zero PHI in website runtime)                                                                                     | **CLEAN BOUNDARY.** Health data never leaves the device → backend pathway. Website never sees it.                                                                                                                                                                                                                                                                                         |
| Mobile-repo Cloudflare Pages site at `quilty-website/`                                          | (no current web decision)                                                                                                 | After website M1 cutover, the mobile-repo Cloudflare site needs a retirement plan. Until then, both surfaces coexist on different domains.                                                                                                                                                                                                                                                |
| In-app email/help/legal URLs use `url_launcher` (external browser)                              | (no current web decision)                                                                                                 | **CLEAN HANDOFF.** Web pages at `/privacy`, `/terms`, `/help`, and `support@…` mailto links will render in the system browser — no WebView/CSP gymnastics needed.                                                                                                                                                                                                                         |
| OAuth via `sign_in_with_apple` + `google_sign_in` (native SDKs) → Supabase Edge Function        | **D6** (Cognito Managed Login)                                                                                            | After Phase 3 Cognito swap, mobile's `signInWithGoogle/Apple()` flows will likely become Cognito federated IdP calls. Until then, web uses Cognito + mobile uses Supabase — independent auth backends sharing only the user UUID.                                                                                                                                                         |
| iOS bundle ID + Apple Team ID + Android package + SHA256                                        | CLAUDE.md NEVER list ("don't touch AASA without verifying deeplinks")                                                     | **HARD CONSTRAINT.** Any AASA / assetlinks change on the website MUST be reviewed for backwards compatibility with the actively-running mobile binary.                                                                                                                                                                                                                                    |

---

## 4. Conflicts with web strategy doc

These are points where mobile has already shipped something that contradicts a locked web D-decision. Round 6 needs an explicit resolution for each.

### C1 — Domain anchoring: `my-quilty.app` vs `my-quilty.com` (D45 / D6 / D7 / D45 / U5)

Mobile's live infrastructure (AASA, Android App Links, API gateway, privacy/terms/support URLs, hard-coded operational config defaults) is rooted at `my-quilty.app`. The website's D45 locks `my-quilty.com` as the public domain. The conflict is _not_ fatal — mobile can keep deeplinking to `.app` while the website lives at `.com` — but it means:

- The website's `apps/web/public/.well-known/apple-app-site-association` and `assetlinks.json` **must NOT inherit the mobile contract** unless mobile's `applinks:` entitlement is updated and the binary is re-released. AASA on `.com` covering paths like `/journey`, `/puff`, `/settings/*` would do nothing for mobile until the iOS entitlement adds `applinks:my-quilty.com`.
- The mobile-repo Cloudflare Pages site at `quilty-website/` is the actual AASA host. It is on a domain different from the website's domain, and the GitHub Action `deploy-website.yml` will keep redeploying it on every mobile merge.
- The Cognito custom domain plan (U5 — flip at M1) is `auth.my-quilty.com`, but mobile is on Supabase — Cognito's redirect URI list will (initially) only contain web origins. Mobile inherits the Cognito-side wiring later.

### C2 — Auth backend is Supabase, not Cognito (D6 / D9 / D11 / D51 / D52 / D53)

D6-onwards assume Cognito Managed Login as the live auth surface for both web and mobile. Mobile is on Supabase. Round 6 needs an explicit answer to one of:

- (a) Does the website ship Cognito Managed Login _before_ mobile's Phase 3 swap? If yes, the EventBridge fan-out (D9) is only triggered by web events until mobile migrates — fine, but design `quilty.auth.sessions_revoked` consumers to tolerate one-side traffic.
- (b) Does mobile's Phase 3 land before website M6? If yes, perfect — both surfaces meet on Cognito.
- (c) Are we OK with the website locking Cognito while mobile keeps Supabase indefinitely? If yes, the join key is `cognito_sub` (web) ≠ Supabase UUID (mobile) — and we need a translation layer in the Rust backend.

Right now, all three are open. The CLAUDE.md "Critical recent pivot" call-out doesn't address the Cognito ↔ Supabase mismatch — Round 6 should.

### C3 — Analytics SDK conflict: PostHog (mobile) vs Amplitude (post-pivot web + mobile)

The 2026-05-19 D42b revert specifically said "we are now ALL-IN on Amplitude (web + mobile), unwinding PostHog Cloud Boost." Mobile is on PostHog Cloud EU + TelemetryDeck. Mobile's ADR for analytics platform migration **rejected Amplitude as primary** in February 2026, for these reasons (per `docs/architecture/ADR_ANALYTICS_PLATFORM_MIGRATION.md`):

- No mobile session replay
- No self-hosting
- No built-in feature flags
- Complex pricing, enterprise-oriented

Round 6 needs to confirm:

- Has the mobile team been re-briefed on the 2026-05-19 pivot?
- Does Amplitude's mobile SDK satisfy the original mobile drivers (consent-exempt baseline metrics via TelemetryDeck, session replay, feature flags)? If no, then "all-in on Amplitude" really means "Amplitude analytics + keep PostHog flags + keep PostHog replay + keep TelemetryDeck baseline on mobile" — which is the opposite of consolidation.
- If mobile migrates fully, what's the cutover plan for ~150 PostHog events, the feature-flag service, the `compliance_events` Drift table, and the `analytics_consent_changed` audit log?

### C4 — Session Replay vendor conflict (D68)

D68 explicitly rejects PostHog replay on the website. Mobile ships PostHog replay in production. This isn't a website conflict per se (D68 is web-only), but the rejection rationale (Round-5 HTML-attribute leak finding, `block`-vs-`mask` semantics) applies equally to mobile. Round 6 should at minimum **propagate the Round-5 finding** to the mobile team. The pubspec already pins `posthog_flutter: ^5.23.2` — verify whether v5+ Flutter SDK has the same attribute leak as the JS one.

### C5 — Feature flag vendor (D43 revised)

After the 2026-05-19 pivot, D43 is Amplitude Experiment. Mobile is PostHog flags. Same consolidation story as C3.

### C6 — Locale + i18n engine (D25)

D25 picks `next-intl`. Mobile picked `slang`. Not a conflict for the web (`next-intl` is web-correct), but locale string IDs and namespacing should be designed so the source-of-truth strings can be shared with mobile (e.g. flat-key ICU MessageFormat structure). Avoid pluralization rules that diverge between the two libraries.

### C7 — Bundle/package naming inconsistencies in mobile source

These don't conflict with web decisions, but the mobile repo has two stale constants (`androidPackageName = 'com.quiltyapp.quilty'` and `supportEmail = 'support@quiltyapp.com'`) that contradict the rest of the repo. The website's AASA / assetlinks / support contact pages should use the **`app.quilty.myquilty` / `support@my-quilty.app`** values (matching the rest of mobile + live config), not the stale ones.

---

## 5. Open scope questions

For the user / Round 6 synthesis to resolve.

**Q1 (highest priority).** Does the website at `my-quilty.com` need to serve AASA + assetlinks that claim ownership of the same Apple/Android bundles as the mobile-repo site at `my-quilty.app` — or are the two domains intentionally separate forever (web = marketing/account portal on `.com`, mobile deeplinks = `.app`)? If shared, what's the cutover plan for mobile's `com.apple.developer.associated-domains` entitlement and the Android App Links `autoVerify="true"` host? Each requires a binary release.

**Q2.** Is mobile expected to migrate to Cognito (Phase 3 swap) before, during, or after the website's M6 "real auth integration"? Round 6 needs a sequencing answer because D9 (EventBridge fan-out) and D11 (`quilty_sid` joined by `cognito_sub`) depend on it. If indefinite, the Rust backend needs to translate Supabase UUID ↔ Cognito sub.

**Q3.** Has the mobile team agreed to swap from PostHog + TelemetryDeck to Amplitude per the 2026-05-19 D42b pivot? The mobile ADR explicitly rejected Amplitude on capability grounds (no mobile session replay, no built-in flags, no consent-exempt baseline). If mobile stays on PostHog, "all-in Amplitude" means web-only Amplitude — and the original D42b "cross-platform user identity unified at the SDK + data-platform layer" justification dissolves.

**Q4.** If mobile migrates to Amplitude, what replaces PostHog Session Replay (mobile already runs it) and TelemetryDeck (consent-exempt baseline)? Amplitude has neither feature in a comparable form. Round 6 may want a separate mobile-replay decision.

**Q5.** Does the website inherit mobile's snake_case event-name taxonomy and super-property shape? If yes, lock the convention day-one in `apps/web/lib/observability/` event helpers. If no, both surfaces will have parallel event names that funnel-stitching tools have to reconcile.

**Q6.** The mobile-repo Cloudflare Pages site at `quilty-website/` and the `deploy-website.yml` workflow — do these stay live after the website M1 SST scaffold? They serve the production AASA at `my-quilty.app`. If both sites coexist, the mobile-repo one keeps its CI/CD; if not, the AASA must move before the Cloudflare deployment is decommissioned.

**Q7.** RevenueCat is mobile's IAP layer with a `SubscriptionPlatform.web` enum already in place. Does the website at M7 talk to **RevenueCat's Web SDK** (their hosted Stripe Checkout integration) or directly to Stripe with a RevenueCat REST callback? The mobile enum doesn't care, but the choice affects the user/entitlement reconciliation on the Rust backend.

**Q8.** Mobile ships its own PHI scrubber (`lib/src/core/logging/sentry_phi_scrubber.dart`) — is the website's D67 PHI sanitizer a direct port (same deny-list, same regexes), or a divergent implementation? Direct port is the safe answer.

**Q9.** Mobile's Usercentrics CMP has a `TODO(auth-v2)` block waiting for "the new AWS/Cognito-backed processor's Usercentrics templates" to be registered. Does the website's `ConsentState` (D35) replace Usercentrics entirely on web (yes per current strategy doc) — and if so, does mobile's Usercentrics integration need to read from the same backend `ConsentState` so the user's preferences are honored cross-surface?

**Q10.** Sentry's `enableUserInteractionTracing: true` on mobile captures button-tap names. Some clinical-state button labels could be PHI-shaped ("Log a craving", "Save tier-2 note"). Should the website default this OFF entirely? And should the Round 6 mobile follow-up audit re-evaluate the mobile setting?
