# `apps/web/lib/billing/` — Stripe + subscription state

Reserved location for the Stripe-side billing surface. Empty until the subscription-integration milestone lands.

## Shape (when populated)

```
billing/
├── README.md                (this file)
├── stripe-client.ts         Stripe SDK init wrapper (the one place @stripe/* is imported in apps/web)
├── verify-webhook.ts        constructEvent + raw-body extraction (called inline from app/api/webhooks/stripe/route.ts)
├── idempotency.ts           DDB-backed dedup with TTL — only for non-idempotent side effects
├── dispatch.ts              EventBridge fan-out wrapper — verified webhook events → Rust consumer
├── checkout.ts              checkout-session creation helpers (consumed by Server Actions)
└── portal.ts                customer-portal session helpers
```

The Stripe SDK is consumed only here. Vendor-name discipline (META-1) restricts the literal `stripe`/`@stripe/*` import to this directory.

## Shape rationale (from R2 Wave-1-close research synthesis)

The convergent webhook pattern across Vercel sample apps + Cal.com + Trigger.dev + Inngest:

1. **Receiver-side dedup table is absent.** Almost no production codebase implements DDB/Postgres-backed event-ID dedup at the receiver layer. The convergent pattern is vendor-token-as-key + database upsert/conditional-write, NOT a separate `processed_events` table.
2. **Dedicated dedup table reserved for non-idempotent side effects** (sending emails, charging cards, triggering external systems). When that need arises, `idempotency.ts` provides a DDB `attribute_not_exists(event_id)` conditional put with 30-45 day TTL.
3. **Route handler is a thin token-broker** — verify signature, Zod-validate body, dispatch to EventBridge. Real business logic happens in the Rust consumer.
4. **2xx response even on logical failures** (after signature verification passes) — prevents Stripe retry storms.

## Discipline

- **`import 'server-only'`** at every file.
- **No raw `stripe` imports outside this directory** — enforced by ESLint `no-restricted-imports` allowlist + dep-cruiser `no-direct-vendor-sdk-outside-adapter-chokepoint`.
- **No PHI in Stripe metadata fields** — the Stripe BAA scope covers payment-card + payment-metadata, NOT healthcare PHI per the M1.5 close BAA inventory. Stripe `metadata.*`, product names, statement descriptors must never carry clinical content.
- **Webhook signature verification ALWAYS extracted to `verify-webhook.ts`**, never inline in the Route Handler.

## References

- ADR-0008 (modular monolith — Stripe code stays in `apps/web/lib/billing/` until a second consumer demands extraction to `@quilty/billing`)
- D44 (Stripe-only billing; mobile uses RevenueCat IAP through a separate code path)
- `docs/runbook/baa-inventory.md` — Stripe BAA status + scope clarification
