# Research: Auth + Session Architecture for Consumer Web

> Source: general-purpose research agent, 2026-05-14 (Round 2).
> Lens: CORE / ADDITIVE / TRAP.

---

## 1. Cookie strategy — mostly settled, one CORE decision

The 2025-2026 baseline is uncontroversial: session cookies are `Secure + HttpOnly + SameSite=Lax`. `Strict` breaks the "click link in email → land logged in" flow consumer apps depend on, and Clerk explicitly defaults to `Lax` for that reason ([Clerk CSRF docs](https://clerk.com/docs/guides/secure/best-practices/csrf-protection)). `__Host-` prefix is the strongest hardening (HTTPS + Path=/ + no Domain attribute, browser-enforced), but **`__Host-` is mutually exclusive with parent-domain cookies** — the prefix forbids the `Domain` attribute. That's the one structural fork: prefix OR parent-domain sharing, not both ([MDN Cookies](https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/Cookies)).

CHIPS / Partitioned cookies are a **non-issue for our shape**: subdomains under the same registrable domain (`quilty.app`) share a partition key, so first-party auth at `auth.quilty.app` ↔ `app.quilty.app` is unaffected ([MDN CHIPS](https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/Privacy_sandbox/Partitioned_cookies)). Safari ITP's 7-day cap hits *JS-set* first-party cookies; **server-set cookies are not capped** the same way ([Safari ITP 2026 guide](https://www.cometly.com/post/safari-itp-blocking-tracking)). Always set session cookies server-side from `auth.quilty.app`.

## 2. Session storage + refresh pattern — the single biggest CORE decision

The IETF OAuth Browser-Based Apps BCP (draft-ietf-oauth-browser-based-apps, updated Dec 2025) now **strongly endorses BFF as the default** for any browser app: "The BFF uses cookies to create a user session, which is directly associated with the user's tokens" — tokens never reach the browser ([IETF BCP](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-browser-based-apps)). Duende, Auth0, FusionAuth all converged here in 2025 ([Duende BFF v4](https://duendesoftware.com/blog/20251204-why-now-is-an-excellent-time-for-backend-for-frontend-duende-bff-v4), [Auth0 BFF](https://auth0.com/blog/the-backend-for-frontend-pattern-bff/)).

The three patterns and where they land:
- **(a) BFF with server-side session**: dominant for new builds 2025+. Cookies HttpOnly, tokens in Redis/server-side cache, silent refresh server-side. SEO/SSR-friendly. Easiest "sign out everywhere" + audit-log parity. Cost: one stateful service to operate.
- **(b) HttpOnly cookies carrying real tokens**: still common in legacy; OK if refresh rotation + reuse-detection is solid (which we already have).
- **(c) Access-token-in-memory + silent iframe refresh**: dying. Third-party-cookie deprecation kills silent-refresh iframes ([Microsoft 3rd-party cookie guidance](https://learn.microsoft.com/en-us/entra/identity-platform/reference-third-party-cookies-spas)).

**Migration cost (b)→(a) is high** — you re-architect every API call to go through your origin. **Pick now.** Given we already have Cognito + RTFAMILY hardening at the API layer, our cheapest BFF is a thin Node service at `app.quilty.app` (or Next.js Route Handlers, which serve the same function) that holds the Cognito tokens and issues a `__Host-quilty_session` cookie. That's CORE.

## 3. Auth boundary — Hosted UI is the right starting choice

AWS frames Managed Login (the 2024 successor to Hosted UI) as: AWS owns hosting/scaling, you get OAuth/federation/WAF integration; custom UI gives full control but you own the surface area including Lambda triggers ([AWS blog](https://aws.amazon.com/blogs/security/use-the-hosted-ui-or-create-a-custom-ui-in-amazon-cognito/)). For our scale, **Hosted UI at `auth.quilty.app` is CORE**: it isolates the auth attack surface, ships WAF/threat-protection out of the box, supports passkeys + TOTP we already wired in W2-B.2, and the OAuth redirect contract is portable if we ever migrate IdPs. The lock-in cost of custom UI at our scale would dwarf the customization wins.

## 4. Cross-subdomain — parent-domain `.quilty.app` is fine *if* you accept the prefix trade-off

Better Auth's guidance: prefer narrow scope, share only when necessary ([Better Auth Cookies](https://better-auth.com/docs/concepts/cookies)). For Quilty's shape (marketing `quilty.app`, app `app.quilty.app`, auth `auth.quilty.app`), the **OIDC code-flow-per-subdomain via BFF** is cleaner than parent-domain cookies: each surface holds its own `__Host-` session cookie, BFF at each surface independently exchanges the auth code. Parent-domain `.quilty.app` cookies work but you give up `__Host-` prefix, marketing must never see auth state (XSS blast radius widens), and Safari ITP edge cases creep in around iframe/redirect chains ([Safari cookie issues](https://medium.com/@lucasrosvall/solving-cookie-issues-in-safari-for-your-web-app-08d21b72a004)). **CORE: pick OIDC-per-subdomain.** Working hypothesis of parent-domain shared cookies is the *operationally* simpler option but the *structurally* weaker one.

## 5. Step-up auth — RFC 9470 is ADDITIVE

RFC 9470 (Sep 2023, actively implemented 2025) gives APIs a structured way to demand higher `acr_values` or fresher `max_age` via the `WWW-Authenticate: insufficient_user_authentication` response ([RFC 9470](https://www.rfc-editor.org/rfc/rfc9470.html), [Duende impl](https://duendesoftware.com/blog/20250708-step-up-challenges-with-duende-identityserver-and-aspnet-core-apis)). We already stamp step-up at the API layer (Wave 1 D-stamping). On web, this layers on cleanly — the BFF intercepts 401 + step-up challenge, redirects to Hosted UI with elevated `acr_values`, returns. **ADDITIVE, not load-bearing.**

## 6. Mobile-web parity — backchannel logout is CORE, token sharing is TRAP

OIDC Backchannel Logout (with `sid` claim) is the enterprise pattern: IdP POSTs a signed logout_token to each registered client when a session terminates ([OIDC Backchannel spec](https://openid.net/specs/openid-connect-backchannel-1_0.html)). Cognito supports it. **Independent sessions per surface, joined by `sid`, propagated by backchannel logout is CORE** — wire the endpoint now, even if "sign out everywhere" UX ships later. Token *sharing* across mobile and web (OIDC Native SSO) is enterprise SSO turf and **TRAP** for our scale ([OIDC Native SSO draft](https://openid.net/specs/openid-connect-native-sso-1_0.html)).

## 7. CSRF — still needed, cheap to add

OWASP's 2025-2026 stance is unambiguous: "SameSite is useful as a defense-in-depth control but does not replace a proper CSRF defense in most deployments" ([OWASP CSRF Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)). Lax fails on GET state-changers, doesn't cover older/embedded browsers, and doesn't help with client-side CSRF. **CORE pattern: signed double-submit cookie + custom `X-Quilty-CSRF` header check at BFF.** Cheap to implement, audit-friendly.

## 8. Logout + revocation — falls out of BFF

With BFF, "sign out everywhere" is one DELETE against the session store + Cognito global sign-out + backchannel logout POST to mobile. Without BFF, you're chasing refresh tokens in browser storage. Okta's universal logout tutorial admits the gap: "in mobile apps and SPAs, you'll need to revoke refresh tokens on the front end" ([Okta universal logout](https://developer.okta.com/blog/2024/04/30/express-universal-logout)). BFF removes that problem. Audit-log parity is trivial when revocation is one server-side event.

---

## CORE / ADDITIVE / TRAP table

| Decision | Verdict | Why |
|---|---|---|
| **BFF pattern** (server-side session, tokens never in browser) | **CORE** | IETF BCP default 2025+. Migration cost from non-BFF is high. Enables clean logout + audit parity. |
| **Cognito Hosted UI at `auth.quilty.app`** | **CORE** | Isolated attack surface; OAuth redirect contract is portable. Custom UI is premature differentiation. |
| **`__Host-` prefix on session cookies** | **CORE** | Browser-enforced binding; cheap; forces the cross-subdomain decision below. |
| **OIDC code flow per subdomain (NOT parent-domain `.quilty.app` cookies)** | **CORE** | Compatible with `__Host-`; narrower blast radius; survives Safari ITP edge cases. |
| **`SameSite=Lax`** (not Strict) | **CORE** | Strict breaks consumer email-link flows. |
| **OIDC Backchannel Logout with `sid`** | **CORE** | Wire it now even if UX ships later — retrofitting `sid` plumbing is painful. |
| **Signed double-submit CSRF token + custom header** | **CORE** | OWASP requires it; cheap; covers GET-state-change + old-browser gaps. |
| **Refresh token rotation + RTFAMILY reuse detection** | **CORE (done)** | Already shipped in W2-B.2. BFF inherits this. |
| **RFC 9470 step-up on web** | **ADDITIVE** | Server side already stamps; web BFF layers on cleanly later. |
| **Passkeys / TOTP MFA UX flows on web** | **ADDITIVE** | Backend done; web is UI work. |
| **Social provider additions** | **ADDITIVE** | Federation plumbing exists; toggleable. |
| **Recovery UX / password-strength meters** | **ADDITIVE** | Pure UX layer. |
| **Partitioned cookies (CHIPS)** | **ADDITIVE / N/A** | Doesn't affect same-registrable-domain first-party auth. Re-evaluate only if we embed Quilty in a third-party context. |
| **OIDC Native SSO (token sharing mobile↔web)** | **TRAP** | Enterprise SSO complexity for marginal UX gain at our scale. Independent sessions + backchannel logout suffices. |
| **Custom Cognito UI** | **TRAP (for now)** | Customization wins << operational cost at consumer-app scale. |
| **Per-subdomain dedicated IAM identities / federated SSO from day one** | **TRAP** | Premature mesh for solo-founder/MVP scale. |
| **Full Auth.js-style edge session at CDN** | **TRAP** | Adds edge complexity before product-market fit. BFF at origin is simpler. |

**Bottom line for Quilty:** the one decision you cannot easily reverse is **BFF vs direct-token-in-browser**. Pick BFF. Everything else (Hosted UI choice, `__Host-` prefix, OIDC-per-subdomain, backchannel logout, CSRF double-submit) follows from that and is cheap to ship now while expensive to retrofit later.

## Sources
- [IETF OAuth 2.0 for Browser-Based Apps BCP (draft, Dec 2025)](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-browser-based-apps)
- [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [RFC 9470: OAuth 2.0 Step Up Authentication Challenge Protocol](https://www.rfc-editor.org/rfc/rfc9470.html)
- [OpenID Connect Back-Channel Logout 1.0](https://openid.net/specs/openid-connect-backchannel-1_0.html)
- [AWS — Managed Login vs Custom UI in Cognito](https://aws.amazon.com/blogs/security/use-the-hosted-ui-or-create-a-custom-ui-in-amazon-cognito/)
- [Auth0 — The Backend for Frontend (BFF) Pattern](https://auth0.com/blog/the-backend-for-frontend-pattern-bff/)
- [Duende — Why Now Is an Excellent Time for BFF (Dec 2025)](https://duendesoftware.com/blog/20251204-why-now-is-an-excellent-time-for-backend-for-frontend-duende-bff-v4)
- [Clerk — CSRF protection docs](https://clerk.com/docs/guides/secure/best-practices/csrf-protection)
- [Better Auth — Cookies docs](https://better-auth.com/docs/concepts/cookies)
- [MDN — Secure cookie configuration](https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/Cookies)
- [MDN — CHIPS / Partitioned cookies](https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/Privacy_sandbox/Partitioned_cookies)
- [Okta — Universal logout tutorial](https://developer.okta.com/blog/2024/04/30/express-universal-logout)
- [OIDC Native SSO for Mobile Apps 1.0 (draft)](https://openid.net/specs/openid-connect-native-sso-1_0.html)
- [Microsoft Entra — Handling third-party cookie blocking](https://learn.microsoft.com/en-us/entra/identity-platform/reference-third-party-cookies-spas)
- [Cometly — Safari ITP 2026 Marketer's Guide](https://www.cometly.com/post/safari-itp-blocking-tracking)
