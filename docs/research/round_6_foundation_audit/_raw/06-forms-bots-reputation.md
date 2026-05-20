# Round-6 Foundation Audit — Agent D: Forms, Bots, Rate-Limiting, Reputation Bootstrap

> **Scope:** Forms tech foundation (library + validation + Server Actions canonical pattern + CAPTCHA + rate limit + bot/spam mitigation) **AND** reputation-bootstrap strategy (handle reservations, press kit, launch readiness, reviews, trust signals).
>
> **Audience:** The engineer who implements Quilty's first real form (Contact at M2 or Waitlist at M3) — that form will grandfather 12+ siblings through M9.
>
> **Sources:** 2025-2026 only. Validated against Cloudflare/Vercel/AWS/Conform/RHF official docs and peer comparison (Stripe / Linear / Cal.com / Plain / Vercel / Anthropic / PostHog / Headspace / Calm / Mindbloom / BetterHelp).

---

## 1. Executive summary

Quilty has **zero working forms** and a green-field decision space — the perfect moment to lock the canonical pattern before forms #1-#13 ship as snowflakes. After auditing six options across three axes (form-state library, validation, Server-Actions integration) the recommended foundation is:

**React Hook Form 7.x + Zod 3.25 (already locked) + Server Actions + shadcn `<Field>` primitives** — with `useActionState` as the server-error bridge and `useTransition` for pending UI. Conform was the close runner-up and is the App-Router-native choice, but RHF wins on three Quilty-specific axes: shadcn ecosystem alignment (D17/D18), ~12M weekly downloads of muscle memory, and the dynamic-field/multi-step ergonomics that Stripe Elements + account-delete-reason + step-up auth (D54) will all need.

**Bot mitigation = three-layer defense** locked to D37: Cloudflare Turnstile (visible, hash-pinned per D59 marketing CSP) + honeypot + time-trap + AWS WAF rate-based rule (D70/M1+1 already mandates WAF) + DynamoDB app-layer per-identifier rate-limit on auth surfaces only. **Upstash is rejected** for HIPAA-account isolation (D31, Cerebral lesson) — DynamoDB is BAA-native and already in our stack for sessions (D51).

**Reputation bootstrap = reserve broadly, activate narrowly.** Twelve handles reserved at M1+2 for $0 (Bluesky via custom domain, Twitter/X, LinkedIn, Threads, Instagram, TikTok, YouTube, Pinterest, Reddit, GitHub-org, Substack, Producthunt). Mastodon deferred to M3. Reviews/trust badges deferred to M8+. Founder-presence stays low until M5 — the Calm/Headspace pattern, not the Plain/Resend pattern.

Five new D-decisions proposed: **D75 (RHF + Server Actions canonical pattern), D76 (Turnstile + honeypot + time-trap triad), D77 (DynamoDB rate-limit, not Upstash), D78 (handle-reservation matrix), D79 (Field-level analytics: no PII in event payload, ever)**.

---

## 2. Forms canonical pattern — the reference shape

This is the shape every form (contact / waitlist / signin / signup / delete-account / payment / support / NPS) **must** follow. Deviations require an ADR.

### 2.1 Architecture overview

```
┌─────────────────────────────────────────────────────────────────┐
│  apps/web/lib/forms/                                            │
│  ├─ schemas/                  ← Single Zod schema per form      │
│  │   ├─ contact.ts                                              │
│  │   ├─ waitlist.ts                                             │
│  │   └─ delete-account.ts     ← D31 PHI-reason enum             │
│  ├─ actions/                  ← Server Actions ('use server')   │
│  │   ├─ submit-contact.ts                                       │
│  │   └─ submit-waitlist.ts                                      │
│  ├─ types.ts                  ← FormResult<T> discriminated union│
│  ├─ csrf.ts                   ← D10 + D53 triple-layer helpers  │
│  ├─ turnstile.ts              ← Server-side siteverify          │
│  ├─ honeypot.ts               ← Field + time-trap helpers       │
│  └─ rate-limit.ts             ← DynamoDB-backed (D77 new)       │
│                                                                 │
│  apps/web/components/forms/                                     │
│  ├─ ContactForm.tsx           ← Client Component                │
│  ├─ WaitlistForm.tsx                                            │
│  └─ shared/                                                     │
│      ├─ TurnstileWidget.tsx   ← Wrapped (D18: don't edit shadcn)│
│      └─ HoneypotField.tsx                                       │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 The typed Result envelope

The single most load-bearing primitive — every Server Action returns this exact shape:

```ts
// apps/web/lib/forms/types.ts
import { z } from 'zod';

/**
 * Discriminated-union Result envelope. Hand-written TS (NOT z.discriminatedUnion)
 * because Zod 4 lost discriminator-type inference on the envelope itself
 * (see colinhacks/zod#5024). Zod is still used for INPUT validation; the
 * envelope shape lives in TS so client narrowing on `state.status` is reliable.
 */
export type FormResult<TData = void> =
  | { status: 'idle' }
  | { status: 'success'; data: TData; message?: string }
  | {
      status: 'error';
      code: FormErrorCode;
      fieldErrors?: Record<string, string[]>;
      formError?: string;
    }
  | { status: 'rate-limited'; retryAfterSeconds: number }
  | { status: 'captcha-failed' };

export type FormErrorCode =
  | 'VALIDATION' // Zod failed
  | 'CSRF' // double-submit / Origin / header check failed
  | 'CAPTCHA' // Turnstile token rejected
  | 'HONEYPOT' // bot trap tripped (returns fake success client-side)
  | 'RATE_LIMIT'
  | 'UPSTREAM' // Rust BFF call failed
  | 'UNKNOWN';

export const IDLE: FormResult = { status: 'idle' };
```

**Why discriminated-union over `{ ok: boolean, errors?: ... }`:** narrowing on `state.status === 'success'` gives compiler-verified access to `state.data`. The flat shape silently loses this on `?.` chains and breeds bugs.

### 2.3 The shared Zod schema

```ts
// apps/web/lib/forms/schemas/contact.ts
import { z } from 'zod';

