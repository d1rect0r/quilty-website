# Enterprise architecture validation — website ↔ AWS (2026-06-18)

> **Type:** Research / validation record. Not an ADR; feeds ADR-0029 (addendum 2026-06-18) and the AWS-side `aws_org_evolution_plan.md` open calls.
> **Trigger:** `quilty-aws/docs/infrastructure/aws_org_evolution_plan.md` (DISCUSSION ARTIFACT, 2026-06-04) raised an alternative BFF topology ("Plan A") and 13 open decision calls. We ran an end-to-end validation before committing.
> **Method:** 6 parallel enterprise online-research agents, adversarial stance (validate, don't confirm), grounded in 2025-2026 sources with URLs. Each rendered MATCHES-ENTERPRISE / DIVERGES / GAP verdicts.
> **Response artifact (to AWS team):** `quilty-aws/docs/infrastructure/aws_org_evolution_plan_website_response_2026-06-18.md`.

---

## Headline

The locked website architecture validates as **enterprise-correct end-to-end**; the compliance spine (zero-PHI web tier, account isolation, two-tier CSP, BFF token-handler, server-side ConsentState) is _ahead_ of 2026 norms and is what makes the rest defensible. The AWS account topology is mostly right with three corrections. No decision required a reversal; several were made explicit. A short list of operational gaps and over-builds was surfaced for the pre-launch backlog.

---

## Resolved decisions (the AWS-plan open calls that touch the website)

| #   | Decision                                 | Verdict                                                        | Resolution                                                                                                                                                                                                                             |
| --- | ---------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10  | BFF account placement (Plan A vs Plan B) | Plan B MATCHES-ENTERPRISE; Plan A VALID-BUT-REGRESSION         | **Plan B** — Next.js SSR app = BFF in marketing-prod, HTTPS-bearer client of `api.my-quilty.app`. Adopt the rendering-split hybrid (static marketing routes + SSR portal/auth) inside marketing-prod. (ADR-0029 Decision G/G.1)        |
| 8   | Cookie/session domain strategy           | Option B MATCHES (literal IETF rec); A impossible; C premature | **Host-only `__Host-` on the BFF origin.** Cross-subdomain "problem" is a non-issue once the BFF owns the session. (ADR-0029 Decision H)                                                                                               |
| 7   | marketing-prod OU placement              | DIVERGES (current Non-Prod placement is backwards)             | **Move to Workloads/Production or a stricter Customer-Surface OU** with SCPs denying PHI key/bucket access.                                                                                                                            |
| 9   | DNS ownership                            | Apex-relocation DIVERGES; delegation + ALIAS MATCH             | **Do NOT move the signed apex into marketing-prod** (registrar DS re-key = brand-domain outage risk, no benefit). Keep apex where it is (or neutral DNS account); marketing-prod gets cross-account ALIAS + delegated `auth.` subzone. |
| 12  | Restructure scope/timing                 | MATCHES (do it now)                                            | Pre-launch is the lowest-cost window. Sequence **OU-moves → new account → rename last**. "IAM ARN cascade" fear is mostly a myth (account IDs immutable across rename; only name-keyed refs churn).                                    |

## Stack validation (previously-"locked" website choices)

| Choice                                           | Verdict                         | Note                                                                                                                                          |
| ------------------------------------------------ | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| SSR-on-Lambda for combined marketing+portal      | MATCHES                         | Verify marketing routes are CDN-served, not SSR-per-request (SEO/LCP).                                                                        |
| SST 4.x + OpenNext off-Vercel                    | MATCHES                         | Vercel "no BAA" rationale is **dated** (BAA now exists, Pro tier) — reframe to "account/VPC sovereignty + SCP isolation."                     |
| Next.js 16 App Router + RSC                      | MATCHES (maturity)              | RSC adds a server attack surface → treat Next patch cadence as a compliance control (see caveat below).                                       |
| Webpack-for-prod / Turbopack-for-dev             | DIVERGES (defensible, expiring) | Turbopack is the Next 16 default; keep webpack for the size-gate but log a migration trigger. `next-rspack` stays an experimental watch-item. |
| Portal + marketing in one app                    | MATCHES (at our scale)          | Split trigger: external contributor access, portal build-time pain, or isolating the portal RSC attack surface.                               |
| Sentry + Amplitude + CloudWatch + consent-gating | MATCHES                         | Default-deny + GPC-at-edge + Sentry mask-all likely _exceeds_ current legal floor. Residual risk is operational (event-schema review).        |
| BFF→Rust over HTTPS bearer, no cross-account IAM | MATCHES                         | PrivateLink `execute-api` is the Phase-1 hardening target; public HTTPS + WAF + bearer is fine for launch.                                    |

## Over-builds to trim (YAGNI for 1–2 engineers pre-launch) — for discussion, not yet locked

- **`@quilty/workflow` engine (ADR-0021)** — clearest over-build; shelve until a concrete consumer exists.
- **Custom design-token _pipeline_ (ADR-0020)** — keep the Tailwind `@theme` tokens; defer the emission pipeline until web+Flutter parity pain is measured.
- **`@quilty/search` (ADR-0019)** — fine as empty scaffolding; build at the documented search trigger only.
- Keep (correctly built early — retrofit-hostile): multi-account split, BFF, CSP, ConsentState.

## Gaps to close before launch — backlog

1. **Supply-chain / SBOM controls** (highest risk/effort given the 2025-26 npm attack wave): frozen lockfiles in CI, dependency cooldown/min-age policy, SBOM generation in CI, pnpm-10 secure defaults on.
2. **Concrete WAF + edge rate-limit baseline** (~$9/mo) on CloudFront **and** the Cognito Managed Login endpoints (Cognito got WAF support June 2025). Rate-limit must use a shared store, never Lambda memory.
3. **Web-tier auth audit logging** (zero-PHI: login/logout/step-up/revocation/consent events) **+ a written incident-response runbook.**
4. **Cross-account secrets distribution + named rotation owner** (Secrets Manager resource policy / rotation; not env copy-paste).
5. **Consent/PHI review of Amplitude event schemas + Sentry replay masking** specifically on authenticated routes.

## Validate before it bites (M6 auth build)

- **Cognito passkey-vs-MFA constraint:** reported that user-pool-level MFA can disable passwordless/passkey sign-in (MFA overrides choice-based methods). If passkeys-as-primary + MFA-for-sensitive-actions are both required, resolve on the AWS/auth side before the web BFF builds against it.
- **SameSite Lax vs Strict** for the BFF session cookie (ADR-0029 Decision H open reconcile, `D-AUTH-SAMESITE-LAX-VS-STRICT`).

## Evidence caveats

- The IETF "OAuth 2.0 for Browser-Based Apps" is a consensus **draft** (draft-26, Dec 2025); RFC 9700 (OAuth Security BCP) and RFC 9470 (step-up) are final. AWS SRA / HIPAA / Privacy Reference Architecture are primary AWS guidance. Curity/Duende/Auth0/FusionAuth are authoritative vendor sources, not standards.
- Some agents cited **very specific, very recent security claims** (a "CVSS-10 RSC RCE," specific CVE numbers, a "Next.js May 2026 security release," `16.2.6`). The _principle_ (RSC adds server attack surface; keep Next aggressively patched) is sound regardless, but the specific CVE/version claims should be **verified directly** before being written into a runbook as fact.

## Key sources (representative; full lists in the agent outputs)

- IETF OAuth 2.0 for Browser-Based Apps (BFF) — https://datatracker.ietf.org/doc/html/draft-ietf-oauth-browser-based-apps
- RFC 9700 (OAuth Security BCP, 2025-01) — https://datatracker.ietf.org/doc/rfc9700/ ; RFC 9470 (Step-Up) — https://www.rfc-editor.org/rfc/rfc9470.html
- Curity Token Handler — https://curity.io/resources/learn/the-token-handler-pattern/ ; Duende BFF — https://docs.duendesoftware.com/bff/ ; Auth0 BFF — https://auth0.com/blog/the-backend-for-frontend-pattern-bff/
- AWS Security Reference Architecture (Aug 2025) — https://docs.aws.amazon.com/prescriptive-guidance/latest/security-reference-architecture/welcome.html
- AWS "Organizing Your AWS Environment Using Multiple Accounts" — https://docs.aws.amazon.com/whitepapers/latest/organizing-your-aws-environment/organizing-your-aws-environment.html
- AWS SCP best practices — https://aws.amazon.com/blogs/industries/best-practices-for-aws-organizations-service-control-policies-in-a-multi-account-environment/
- RFC 6265bis cookie prefixes — https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-cookie-prefixes-00 ; PortSwigger "Cookie Chaos" (2025) — https://portswigger.net/research/cookie-chaos-how-to-bypass-host-and-secure-cookie-prefixes
- Route 53 cross-account ALIAS → CloudFront — https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/routing-to-cloudfront-distribution.html ; cross-account subdomain delegation — https://aws.amazon.com/blogs/networking-and-content-delivery/automating-domain-delegation-for-public-applications-in-aws
- OpenNext on AWS (2026) — https://opennext.js.org/aws/faq ; Next.js 16 / adapters — https://nextjs.org/blog/nextjs-across-platforms
- npm supply-chain / SBOM — https://pnpm.io/supply-chain-security ; FTC tracking-pixel enforcement (Cerebral) — https://themarkup.org/pixel-hunt/2024/04/22/cerebral-to-pay-7-million-fine ; WA MHMDA private right of action — https://www.wilmerhale.com/en/insights/blogs/wilmerhale-privacy-and-cybersecurity-law/20250220-first-lawsuit-filed-under-washingtons-my-health-my-data-act
