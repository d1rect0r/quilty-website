# Research: Security + Observability + Compliance Scaffolding

> Source: general-purpose research agent, 2026-05-14 (Round 2).
> Lens: CORE / ADDITIVE / TRAP.

---

**Context note:** The 2024-2025 enforcement landscape (Cerebral $7M, Monument ban, $100M+ in pixel-tracking penalties) means OCR/FTC posture is the dominant retrofit risk vector — not technical debt ([Feroot 2025](https://www.feroot.com/blog/pixel-tracking-violations-us-healthcare-100m/), [FTC v. Cerebral 2024](https://themarkup.org/pixel-hunt/2024/04/22/cerebral-to-pay-7-million-fine-and-limit-health-data-use-for-ads-under-federal-order)).

## 1. Security headers + CSP

Web Almanac 2025 ([httparchive.org/en/2025/security](https://almanac.httparchive.org/en/2025/security)) shows CSP at 21.9% adoption overall but only ~10% using `strict-dynamic` and 92% still using `unsafe-inline` — empirical evidence that **CSP is the single most retrofit-hostile header**. Once a codebase has inline scripts/styles scattered across templates and third-party widgets, hashing/nonce-ing them is a months-long migration.

**Structural decision now:** ship CSP-report-only with nonce + strict-dynamic from day one ([Google CSP guidance](https://csp.withgoogle.com/docs/strict-csp.html)), build inline-script discipline into the framework choice (Next.js/Remix have first-class nonce middleware). HSTS-preload, frame-ancestors, Referrer-Policy `strict-origin-when-cross-origin`, Permissions-Policy denying `camera`/`microphone`/`geolocation` by default — all one-line ops, but **the nonce plumbing is the load-bearing piece**.

COEP/COOP/CORP cross-origin isolation is **TRAP** at our scale — only needed for SharedArrayBuffer/high-res timers, and 86.5% of sites correctly set COEP `unsafe-none` ([Almanac 2025](https://almanac.httparchive.org/en/2025/security)).

SRI is selective by reality (median 2.82% per page), so apply to Stripe.js + the 2-3 third-party scripts you actually use; signature-based SRI is emerging but not production-ready.

## 2. Cookie consent + privacy UX

The **consent state lifecycle** is structural; the banner UI is not. AB 566 (Oct 2025) mandates Chrome/Safari ship GPC by Jan 2027, and the Sept 2025 CA/CO/CT GPC enforcement sweep + Ford settlement (Mar 2026) make GPC honoring a **legal floor**, not nice-to-have ([Consenteo 2026](https://www.consenteo.com/knowledge-hub/consent/what_is_global_privacy_control_and_universal_opt_out)).

Build a single `ConsentState` source-of-truth on the server (per-user, persisted), gate every analytics/marketing SDK initialization behind it, and propagate `Sec-GPC: 1` detection at the edge. For a HIPAA-aligned mental-health app, **OneTrust is overkill** ($10K min ACV as of Mar 2026) and **Iubenda/Cookiebot are sufficient** for the banner layer — but the gating pattern must be ours.

The Cerebral/Monument cases were not banner failures; they were **SDK-loaded-before-consent failures**.

## 3. Web observability stack

OpenTelemetry browser SDK is **not production-ready** in 2026 — Embrace/Honeycomb panels say "it's coming, not a plan" ([OTel 2026](https://opentelemetry.io/blog/2026/)).

**Structural decision:** pick Sentry (errors + RUM + replay, single BAA on Business tier — [Sentry HIPAA docs](https://docs.sentry.io/security-legal-pii/scrubbing/protecting-user-privacy/)) **OR** Datadog RUM, and commit to W3C traceparent propagation from browser → CloudFront → API Gateway so the web spans land in the same trace as our backend `x_trace_id`. The traceparent → x_trace_id mapping is the structural lock ([W3C Trace Context](https://www.w3.org/TR/trace-context/)).

Session replay on a mental-health site is a **CORE governance decision**, not a feature toggle — default mask-everything, allowlist non-PHI elements only, document in BAA scope. PostHog with BAA is the closest single-vendor fit (analytics + replay + flags under one BAA — [PostHog HIPAA](https://posthog.com/docs/privacy/hipaa-compliance)).

## 4. Audit-log integration

Structural lock: every web mutation hits the **same `/v1/*` endpoints as mobile**, carrying `traceparent` (W3C) + `Idempotency-Key` (Stripe convention, our Idempotent-Replayed pattern). DDB Streams → Firehose → S3 Object Lock pipeline already exists; web just becomes another client. **Do not** build a web-specific audit sink. Web-originated audit events get a `channel: "web"` tag at the API gateway boundary, nothing more.

## 5. HIPAA-aligned web posture

The structural decision: **website holds zero PHI**. Marketing site + sign-in only; PHI stays mobile + sync. This collapses the threat surface to "credential phishing + tracking-pixel exfil of identity," not PHI handling. AWS WAF + CloudFront + Shield Standard are HIPAA-eligible ([AWS HIPAA whitepaper](https://d1.awsstatic.com/whitepapers/compliance/AWS_HIPAA_Compliance_Whitepaper.pdf)). Third-party-script governance (CSP + SRI + tag-manager bypass-prevention) is the **CORE** anti-OCR control — exactly what Cerebral/Monument lacked.

## 6. Vulnerability scanning

`npm audit` + Dependabot + lockfile pinning + CycloneDX SBOM via `@cyclonedx/cyclonedx-npm` mirrors our backend Trivy/checkov pattern. **CORE:** SBOM generation in CI on day one (same Sigstore signing seam as backend). Snyk is additive.

## 7. Bot/abuse defense

Pre-launch traffic = zero, so WAF rules are speculative. **CORE:** CloudFront + WAF managed rules enabled + Cloudflare Turnstile on auth/signup forms (free, privacy-friendly — [Cloudflare](https://developers.cloudflare.com/turnstile/)). Custom rate limits = **ADDITIVE** post-launch.

## 8. Feature flags + A/B

LaunchDarkly's Oct 2025 outage (99% SDK-affected, 24h — [Statsig](https://www.statsig.com/perspectives/launchdarkly-and-growthbook-compared)) is the lesson: **server-side evaluation with local cache** is the structural pattern. GrowthBook self-hosted or Statsig (HIPAA BAA available) — pick now to avoid client-flicker patterns later. SSR-evaluated flags are **CORE**; client-only flags are a trap.

---

## CORE / ADDITIVE / TRAP

| Area | CORE (land now) | ADDITIVE (later) | TRAP (skip) |
|---|---|---|---|
| Security headers | CSP nonce+strict-dynamic plumbing, HSTS preload, frame-ancestors, Permissions-Policy default-deny camera/mic, SRI on Stripe.js | More CSP directives, report-uri dashboards, additional Permissions-Policy entries | COEP/COOP/CORP cross-origin isolation; full strict-CSP enforcement day-one (use report-only first) |
| Consent | Server-side ConsentState; GPC `Sec-GPC` honoring; SDK-load-gated-by-consent pattern | Granular per-purpose toggles; Iubenda/Cookiebot banner UI; geo-aware banner copy | OneTrust enterprise tier ($10K ACV); building CMP from scratch |
| Observability | Single vendor with HIPAA BAA (Sentry or Datadog or PostHog); W3C traceparent → x_trace_id propagation; replay mask-all default | More dashboards, custom RUM events, SLO burn-rate alerts | OpenTelemetry browser SDK as primary (not prod-ready); unmasked session replay |
| Audit pipeline | Web uses same `/v1/*` endpoints, same traceparent + Idempotency-Key, `channel:web` tag | Web-specific event types | Separate web audit sink |
| HIPAA posture | Zero-PHI website; third-party-script governance via CSP/SRI/tag-manager lockdown; BAA inventory | Vendor risk dashboards; OCR-ready evidence packs | Full SIEM/SOAR on web; zero-trust web microsegmentation |
| Dep scanning | CycloneDX SBOM in CI; Dependabot; lockfile pinning | Snyk/reachability analysis | Multi-vendor SCA stack |
| Bot defense | CloudFront WAF managed rules; Turnstile on auth/signup | Custom rate limits; bot-management tiers | DataDome/HUMAN enterprise pre-launch |
| Feature flags | Server-side SDK with local cache (GrowthBook/Statsig); SSR flag evaluation | Experimentation stats; targeting rules | Client-only flags; LaunchDarkly without Relay Proxy |

## Sources
- [Web Almanac 2025: Security](https://almanac.httparchive.org/en/2025/security)
- [OWASP ASVS 5.0 (May 2025)](https://owasp.org/www-project-application-security-verification-standard/)
- [Google strict-CSP guidance](https://csp.withgoogle.com/docs/strict-csp.html)
- [MDN CSP implementation](https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/CSP)
- [W3C Trace Context](https://www.w3.org/TR/trace-context/)
- [OpenTelemetry 2026 blog / Browser SIG](https://opentelemetry.io/blog/2026/)
- [Sentry HIPAA + Session Replay privacy](https://docs.sentry.io/security-legal-pii/scrubbing/protecting-user-privacy/)
- [PostHog HIPAA compliance](https://posthog.com/docs/privacy/hipaa-compliance)
- [HHS OCR tracking-technologies guidance](https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/hipaa-online-tracking/index.html)
- [FTC v. Cerebral (April 2024)](https://themarkup.org/pixel-hunt/2024/04/22/cerebral-to-pay-7-million-fine-and-limit-health-data-use-for-ads-under-federal-order)
- [FTC v. Monument (April 2024)](https://www.ftc.gov/news-events/news/press-releases/2024/04/alcohol-addiction-treatment-firm-will-be-banned-disclosing-health-data-advertising-settle-ftc)
- [Feroot: Pixel-tracking violations $100M+](https://www.feroot.com/blog/pixel-tracking-violations-us-healthcare-100m/)
- [Consenteo: GPC compliance 2026](https://www.consenteo.com/knowledge-hub/consent/what_is_global_privacy_control_and_universal_opt_out)
- [AWS HIPAA whitepaper](https://d1.awsstatic.com/whitepapers/compliance/AWS_HIPAA_Compliance_Whitepaper.pdf)
- [Cloudflare Turnstile docs](https://developers.cloudflare.com/turnstile/)
- [Statsig: LaunchDarkly Oct 2025 outage analysis](https://www.statsig.com/perspectives/launchdarkly-and-growthbook-compared)
- [W3C Subresource Integrity](https://www.w3.org/TR/sri-2/)