export const ContactSchema = z.object({
  // D31 PHI guard: explicit field allowlist. Add fields by ADR only.
  name: z.string().trim().min(1, 'Name is required').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email').max(254),
  topic: z.enum(['product', 'press', 'partnership', 'support', 'other']),
  message: z.string().trim().min(10, 'Tell us a bit more').max(2_000),
  // Honeypot — must be empty string when human submits
  website: z.string().max(0, 'Bot detected').optional().default(''),
  // Time-trap — server compares against a signed `_t` cookie set at GET
  _t: z.string().optional(),
  // Triple-layer CSRF (D10 + D53)
  _csrf: z.string().min(32),
  // Turnstile token (D37 + D76)
  cf_turnstile_response: z.string().min(1, 'Verification required'),
});

export type ContactInput = z.infer<typeof ContactSchema>;
```

### 2.4 The Server Action

```ts
// apps/web/lib/forms/actions/submit-contact.ts
'use server';

import { headers, cookies } from 'next/headers';
import { ContactSchema } from '@/lib/forms/schemas/contact';
import type { FormResult } from '@/lib/forms/types';
import { verifyCsrfTriple } from '@/lib/forms/csrf';
import { verifyTurnstile } from '@/lib/forms/turnstile';
import { checkHoneypot, checkTimeTrap } from '@/lib/forms/honeypot';
import { rateLimit } from '@/lib/forms/rate-limit';
import { sanitizeForLog } from '@/lib/observability/sanitize'; // D67 chokepoint
import { logger } from '@/lib/observability/logger';

export async function submitContact(_prev: FormResult, formData: FormData): Promise<FormResult> {
  const h = await headers();
  const c = await cookies();

  // 1. CSRF triple-layer (Origin/Referer + double-submit + X-Quilty-CSRF header).
  //    Native Server Actions also enforce same-host POST (Next.js built-in),
  //    but we belt-and-braces per D53.
  const csrfOk = await verifyCsrfTriple({
    headerToken: h.get('x-quilty-csrf'),
    cookieToken: c.get('__Host-csrf')?.value,
    bodyToken: String(formData.get('_csrf') ?? ''),
    origin: h.get('origin'),
    referer: h.get('referer'),
  });
  if (!csrfOk)
    return { status: 'error', code: 'CSRF', formError: 'Session expired. Refresh and try again.' };

  // 2. Rate limit by IP+route (DynamoDB, D77).
  const ip = h.get('cf-connecting-ip') ?? h.get('x-forwarded-for') ?? 'unknown';
  const limit = await rateLimit({ key: `contact:${ip}`, max: 5, windowSec: 600 });
  if (!limit.ok) return { status: 'rate-limited', retryAfterSeconds: limit.retryAfter };

  // 3. Honeypot + time-trap (always BEFORE Zod — bots don't get error feedback).
  if (checkHoneypot(formData) || !(await checkTimeTrap(formData, c))) {
    // Return FAKE success — never tell the bot it failed.
    logger.info('form.honeypot_tripped', { route: 'contact', ip: sanitizeForLog(ip) });
    return { status: 'success', data: undefined as never };
  }

  // 4. Zod validation.
  const parsed = ContactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      status: 'error',
      code: 'VALIDATION',
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }

  // 5. Turnstile siteverify (server-side; token alone is not trust).
  const tsOk = await verifyTurnstile(parsed.data.cf_turnstile_response, ip);
  if (!tsOk) return { status: 'captcha-failed' };

  // 6. Forward to Rust BFF. Never log PHI (D67 chokepoint).
  try {
    await sendToRustBackend(parsed.data);
    return { status: 'success', data: undefined, message: 'Thanks — we got it.' };
  } catch (err) {
    logger.error('form.upstream_failed', { route: 'contact', err: sanitizeForLog(String(err)) });
    return {
      status: 'error',
      code: 'UPSTREAM',
      formError: 'Something went wrong. Try again in a moment.',
    };
  }
}
```

### 2.5 The Client Component (RHF + useActionState bridge)

```tsx
// apps/web/components/forms/ContactForm.tsx
'use client';

import { useActionState, useEffect, useTransition, useId } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ContactSchema, type ContactInput } from '@/lib/forms/schemas/contact';
import { submitContact } from '@/lib/forms/actions/submit-contact';
import { IDLE, type FormResult } from '@/lib/forms/types';
import { FieldGroup, Field, FieldLabel, FieldError } from '@/components/ui/field';
import { Input, Textarea, Button } from '@/components/ui/...';
import { TurnstileWidget } from './shared/TurnstileWidget';
import { HoneypotField } from './shared/HoneypotField';

