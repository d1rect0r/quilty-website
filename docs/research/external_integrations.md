# Research: External Systems That Integrate With the Website at Onboarding

> Source: general-purpose research agent, 2026-05-14.
> Purpose: catalog external systems (AWS, Apple, Google, Stripe, OAuth providers, BAA vendors) that touch the website during their onboarding/verification flows.
> **Framing note:** these are byproducts of having a real website, NOT scoping drivers. We design the website for target quality (per `consumer_health_patterns.md`); these all clear as a side effect. This doc exists so we know what touchpoints to expect and at higher trust levels than a minimum site would pass.

---

## 1. AWS SES Production Access

**Verdict:** Website existence is a soft signal, not a hard gate. Domain+email infra is the real gate.

AWS's official SES FAQ and `request-production-access.html` docs never enumerate "live website" as a checklist item. What AWS Trust & Safety actually evaluates:
- **Hard requirements**: verified sending domain, DKIM, SPF, DMARC, SNS bounce/complaint topics wired, suppression list strategy, opt-out mechanism, use-case description (transactional vs marketing), recipient acquisition explanation
- **Soft signals weighed in approval**: AWS account age, MRR spend, account email (gmail/hotmail addresses get auto-rejected per Waypoint's collated rejection patterns), and yes — a domain that resolves to *something* legitimate when AWS T&S clicks it

**Real-world rejection language** (re:Post threads, May 2025): "We reviewed your request and determined that your use of Amazon SES could have a negative impact on our service" — AWS deliberately won't enumerate. Community walkthroughs converge on: a parked domain or pure 404 is a near-certain reject; "a landing page with company description + privacy policy linked in footer" is typically sufficient. A real, polished website passes with significantly higher trust signal.

## 2. App Store / Play Store submission

- **Apple App Store submit** — Privacy Policy URL mandatory; Support URL must be live, HTTPS, no 404, no login wall; Marketing URL optional.
- **Google Play submit (health app)** — Active, publicly accessible, non-geofenced privacy URL; Jan-2026 update requires URL **identical** in Play Console, in-app, and on website. Plus Health Apps Declaration form.

## 3. Apple Developer Program organizational enrollment

**Hard block on real website.** Apple's enrollment guidance: "Your organization's website must be publicly available and functional, and its domain name must be associated with your organization. **Links to social media... or domain-registrar parking pages won't be accepted.**" Pairs with D-U-N-S number.

This is one of the strongest forcing functions for "real" vs "minimum" — Apple explicitly rejects landing-page-only sites for org enrollment. Designing for target quality from the start aligns naturally with org-enrollment requirements; designing for "minimum to unblock" does not.

## 4. Google OAuth consent screen verification

Hard block. Homepage must be:
- Publicly accessible
- Describe app functionality
- Link to privacy + ToS
- Be static (no redirects)
- Domain-verified via Search Console

**Play Store listing ≠ valid homepage** per Google's own brand-verification doc.

## 5. Sign in with Apple (Services ID, web flow)

Domain only, not site content. Need verified domain + return URL. No verification file required since Nov 2020 — just the domain string. Native iOS Sign-in-with-Apple doesn't even need this.

## 6. Cognito Hosted UI custom domain

Domain only. `auth.quilty.app` needs ACM cert in us-east-1 + DNS. No site content needed.

## 7. Stripe full activation

Soft — alternatives exist for pre-launch. Stripe explicitly allows pre-launch alternatives via support contact (product description in lieu of URL). But the website checklist (16 items, see `regulatory_requirements.md` §5) is what's checked when a URL is provided. A real polished site = instant activation.

## 8. HIPAA BAA negotiation

**No website blocker.** Vendors check SOC 2 / HITRUST attestations and corporate identity, not website polish. Big vendors (AWS, Datadog, Twilio) sign BAAs via click-through or sales calls without site review.

## 9. Plaid / OAuth orgs (Facebook, etc.)

Each requires homepage URL with app description + privacy link, similar to Google's bar.

---

## Summary table: "Truly blocks on real website?"

| Workstream | Real website required? | Notes |
|---|---|---|
| AWS SES production | Soft signal (domain ≠ parking page) | Domain/email infra is the real gate |
| Apple App Store submit | Yes (Privacy + Support URLs must resolve) | Marketing URL optional |
| Google Play submit | Yes (Privacy URL — identical-strings rule in 2026) | Plus Health Apps Declaration |
| **Apple Developer Program org enrollment** | **Yes — hard, explicit ban on parking/social-only** | Strongest forcing function for "real" vs "minimum" |
| Google OAuth verification | Yes — homepage must describe app + link privacy/ToS, domain-verified | Play Store listing not accepted |
| Sign in with Apple (web) | Domain only | No content requirement |
| Cognito Hosted UI custom domain | Domain only | ACM cert + DNS |
| Stripe full activation | Soft — alternatives exist | But real polished site = instant activation |
| HIPAA BAA negotiation | No | Vendors check SOC 2 / HITRUST, not site |
| OAuth providers (Google/Facebook/etc.) | Yes — similar to Google | Privacy + description required |

---

## Sources

- [AWS SES request production access (official)](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html)
- [AWS SES production access FAQ — re:Post knowledge center](https://repost.aws/knowledge-center/ses-production-access-request-faq)
- [Waypoint: AWS denied your production access to SES](https://www.usewaypoint.com/blog/aws-denied-your-production-access-to-amazon-ses)
- [Alex Dawkins: Escaping the SES Sandbox (May 2025)](https://alex-dawkins.com/posts/2025/05/09/simple-email-service.html)
- [Kevin's Guides: Getting Approved for SES Production](https://kevinsguides.com/guides/webdev/aws-sites/ses-production/)
- [re:Post — SES denied with no information](https://repost.aws/questions/QUO0zYv-bwRmOHRU0DD_-Kgw/ses-production-access-request-denied-with-no-information)
- [Apple Developer — Manage app privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/)
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Apple Developer — D-U-N-S and org enrollment](https://developer.apple.com/help/account/membership/D-U-N-S/)
- [Apple Developer — Configure Sign in with Apple for the web](https://developer.apple.com/help/account/capabilities/configure-sign-in-with-apple-for-the-web/)
- [Google Play Health Content and Services policy](https://support.google.com/googleplay/android-developer/answer/16679511?hl=en)
- [Google Play 2026 health apps policy update (My App Monitor)](https://myappmonitor.com/blog/google-play-health-apps-update-2026-requirements)
- [Google OAuth — App Homepage requirements](https://support.google.com/cloud/answer/13807376)
- [Google OAuth — Brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification)
- [Stripe — Business website for account activation FAQ](https://support.stripe.com/questions/business-website-for-account-activation-faq)
- [Stripe — Pre-launch / no-website alternatives](https://support.stripe.com/embedded-connect/questions/unable-to-complete-account-activation-without-business-website)
- [Aptible — BAA requirements and red flags](https://www.aptible.com/hipaa/baa)
- [HIPAA Journal — BAA 2026 update](https://www.hipaajournal.com/hipaa-business-associate-agreement/)
- [AWS — Cognito custom domain for managed login](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-add-custom-domain.html)