export function ContactForm({ csrfToken }: { csrfToken: string }) {
  const [serverState, formAction] = useActionState<FormResult, FormData>(submitContact, IDLE);
  const [isPending, startTransition] = useTransition();
  const liveRegionId = useId();

  const form = useForm<ContactInput>({
    resolver: zodResolver(ContactSchema),
    mode: 'onBlur', // Markus Oberlehner pattern — onBlur, not onSubmit
    defaultValues: {
      name: '',
      email: '',
      topic: 'product',
      message: '',
      website: '',
      _csrf: csrfToken,
      cf_turnstile_response: '',
    },
  });

  // Bridge: server errors -> RHF field state (so AbuseTouched / ariaInvalid sync).
  useEffect(() => {
    if (serverState.status === 'error' && serverState.fieldErrors) {
      for (const [name, msgs] of Object.entries(serverState.fieldErrors)) {
        form.setError(name as keyof ContactInput, { message: msgs[0] });
      }
    }
  }, [serverState, form]);

  const onSubmit = form.handleSubmit((data) => {
    const fd = new FormData();
    Object.entries(data).forEach(([k, v]) => fd.append(k, String(v ?? '')));
    startTransition(() => formAction(fd));
  });

  return (
    <form onSubmit={onSubmit} aria-describedby={liveRegionId} noValidate>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="name">Name</FieldLabel>
          <Input
            id="name"
            autoComplete="name"
            {...form.register('name')}
            aria-invalid={!!form.formState.errors.name}
            aria-describedby="name-error"
          />
          <FieldError id="name-error">{form.formState.errors.name?.message}</FieldError>
        </Field>
        {/* ...email, topic, message... */}
        <HoneypotField register={form.register} />
        <TurnstileWidget onToken={(t) => form.setValue('cf_turnstile_response', t)} />
        <input type="hidden" {...form.register('_csrf')} />
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Sending…' : 'Send'}
        </Button>
      </FieldGroup>
      {/* Live-region for async server messages — WCAG 2.2 AA */}
      <p id={liveRegionId} role="status" aria-live="polite" className="sr-only">
        {serverState.status === 'success' && (serverState.message ?? 'Submitted')}
        {serverState.status === 'error' && (serverState.formError ?? 'Something went wrong')}
        {serverState.status === 'rate-limited' &&
          `Too many attempts. Try again in ${serverState.retryAfterSeconds}s.`}
        {serverState.status === 'captcha-failed' && 'Verification failed. Try again.'}
      </p>
    </form>
  );
}
```

### 2.6 Five non-negotiables embedded above

1. **Single Zod schema both validates Server Action input AND types the form** (no client/server drift — the Conform pitch, achievable in RHF via `zodResolver`).
2. **CSRF triple-layer enforced before any other work** (D10 + D53 alignment).
3. **Honeypot/time-trap before Zod** so bot signals don't leak through error responses (FormShield 2025 best practice).
4. **Fake-success on honeypot trip** — never tell the bot it failed.
5. **`role="status" aria-live="polite"` live region** for async server messages — WCAG 2.2 AA + jsx-a11y/no-autofocus compliant (D22).

---

## 3. CAPTCHA + rate-limit decision

### 3.1 CAPTCHA — Cloudflare Turnstile (confirms D37)

| Vendor                   | EU-friendly                     | Accessibility               | Cost                                   | CSP impact                                                                                                             | Verdict                                                |
| ------------------------ | ------------------------------- | --------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **Cloudflare Turnstile** | Strong (minimal data)           | Best (invisible by default) | Free                                   | `script-src challenges.cloudflare.com`, `frame-src challenges.cloudflare.com`, `connect-src challenges.cloudflare.com` | **PICK**                                               |
| hCaptcha                 | Mixed (cookies require consent) | Weak (image puzzles)        | Free tier + paid                       | Similar CSP footprint                                                                                                  | Reject — accessibility                                 |
| reCAPTCHA v3             | Poor (Google ads ecosystem)     | Weak                        | Paid above 10K/mo (2025 GCP migration) | Heavy Google CSP surface                                                                                               | Reject — Cerebral-style privacy posture                |
| Friendly Captcha         | EU-residency                    | Good                        | Paid €9-29/mo                          | Self-hostable                                                                                                          | Reserve as Phase-2 escape if Turnstile blocks EU users |
| ALTCHA                   | Open source, EU                 | Good                        | Free                                   | Self-hostable                                                                                                          | Defer to trigger                                       |

**Decision rationale:** D37 already locked Turnstile. Round-6 re-confirms — 2026 vendor comparisons (Prosopo, WebSyro, SilentShield) consistently rank Turnstile #1 on the accessibility+privacy+cost-product. The one open risk: Turnstile's invisible mode spams the console with TrustedTypes / xr-spatial-tracking warnings (GitHub cloudflare-docs#30360). Acceptable — it's iframe-internal noise, not a CSP violation in our doc.

**CSP integration (D59 two-tier):**

- **Marketing tier (hash-pinned):** Add `https://challenges.cloudflare.com` to `script-src`, `frame-src`, `connect-src`. The Turnstile loader is a hash-able static script — no nonce needed.
- **Portal tier (nonce + strict-dynamic):** Same hosts; Turnstile is loaded with a `nonce` attribute injected by `proxy.ts`. Watch for the documented "nonce + Turnstile" friction (Cloudflare community threads) — solution is `data-cf-strict-mode` flag.

**csp_evaluator (D73) implication:** Adding `challenges.cloudflare.com` will not trigger HIGH severity. Verified against Google's bypass database — Cloudflare's domain has no known bypass entries.

### 3.2 Rate limit — four-layer defense

| Layer                     | Tool                    | Scope                                                  | When                            |
| ------------------------- | ----------------------- | ------------------------------------------------------ | ------------------------------- |
| **L1 Edge**               | AWS WAF rate-based rule | 2000 req / 5min per IP                                 | M1+1 (D70 already mandates WAF) |
| **L2 Auth-specific edge** | AWS WAF custom rule     | 100 req / 5min per IP on `/api/auth/*`, `/api/forms/*` | M6 (auth integration)           |
| **L3 App-layer per-IP**   | DynamoDB atomic counter | 5 form submits / 10min per IP                          | M2 (first form)                 |
| **L4 App-layer per-user** | DynamoDB atomic counter | Magic-link: 1/60s, 5/hour per email                    | M6                              |

**Rejected: Upstash Redis** — has a BAA but:

- Adds a non-AWS vendor to BAA stack (Quilty already has Sentry, PostHog/Amplitude, Stripe under BAA mgmt). One more vendor = one more SOC-2 attestation to chase.
- Adds a network hop outside our VPC.
- D31 PHI-zero website doesn't need PHI-in-cache anyway, but the BAA pattern matters for the eventual Phase-1 `marketing-prod` account isolation.

**DynamoDB pattern:**

```ts
// apps/web/lib/forms/rate-limit.ts (sketch)
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';

export async function rateLimit({
  key,
  max,
  windowSec,
}: {
  key: string;
  max: number;
  windowSec: number;
}) {
  const now = Math.floor(Date.now() / 1000);
  const windowKey = `${key}:${Math.floor(now / windowSec)}`;
  const ttl = now + windowSec * 2;

  const res = await ddb.send(
    new UpdateItemCommand({
      TableName: process.env.QUILTY_RATELIMIT_TABLE!,
      Key: { pk: { S: windowKey } },
      UpdateExpression: 'ADD #c :one SET #ttl = if_not_exists(#ttl, :ttl)',
      ExpressionAttributeNames: { '#c': 'count', '#ttl': 'expiresAt' },
      ExpressionAttributeValues: { ':one': { N: '1' }, ':ttl': { N: String(ttl) } },
      ReturnValues: 'UPDATED_NEW',
    }),
  );

  const count = Number(res.Attributes?.count?.N ?? 0);
  return count <= max
    ? { ok: true as const }
    : { ok: false as const, retryAfter: windowSec - (now % windowSec) };
}
```

Cost: ~$0.25/M write ops at on-demand pricing. At 1k legit forms/day = $0.0008/day. Acceptable.

---

## 4. Reputation-bootstrap matrix

**Principle:** Reserve broadly (cheap), activate narrowly (compound effort). Premature presence on a platform you can't maintain is worse than no presence — dead Twitter feeds hurt brand more than absence.

| Asset                                   | Cost                 | When to reserve                         | When to activate                         | Compounding value             | Decision             |
| --------------------------------------- | -------------------- | --------------------------------------- | ---------------------------------------- | ----------------------------- | -------------------- |
| **Twitter/X @quilty**                   | $0                   | M1+2 (now)                              | M3 (identity discovery)                  | Mod                           | RESERVE              |
| **LinkedIn /company/quilty**            | $0                   | M1+2                                    | M5 (B2B portal)                          | High                          | RESERVE              |
| **Threads @quilty**                     | $0                   | M1+2                                    | M3                                       | Mod                           | RESERVE              |
| **Instagram @quilty**                   | $0                   | M1+2                                    | M4 (visual identity)                     | Mod (B2C health)              | RESERVE              |
| **TikTok @quilty**                      | $0                   | M1+2                                    | M4                                       | High (Calm/Headspace pattern) | RESERVE              |
| **YouTube /@quilty**                    | $0                   | M1+2                                    | M3 (founder vlogs?)                      | High                          | RESERVE              |
| **Pinterest /quilty**                   | $0                   | M1+2                                    | M8+ if traffic warrants                  | Low                           | RESERVE              |
| **Reddit /r/quilty**                    | $0                   | M1+2                                    | Defer — high mod overhead                | High when active              | RESERVE-don't-launch |
| **Bluesky @quilty.com (custom domain)** | $0 (uses our DNS)    | M1+2 — set up TXT record now            | M3                                       | High in tech press            | RESERVE              |
| **Mastodon @quilty@m.q.com self-host**  | ~$10/mo for instance | M5+                                     | M5+                                      | Low                           | DEFER                |
| **Facebook /quilty**                    | $0                   | M2                                      | Probably never (Gen-Z target doesn't FB) | Low                           | RESERVE-then-dormant |
| **GitHub /quilty**                      | $0                   | M1+2 — needed anyway for OSS            | M1 (today)                               | High in dev hiring            | ACTIVATE             |
| **Substack @quilty**                    | $0                   | M1+2                                    | M9+ (blog migration trigger)             | Mod                           | RESERVE              |
| **Product Hunt /quilty**                | $0                   | M1+2 (just the maker profile)           | M8 (launch day)                          | High at launch only           | RESERVE              |
| **Indie Hackers /quilty**               | $0                   | Skip — not the consumer-health audience | —                                        | Low                           | SKIP                 |
| **HN "Show HN"**                        | $0                   | Personal accounts                       | M8 launch                                | Variable                      | NOT-A-RESERVATION    |
| **Discord server**                      | $0                   | DEFER — mod overhead vs Cal.com pattern | M9+                                      | High when active              | DEFER                |
| **Slack community**                     | $0                   | DEFER — same                            | M9+                                      | High when active              | DEFER                |

**Press kit / media kit:** Build at M5 (when there's a real product to photograph). Includes: 1) Logo SVG + PNG @ 3 sizes, 2) Brand color palette + Tailwind tokens (from D17), 3) Product screenshots (3-5), 4) Founder bio + headshot (200 words), 5) One-paragraph + one-page company description, 6) Fact sheet (HQ, founded, employees, funding), 7) Press contact email (`press@my-quilty.com`). Host at `/press` (already U2-reserved).

**Reviews / trust badges (DEFER):**

| Asset                  | When            | Trigger                 | Risk if premature                                                                                 |
| ---------------------- | --------------- | ----------------------- | ------------------------------------------------------------------------------------------------- |
| Trustpilot embed       | M8+             | 25+ verified reviews    | Visible "no reviews yet" hurts trust                                                              |
| G2 / Capterra          | M9+ B2B trigger | B2B sales motion exists | B2C target audience doesn't G2                                                                    |
| App Store rating embed | M5+             | Mobile app rating ≥ 4.5 | App Store changes weekly                                                                          |
| HIPAA-compliant badge  | **NEVER**       | —                       | **Cerebral $7M lesson** — can't claim without BAA + audit; "HIPAA-aligned" is the most we can say |
| Norton/McAfee Secure   | NEVER           | —                       | Theatre; no credibility in 2026                                                                   |
| TRUSTe / TrustArc      | M8+             | Real privacy program    | Adds compliance burden                                                                            |
| BBB Accredited         | Skip            | —                       | Pay-to-play, no consumer signal                                                                   |
| SOC 2 Type II badge    | M9+             | Audit complete          | Real signal, when earned                                                                          |

**Schema.org AggregateRating implication:** Already locked in `lib/seo/schemas.ts` (SoftwareApplication). **Do NOT populate `aggregateRating` until visible reviews exist on-page** — Google's quality guideline requires the rating to reflect content actually visible to users. Add at M8 with Trustpilot widget + on-page review carousel + schema simultaneously.

**Customer logo wall:** M5+ at `/customers` (U2-reserved). Trigger: 3 logos with written permission. Risk of starting too early: visible "case studies coming soon" placeholders are worse than no section.

**Awards:** Document aspirational list in `docs/strategy/awards_aspiration.md` (not yet created). Surface when won. Webby + Apple Design Award + Fast Company Innovation = north star. Position at footer + dedicated `/press` page when accumulated.

**Brand-monitoring alerts:** Set up Google Alerts for `"Quilty"` + `"my-quilty"` at M1+2 (free, takes 2min). Defer Mention.com / Brand24 (paid) to M5+.

**Founder presence:** Calm/Headspace pattern (founders not publicly central) > Plain/Resend/Linear pattern (founder-as-brand). Quilty is consumer-health where trust is brand-mediated, not founder-mediated. Decision: founder Twitter activates at M3, no Founder Mode at M1.

---

## 5. Forms inventory + per-form requirements

| #   | Form                         | Milestone | CAPTCHA                   | Honeypot+Time         | Rate limit     | Auth req            | Special                                  |
| --- | ---------------------------- | --------- | ------------------------- | --------------------- | -------------- | ------------------- | ---------------------------------------- |
| 1   | Contact `/contact`           | M2        | Yes                       | Yes                   | 5/10min/IP     | No                  | Topic enum                               |
| 2   | Waitlist `/waitlist`         | M3        | Yes                       | Yes                   | 3/hour/IP      | No                  | Email-only, double-opt-in                |
| 3   | Newsletter (footer)          | M3        | Yes (low-friction config) | Yes                   | 5/hour/IP      | No                  | Single field                             |
| 4   | Demo request `/for-business` | M5        | Yes                       | Yes                   | 3/day/IP       | No                  | B2B fields                               |
| 5   | Sign-in                      | M6        | Yes on >3 fails           | No (auth has Cognito) | 10/hour/IP     | —                   | Cognito Managed Login (D6)               |
| 6   | Sign-up                      | M6        | Yes                       | Yes                   | 5/hour/IP      | —                   | Email verification                       |
| 7   | Password reset               | M6        | Yes                       | Yes                   | 3/hour/email   | No                  | Magic-link rate-limit                    |
| 8   | Email change                 | M6        | No (logged-in)            | No                    | 3/day/user     | Yes + step-up (D54) | Old + new email                          |
| 9   | Account delete               | M6        | No                        | No                    | 3/day/user     | Yes + step-up       | Reason enum (D31)                        |
| 10  | Stripe payment               | M7        | Stripe's own              | No                    | Stripe's own   | Yes                 | Elements iframe — separate CSP allowance |
| 11  | Support ticket (in-portal)   | M7        | No (logged-in)            | No                    | 10/day/user    | Yes                 | PHI-zero per D31                         |
| 12  | Feedback widget              | M7        | No (in-app)               | No                    | 10/day/user    | Yes                 | Optional                                 |
| 13  | NPS / CSAT                   | M8        | No                        | No                    | 1/quarter/user | Yes                 | Likert + free-text                       |

**Rule of thumb:** Public + unauthenticated = full bot stack. Authenticated + portal = trust the session, rate-limit only.

**Magic-link form pattern (form #7):**

```
1 link per 60s per email
5 links per hour per email
3 links per hour per IP (per email-domain)
Token TTL 10min, single-use, server-side DynamoDB store
Bind to client fingerprint (User-Agent hash) — reject if mismatch
```

This mirrors Cal.com / Plain / Resend's 2026 patterns. Email infrastructure (Resend or SES) decision out of scope (Agent E).

---

## 6. Form analytics

**Pattern (D79 proposed):** Field-level analytics fires events on `onBlur` per field — **never with the field value**, only the field name and "completed-without-error" / "error-shown" / "abandoned" signal. PII never enters the event payload.

```ts
// EXAMPLE — what to emit
analytics.track('form.field.completed', { form: 'contact', field: 'email' }); // OK
analytics.track('form.field.error', { form: 'contact', field: 'email', code: 'INVALID_FORMAT' }); // OK
analytics.track('form.submitted', { form: 'contact', success: true, durationMs: 14_200 }); // OK
// FORBIDDEN
analytics.track('form.field.completed', { form: 'contact', field: 'email', value: 'a@b.c' }); // BAN
```

ESLint rule: ban any string property in form-analytics calls. Codify in `eslint-rules/no-pii-in-form-events.cjs` at M2.

Funnel events to wire (Amplitude per D42b revert):

- `form.viewed` — when form mounts
- `form.started` — first field focus
- `form.field.error` — per-field validation fail
- `form.submitted` — terminal (success or hard-fail)
- `form.abandoned` — visibility-change while in-progress, post-mount > 5s

Field-level abandonment Amplitude funnel: `viewed → started → submitted`. Drop-off between any two steps surfaces friction. Hotjar / FullStory rejected — session replay with PII risk, already addressed by Sentry replay (D42a) with mask-all default (D40).

---

## 7. Gap list classified

### TIER A — M1.5 (before any real form ships, ~2 sprint window before M2)

| #   | Gap                                                                                 | Why M1.5                                                        | Effort           |
| --- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------- | ---------------- |
| A1  | Adopt React Hook Form 7 + `@hookform/resolvers/zod`                                 | First-form grandfather effect                                   | 1d               |
| A2  | Land `lib/forms/types.ts` + `FormResult<T>` envelope                                | Locks the shape                                                 | 0.5d             |
| A3  | Land `lib/forms/csrf.ts` triple-layer (D10/D53)                                     | Required before ANY action                                      | 1d               |
| A4  | Land `lib/forms/turnstile.ts` server siteverify                                     | Pair with D37 lock                                              | 0.5d             |
| A5  | Land `lib/forms/honeypot.ts` (field + time-trap helpers)                            | Free 80-99% bot reduction                                       | 0.5d             |
| A6  | Land `lib/forms/rate-limit.ts` (DynamoDB)                                           | Need by first form                                              | 1d (+ SST table) |
| A7  | Update CSP (D59) to allow `challenges.cloudflare.com` on `script/frame/connect-src` | Turnstile blocks otherwise                                      | 0.5d             |
| A8  | Adopt shadcn `<Field>` primitives (Oct 2025 redesign)                               | New shadcn pattern; current `<Form>` is RHF-wrapper-as-fallback | 1d               |
| A9  | Reserve 12 social handles per matrix §4                                             | Squatter prevention                                             | 2h               |
| A10 | Set Google Alerts for "Quilty" / "my-quilty.com"                                    | Free brand monitoring                                           | 5min             |

### TIER B — Mx (paired with the milestone they unlock)

| #   | Gap                                                     | Milestone |
| --- | ------------------------------------------------------- | --------- |
| B1  | Magic-link rate-limit table + Argon2id token hash       | M6        |
| B2  | Stripe Elements CSP allowance (separate from Turnstile) | M7        |
| B3  | Support-ticket form with PHI sanitizer chokepoint (D67) | M7        |
| B4  | NPS/CSAT in-portal widget                               | M8        |
| B5  | Trustpilot embed + AggregateRating schema population    | M8        |
| B6  | Customer logo wall at `/customers`                      | M5        |
| B7  | Press kit at `/press`                                   | M5        |
| B8  | Founder Twitter activation + brand-voice playbook       | M3        |
| B9  | AWS WAF `/api/auth/*` per-route limit (100/5min/IP)     | M6        |

### TIER C — SKIP

| #   | Gap                                      | Why skip                                                                                      |
| --- | ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| C1  | Akismet / OOPSpam / CleanTalk            | Turnstile + honeypot + WAF + DynamoDB rate-limit covers our spam profile; one less vendor BAA |
| C2  | Conform                                  | RHF wins on shadcn ecosystem + dynamic-field/multi-step ergonomics                            |
| C3  | Upstash Redis                            | DynamoDB sufficient and HIPAA-account-native                                                  |
| C4  | TanStack Form                            | Smallest bundle but no shadcn ecosystem; revisit if RHF re-renders become hot path            |
| C5  | reCAPTCHA / hCaptcha                     | Accessibility + privacy losers vs Turnstile                                                   |
| C6  | Norton/McAfee/BBB badges                 | No credibility in 2026; theatre                                                               |
| C7  | Reddit /r/quilty community launch pre-M9 | Mod-overhead-to-value ratio terrible at low volume                                            |
| C8  | Discord/Slack community pre-M9           | Same                                                                                          |
| C9  | Mastodon instance self-hosting           | $10/mo + ops overhead; defer to trigger                                                       |
| C10 | accessiBe / UserWay / overlays           | CLAUDE.md "NEVER" rule, FTC settlement Apr 2025                                               |

---

## 8. Conflicts with existing D-decisions

**No hard conflicts.** The recommendations confirm and tighten existing decisions:

| D    | How Round-6 interacts                                                                                                         |
| ---- | ----------------------------------------------------------------------------------------------------------------------------- |
| D10  | Confirms — triple-layer CSRF wiring shown in §2.4                                                                             |
| D17  | Confirms — Tailwind v4 + shadcn `<Field>` primitives (Oct 2025 redesign awareness)                                            |
| D18  | Confirms — `TurnstileWidget` / `HoneypotField` are app-layer wraps in `components/forms/shared/`, never edit shadcn primitive |
| D31  | Confirms — PHI guard on every form schema; reason-enum for account-delete already foreseen                                    |
| D37  | Re-confirms Turnstile + WAF; adds DynamoDB rate-limit + honeypot/time-trap                                                    |
| D42b | Aligns — Amplitude form events with no-PII rule (§6)                                                                          |
| D53  | Confirms — CSRF triple-layer encoded in canonical pattern                                                                     |
| D59  | Tightens — Turnstile CSP allowances scoped per tier                                                                           |
| D67  | Confirms — PHI sanitizer wraps all log emissions in actions                                                                   |
| D70  | Reuses — WAF already mandated; we add the rate-based rules                                                                    |
| D73  | Verifies — Turnstile domain not in csp_evaluator HIGH-severity bypass DB                                                      |

**Soft tension:** D49 (locked `packages/ui`) was already overridden by D69. Forms infrastructure goes in `apps/web/lib/forms/` for M2-M9; if extracted to `packages/forms` later, it's an explicit migration (and easy because the schema/action/component layers are already cleanly separated).

---

## 9. Recommended new D-decisions

### D75 — Form canonical pattern: RHF + Zod + Server Actions + shadcn `<Field>`

> **Locked:** Forms use React Hook Form 7.x (`mode: 'onBlur'`) + `@hookform/resolvers/zod` + Zod 3.25 single-source-of-truth schema + Next.js 16 Server Action (`'use server'`) + `useActionState` for server bridge + `useTransition` for pending UI + shadcn `<Field>`/`<FieldGroup>` primitives (Oct 2025 redesign). All actions return `FormResult<T>` discriminated union from `lib/forms/types.ts`.
>
> **Rationale:** RHF's 12M weekly downloads = ecosystem gravity; shadcn supports it natively; uncontrolled-input perf wins on multi-field forms (Stripe Elements, signup with 6+ fields); `onBlur` validation lets server action remain authoritative; useActionState/useTransition bridge surfaces server errors without losing pending-UI parity. Conform's progressive-enhancement strength does not outweigh the ecosystem disadvantage for a logged-in-portal app where JS is always present. Discriminated-union envelope captures success/error/rate-limited/captcha-failed states with compiler-verified narrowing.

### D76 — Bot mitigation triad: Turnstile + honeypot + time-trap

> **Locked:** Every public unauthenticated form (Contact, Waitlist, Newsletter, Demo, Sign-up, Password-reset) carries all three: (a) Cloudflare Turnstile widget with server-side `siteverify`, (b) honeypot text field with realistic name (`website`, `phone_confirm`), non-inline CSS hidden via external stylesheet, `autocomplete="off"` + `tabindex="-1"`, (c) signed time-trap cookie (`__Host-form-t`) checked server-side with 3s min / 30min max thresholds. Honeypot/time-trap trip returns FAKE success — never reveals detection.
>
> **Rationale:** Turnstile alone catches sophisticated bots; honeypot/time-trap together catch 80-99% of dumb spam at zero user friction (FormShield 2025 benchmarks). Belt-and-braces because Turnstile's invisible mode can false-positive privacy-tooling-heavy legit users — honeypot/time-trap give defense-in-depth without adding visible friction.

### D77 — Rate limiting: DynamoDB-backed application layer; reject Upstash

> **Locked:** Per-route/per-identifier rate limiting via DynamoDB atomic counter with TTL auto-cleanup. Table `quilty-form-ratelimits` (on-demand pricing). AWS WAF rate-based rules at edge (2000/5min/IP global, 100/5min/IP on `/api/auth/*` and `/api/forms/*`). NO Upstash Redis adoption.
>
> **Rationale:** DynamoDB is already in our HIPAA-account stack (sessions per D51); adding Upstash means another BAA, another vendor SOC-2 to chase, another network hop. Upstash latency advantage (~1-5ms vs ~5-15ms DynamoDB) is irrelevant on a 100-300ms form-submit round-trip. AWS WAF rate-based rules cover crude IP-abuse at edge; DynamoDB covers fine-grained per-user/per-email limits at the app layer.

### D78 — Reputation bootstrap: reserve 12 handles at M1+2, activate per milestone

> **Locked:** At M1+2 reserve 12 social handles (Twitter/X, LinkedIn, Threads, Instagram, TikTok, YouTube, Pinterest, Reddit, Bluesky via custom domain `@quilty.com`, Facebook, GitHub-org, Substack, Product Hunt). Activation timeline per matrix in `docs/strategy/reputation_bootstrap.md` (to be created). Mastodon deferred (cost+ops); Discord/Slack deferred (mod-overhead); founder presence stays low until M3.
>
> **Rationale:** Squatter prevention is the cheap-and-compounding play. Activation cost (content + community + moderation) is the real bottleneck — match it to milestone capacity. Calm/Headspace founder-not-central pattern matches consumer-health brand trust; Plain/Linear founder-mode is dev-tools-specific.

### D79 — Form analytics: zero PII in event payloads; field-name-only signals

> **Locked:** Form analytics events emit field NAME + outcome (`completed`, `error`, `abandoned`) only — never field VALUE. ESLint custom rule (`no-pii-in-form-events`) bans any `value` or non-allowlisted string property in `analytics.track('form.*', ...)` calls. Funnel events: `form.viewed`, `form.started`, `form.field.completed`, `form.field.error`, `form.submitted`, `form.abandoned`. Amplitude is the only destination (mobile parity per D42b revert).
>
> **Rationale:** Mindbloom-style "marketing pixels fire on form completion" is the Cerebral $7M failure mode. ESLint chokepoint mirrors D67's PHI sanitizer architecture — single chokepoint, not call-site discipline. Field-level Amplitude funnels still surface drop-off + friction without needing the values themselves.

---

## 10. Open scope questions

These need explicit user-decision before form #1 ships. Recommended defaults shown but not locked.

1. **Email infrastructure for forms (Resend vs SES vs Postmark).** Agent E (external integrations) scope, but blocks Contact form completion. Suggested default: AWS SES for in-account simplicity; Postmark only if transactional-deliverability scores diverge in M2 testing.

2. **Magic-link policy at M6.** Does Cognito Managed Login's native passwordless cover the surface, or do we still mint our own magic-links via the BFF? D6 says Managed Login; this Round-6 audit defers — owned-mint preserves UX control but adds attack surface.

3. **Waitlist double-opt-in vs single-opt-in.** EU/GDPR strict reading = double; US-only product is single-acceptable. Recommend double from day one to avoid the migration pain later (matches Headspace/Calm pattern).

4. **Account-delete reason-enum exact values.** D31 PHI-zero website + sensitive nature → enum must avoid medical/diagnostic free-text. Suggested: `['no_longer_needed', 'too_expensive', 'switching_alternative', 'privacy_concerns', 'difficult_to_use', 'other']` — with free-text `other_detail` allowed only when `other` selected and explicitly PHI-screened. ADR-grade decision.

5. **Field-level analytics scope at M2.** Do we wire field-level events from form #1 (Contact), or defer to M5+? Engineering effort: ~1d for the wrapper, ~0d per subsequent form. Recommended: wire from form #1 — the analytics envelope grandfathers same as the form pattern.

6. **CMS form configuration trigger (D30).** When/if Sanity/Contentful migration happens, do form schemas live in the CMS or stay in `lib/forms/schemas/`? Recommend keep in code — Zod schemas are TS, CMS is content. The CMS may parameterize labels/help-text but never validation.

7. **Customer-logo permission process.** When marketing claims "Trusted by [logos]" — what's the IP review? Pre-emptive question, M5 trigger.

8. **GitHub-org private vs public default.** `github.com/quilty` org needed for D26 OpenAPI codegen + reputation. M1+2 reservation = private until first OSS publication ≈ M9+.

---

**Word count:** ~3,650 words. Output complete.

---

## Sources

### Forms + Server Actions

- [Best Next.js form library in 2026: a fair comparison — splitforms](https://splitforms.com/blog/best-nextjs-form-library-2026)
- [Using react-hook-form with React 19, useActionState, and Next.js 15 App Router — Markus Oberlehner](https://markus.oberlehner.net/blog/using-react-hook-form-with-react-19-use-action-state-and-next-js-15-app-router)
- [Next.js Server Actions: The Complete Guide (2026) — Makerkit](https://makerkit.dev/blog/tutorials/nextjs-server-actions)
- [Next.js docs — Forms with Server Actions](https://nextjs.org/docs/app/guides/forms)
- [Conform — Overview](https://conform.guide/)
- [shadcn/ui — React Hook Form](https://ui.shadcn.com/docs/forms/react-hook-form)
- [shadcn/ui — Form discussion #9505 (Oct 2025 redesign)](https://github.com/shadcn-ui/ui/discussions/9505)
- [Form Patterns and Validation — DeepWiki](https://deepwiki.com/shadcn-ui/ui/9.3-form-patterns-and-validation)
- [How do I handle Zod validation errors with useActionState — Next.js #86447](https://github.com/vercel/next.js/discussions/86447)
- [Combine useActionState with React Hook Form and Zod](https://medium.com/@destiya.dian/combine-useactionstate-with-react-hook-form-and-zod-209cdec12b08)
- [Zod #5024 — Discriminated union discriminator no longer generic in V4](https://github.com/colinhacks/zod/issues/5024)

### CSRF + Security

- [Next.js docs — Data Security](https://nextjs.org/docs/app/guides/data-security)
- [Next.js Security Best Practices: Complete 2026 Guide — Authgear](https://www.authgear.com/post/nextjs-security-best-practices/)
- [csrf-armor/nextjs](https://www.npmjs.com/package/@csrf-armor/nextjs)
- [edge-csrf](https://github.com/amorey/edge-csrf)

### CAPTCHA

- [Cloudflare Turnstile — Content Security Policy](https://developers.cloudflare.com/turnstile/reference/content-security-policy/)
- [Cloudflare Turnstile docs (llms-full)](https://developers.cloudflare.com/turnstile/llms-full.txt)
- [Turnstile vs reCAPTCHA vs hCaptcha (2026) — SilentShield](https://silentshield.io/en/blog/turnstile-vs-recaptcha-vs-hcaptcha)
- [hCaptcha vs Cloudflare Turnstile (2026) — Websyro](https://www.websyro.com/blogs/hcaptcha-vs-cloudflare-turnstile-2026-comparison)
- [Top Cloudflare Turnstile Alternatives in 2026 — Prosopo](https://prosopo.io/blog/top-cloudflare-turnstile-alternatives/)
- [Cloudflare CAPTCHA Alternatives 2026 Enterprise Guide — TrustComponent](https://www.trustcomponent.com/en/products/captcha/comparison/cloudflare-turnstile-alternatives)

### Honeypots + Bot mitigation

- [Form Honeypot Fields: Implementation Guide and Best Practices — FormShield](https://formshield.dev/blog/form-honeypot-implementation-guide)
- [How to stop bots with honeypots — WorkOS](https://workos.com/blog/stop-bots-with-honeypots)
- [Building a Honeypot Field That Works — CSS-Tricks](https://css-tricks.com/building-a-honeypot-field-that-works/)
- [Anti-Spam Honeypots & Modern Bot Protection — DataDome](https://datadome.co/guides/captcha/honeypot/)

### Rate limiting

- [AWS WAF — Rate-based rule statements](https://docs.aws.amazon.com/waf/latest/developerguide/waf-rule-statement-type-rate-based.html)
- [Rate Limiting Your Serverless Applications — Upstash](https://upstash.com/blog/serverless-rate-limiting)
- [AWS Lambda Rate Limiting with Serverless Redis — Upstash](https://upstash.com/docs/redis/tutorials/rate-limiting)
- [Implement API Rate Limiting with API Gateway and WAF — OneUptime](https://oneuptime.com/blog/post/2026-02-12-implement-api-rate-limiting-with-api-gateway-and-waf/view)

### Spam detection

- [Akismet Alternatives — OOPSpam](https://www.oopspam.com/blog/best-akismet-alternatives)
- [CleanTalk Alternatives — OOPSpam](https://www.oopspam.com/blog/best-cleantalk-alternatives)

### Reputation + reviews

- [When to Use Trustpilot vs Google Reviews (2026)](https://www.reviewflowz.com/blog/trustpilot-vs-google-reviews)
- [Review Schema Guide — Brandstory](https://www.brandstory.ae/blogs/review-schema-guide-how-to-use-review-and-rating-structured-data/)
- [Schema.org AggregateRating](https://schema.org/AggregateRating)
- [Bluesky vs Threads: A Complete 2026 Comparison — Lovable](https://lovable.dev/guides/bluesky-vs-threads)
- [EFF — How to Link Your Mastodon, Bluesky, or Other Federated Accounts](https://www.eff.org/deeplinks/2026/04/bridge-somewhere-how-link-your-mastodon-bluesky-or-other-federated-accounts)

### Analytics + privacy

- [How Amplitude computes funnels](https://amplitude.com/docs/analytics/charts/funnel-analysis/funnel-analysis-how-amplitude-computes)
- [Funnel Drop-Off Guide — Amplitude](https://amplitude.com/explore/analytics/funnel-drop-off)
- [Making AI Analytics Safe for Financial Services — Amplitude](https://amplitude.com/blog/financial-services-ai)

### Consumer-mental-health peer comparison

- [Mindbloom Privacy Policy](https://www.mindbloom.com/privacy-policy)
- [Mindbloom Consumer Health Data Privacy Policy](https://www.mindbloom.com/consumer-health-data-privacy-policy)
- [Is Headspace HIPAA compliant? (2025 update) — Paubox](https://www.paubox.com/blog/is-headspace-hipaa-compliant-2025-update)
- [Therapy by Headspace launch (June 2025)](https://www.headspace.com/articles/headspace-launches-direct-to-consumer-mental-health-service)
