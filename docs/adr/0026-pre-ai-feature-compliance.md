# ADR-0026: Pre-AI feature compliance shape — AI-coach safety middleware contract + training-data consent + provider neutrality + crisis-resource fallback

- **Status:** Accepted
- **Date:** 2026-05-28
- **Last reviewed:** 2026-05-28
- **Deciders:** Volodymyr Petrychenko
- **Originating discussion:** 2026-05-28 multi-agent research pass + reconciliation lock. The vaping cessation peer canon (Pivot, Pelago, 2Morrow, EX Program) signals that AI-coach features are inevitable at M5+; the FTC Operation AI Comply (Sept 2024) + FTC AI + health-data blog (Jan 2025) + ongoing state CHD law amendments (WA AG MHMDA AI interpretation, MD MODPA AI provisions) make the contract locked-down now a structural prerequisite rather than a post-hoc retrofit. Locking the shape at M1.6 means M5+ AI work plugs into a contract that already satisfies regulators.
- **Related decisions:** D31 (zero PHI in website runtime), D32 (CSP), D35 (ConsentState), D67 (PHI sanitizer chokepoint), D113 (8-piece form pattern), D148 (PHI-in-error ESLint), **D178b** (this ADR's canonical decision)
- **Related ADRs:** [ADR-0013](0013-phi-scrubber-port.md), [ADR-0021](0021-workflow-engine-port.md), [ADR-0023](0023-vaping-cessation-regulatory-classification.md), [ADR-0024](0024-multi-state-chd-posture.md), [ADR-0025](0025-cessation-data-retention.md)
- **Software versions assumed:** Next.js 16, React 19, TypeScript 5.7 strict — port shape only; provider SDKs (Anthropic, OpenAI, AWS Bedrock) locked at M5+ activation

## Context

Vaping cessation peers ship AI-coach features:

- **Pivot Breathe** — AI conversational coach in-app
- **Pelago (Quit Genius)** — clinical-tier AI triage
- **2Morrow Health** — ACT-based AI coaching modules
- **EX Program (Truth Initiative)** — under exploration per Truth Initiative 2025 roadmap

Quilty's M5+ roadmap reserves space for AI coach + AI craving-prediction + AI content personalization. Without a locked-down contract at M1.6, AI features at M5+ will repeat the failure modes of:

1. **BetterHelp $7.8M FTC (Mar 2023)** — sharing health data with Meta + Pinterest for ad-targeting without explicit consent. Translates to AI: training data crossing the consent boundary.
2. **Cerebral $7M FTC (Apr 2024)** — retained data + shared with advertisers + deceptive cancellation. Translates to AI: training data retained beyond purpose, used without opt-in.
3. **FTC Operation AI Comply (Sept 2024)** — sweeping enforcement against deceptive AI claims (DoNotPay, Rytr, others). Translates to AI: "AI coach" / "AI doctor" / "evidence-based AI" without substantiation = §5 exposure.
4. **FTC blog Jan 2025 on AI + health data** — explicitly flags AI training on health data as triggering CHD consent requirements.
5. **WA AG 2025 MHMDA guidance on inferences** — AI-generated inferences from CHD are themselves CHD; subject to MHMDA + PROA + statutory damages.
6. **MD MODPA AI provisions** — automated decision-making in sensitive categories (substance-use treatment adjacency) requires opt-in + human-review-on-request.
7. **Replika lawsuit (Italy 2024)** + **Character.AI lawsuit (US 2024)** — AI conversational agents causing harm to users in sensitive contexts; mounting precedent for AI-coach safety floor.

The vaping cessation context adds a specific high-risk surface: **crisis adjacency**. Cessation users in withdrawal can present with depression, suicidal ideation, panic, or relapse-trigger conversations that an AI coach is structurally incompetent to handle. ADR-0023 dropped crisis-keyword pinning from search because Quilty is not a mental-health product — but the AI-coach surface re-introduces the same risk vector through a different channel: a user asking the coach an emotionally-loaded question that triggers an inappropriate AI response.

**The Character.AI precedent makes this load-bearing:** the lawsuit alleged AI conversational agents engaged in self-harm-encouragement dialogues with minors. Vaping cessation users in nicotine withdrawal are a high-vulnerability population; any AI surface must have a structural floor that detects the crisis-adjacent conversation + redirects to verified crisis resources (988 Suicide & Crisis Lifeline; 1-800-QUIT-NOW; Crisis Text Line) before the AI can respond.

**Provider neutrality is also critical.** Quilty's AI stack should not be locked to one provider (Anthropic / OpenAI / AWS Bedrock / Google Vertex) — provider pricing + capability + BAA availability changes quarterly. A port-adapter shape (matching D9 / ADR-0017 / ADR-0021 canon) keeps the swap surface clean.

The "do nothing" outcome: M5+ AI feature work directly imports `@anthropic/sdk` or `openai` in a Server Component → no PHI sanitizer chokepoint → no consent gate → no crisis-resource fallback → no training-data opt-in → no provider-neutral seam. First user reports a bad AI interaction → Replika/Character.AI-style lawsuit + FTC §5 + MHMDA PROA + MODPA AG action. The architectural rework to retrofit a safety middleware mid-feature costs 10× more than the contract-lock now.

## Decision

**Quilty locks the AI-feature port-adapter shape at M1.6 (specification + no-op adapter only; no runtime SDK shipped) with five contract invariants: (1) PHI sanitizer chokepoint on all I/O, (2) explicit per-feature opt-in for training data flow via ConsentState, (3) provider-neutral port with at-least-two-adapter contract test (in-memory fake + named provider stub), (4) mandatory crisis-resource fallback middleware on any conversational surface, and (5) deceptive-claim guardrails via the ADR-0023 marketing-copy lint extended to AI feature descriptions.**

### Decision A — AICoach port shape (locked)

New workspace package `packages/ai-coach/` (skeleton at M1.6; full implementation at M5+) with the port:

```ts
export interface AICoach {
  readonly converse: (
    input: AICoachInput,
    opts?: { readonly signal?: AbortSignal; readonly maxTokens?: number },
  ) => Promise<AICoachResponse>;

  readonly summarize: (
    input: AICoachSummarizeInput,
    opts?: { readonly signal?: AbortSignal },
  ) => Promise<AICoachSummary>;

  readonly classify: (
    input: AICoachClassifyInput,
    opts?: { readonly signal?: AbortSignal },
  ) => Promise<AICoachClassification>;
}

export interface AICoachInput {
  readonly conversation_id: string; // ULID; references DynamoDB conversation record
  readonly user_id: string;
  readonly turn: AICoachTurn;
  readonly context: AICoachContext; // sanitized; PHI sanitizer applied before reaching adapter
  readonly safety_floor: 'strict' | 'relaxed'; // strict for crisis-adjacent; relaxed for habit-tracking
}

export interface AICoachResponse {
  readonly conversation_id: string;
  readonly turn: AICoachTurn;
  readonly safety_action:
    | 'pass'
    | 'crisis_redirect' // crisis-resource fallback triggered; AI response suppressed
    | 'pii_redaction_required' // user shared PHI; ConversationStore must redact before storage
    | 'content_policy_violation'; // provider policy violation; logged + escalated
  readonly attribution: AICoachAttribution; // provider, model, prompt-id, version
}
```

### Decision B — PHI sanitizer chokepoint on all I/O

**Every AI port method runs input + output through the PHI sanitizer (D67 + ADR-0013).** No exceptions. The composition root wires the sanitized variant; direct provider SDK access outside `packages/ai-coach/src/adapters/` is ESLint-banned (matches D67 chokepoint enforcement). The sanitizer:

- Strips email, phone, address, SSN, dates-of-birth from input before sending to provider
- Strips the same from response before returning to caller
- Logs sanitization events without the PHI (CloudWatch zero-PHI per D42d)
- Falls open with a structured error if sanitization fails (not silently passing PHI through)

### Decision C — Training-data consent flag in ConsentState (separate from analytics)

**ConsentState carries an explicit `ai_training_consent` flag** (default false). The flag governs whether the user's conversation data may flow into the research tier (ADR-0025 Decision C) for fine-tuning / RLHF / aggregate analysis. The default is OFF; opt-in UX matches ADR-0025 Decision C language:

> Quilty uses anonymized cessation conversations to improve our AI coach. Would you like to contribute your conversations to model improvement?
>
> [ ] Yes — share my anonymized conversations
> [ ] No — keep my conversations to myself
>
> [Learn more about our AI training approach](link to ai-training-policy.md)

**Flag invariants:**

- Independent of analytics consent + replay consent + marketing consent (no bundling)
- Revocable at any time (revocation propagates to research tier per ADR-0025 Decision C)
- Logged with timestamp + version (matches ADR-0025 audit shape)
- AI providers receive `training_opt_in: false` flag in their request payload (so providers can honor their training-data policies — Anthropic + OpenAI both support this)

### Decision D — Provider neutrality via port-adapter

**Port-adapter pattern (matches D9 / ADR-0017 / ADR-0021 canon).** At M1.6, only two adapters exist:

1. `makeInMemoryAICoachAdapter()` — returns deterministic stub responses; used in tests + composition root default; never calls a real provider
2. `makeNoOpAICoachAdapter()` — throws `AICoachNotActivatedError` at every method; wired in production until M5+ activation

At M5+, primary adapter candidates:

- `makeAnthropicAICoachAdapter()` — Claude via Anthropic API or AWS Bedrock (BAA-available via Bedrock; preferred for HIPAA-aligned posture)
- `makeOpenAIAICoachAdapter()` — GPT via OpenAI API or Azure OpenAI (BAA-available via Azure; secondary candidate)
- `makeBedrockAICoachAdapter()` — multi-model via AWS Bedrock (BAA-available; integrates with existing AWS BAA at Phase 1)

**Selection criteria at M5+:** BAA availability + cessation-domain fine-tuning capability + cost + latency. Decision deferred to M5+; this ADR commits the shape only.

### Decision E — Mandatory crisis-resource fallback middleware

**Every `converse()` call runs through a crisis-detection middleware BEFORE reaching the provider adapter.** The middleware:

1. Pattern-matches the user's turn against a crisis-keyword + crisis-phrase lexicon (suicidal ideation, self-harm, severe panic, abuse, immediate-danger)
2. On match: returns a `safety_action: 'crisis_redirect'` response immediately; suppresses the provider call entirely
3. The crisis-redirect response surfaces a verified crisis-resource UI:
   - **988 Suicide & Crisis Lifeline** (call/text/chat)
   - **Crisis Text Line** ("HOME" to 741741)
   - **1-800-QUIT-NOW** (national quitline; vaping-context-appropriate)
   - **SAMHSA National Helpline** (1-800-662-4357; SUD-adjacent if needed)
4. Logs the crisis-detection event (zero-PHI; just event type + timestamp + opaque user ID)
5. The crisis UI does NOT include an AI-coach response in the same turn; the user must explicitly re-engage after acknowledging the resources

**Lexicon source:** SAMHSA-published crisis-language guidance + The Trevor Project's published lexicon for LGBTQ+-affirming variants + American Association of Suicidology's clinician guidance. **Lexicon maintenance:** the lexicon lives at `packages/ai-coach/src/safety/crisis-lexicon.ts` + is updated quarterly by the founder with named-counsel review at first amendment.

**False-positive cost:** acceptable — a user who sees the crisis-resource UI inappropriately can dismiss + re-engage with the same turn. **False-negative cost:** structurally unacceptable per the Character.AI precedent; lexicon errs on the side of redirect.

### Decision F — Deceptive-claim guardrails (extend ADR-0023 lint)

The ADR-0023 Decision I marketing-copy lint extends to AI-feature descriptions. Additional forbidden terms specific to AI:

| Term                             | Reason                                                                                                            |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `AI doctor`, `AI therapist`      | Implies clinical credential; FTC Operation AI Comply + state UPL (unauthorized practice of law/medicine) exposure |
| `clinically validated AI`        | Implies RCT; substantiation requirement under FTC §5                                                              |
| `your AI coach knows you better` | Implies inference quality that triggers MHMDA inference-as-CHD category                                           |
| `personalized treatment plan`    | Disease-treatment language; SaMD reclassification (ADR-0023 Decision D)                                           |
| `predicts your relapse`          | Predictive medical-device claim; SaMD reclassification                                                            |

Approved framing: "evidence-informed conversational coach," "habit-tracking AI assistant," "may help you reflect on cravings."

### Decision G — Conversation storage shape (composition root contract)

**AI conversations stored in DynamoDB at the Account tier (ADR-0025).** Schema:

```ts
type ConversationRecord = {
  readonly conversation_id: string; // ULID
  readonly user_id: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly turns: ReadonlyArray<ConversationTurn>;
  readonly safety_events: ReadonlyArray<SafetyEvent>;
  readonly attribution: AICoachAttribution;
  readonly training_consent_at_time_of_turn: boolean; // immutable snapshot per turn
};
```

Retention: 90 days rolling (Account tier; matches operational-tier rolling window since conversations are decreasing-utility). User can wipe at any time per ADR-0025 Decision B. Research tier flow requires `training_consent_at_time_of_turn === true` AND current `ai_training_consent === true` (double-gate — revocation drops historical turns from research access on next sync).

### Decision H — Telemetry boundaries (no AI metrics with PHI)

**AI feature telemetry follows D42d + D67 strictly.** Allowed in CloudWatch + PostHog: turn count, safety-action distribution, latency, error rate, model + version attribution, provider attribution. **Forbidden:** turn content, conversation excerpts, user PII, sanitization-event content.

### Decision I — Human-review-on-request (MODPA automated-decision provision)

**For any AI-driven decision that materially affects the user's experience** (e.g., AI recommends specific intervention; AI classifies user into a "high-relapse-risk" segment that gates content), the user can request human review within 60 days. The review is a non-AI assessment by a Quilty staff member; the user receives the assessment in writing. **Implementation:** an `ai_decision_log` table records AI-driven decisions; user can request review via the same DSAR pipeline (ADR-0025 Decision D) with `request_type: 'ai_review'`.

**At M1.6:** this is a documented contract; no AI-driven gating decisions exist. Activates at M5+ when first AI-driven personalization ships.

## Consequences

### Positive

- **Character.AI failure mode closed** by crisis-resource fallback middleware. AI surface has a structural safety floor that doesn't depend on the provider.
- **BetterHelp + Cerebral failure modes closed** by training-data consent flag + PHI sanitizer chokepoint + research-tier gating.
- **FTC Operation AI Comply exposure neutralized** by ADR-0023 + Decision F deceptive-claim lint extension.
- **Provider neutrality preserved** — M5+ provider selection is a clean swap, not a refactor.
- **MODPA automated-decision provision covered** by Decision I human-review-on-request contract.
- **Composition-root discipline preserved** — AI-coach port matches the pattern of ADR-0017 (HTTP client) + ADR-0021 (workflow engine); no special-casing required.

### Negative / Trade-offs

- **Crisis-lexicon false positives reduce AI coach utility** (~1-3% of conversations may hit a false positive). Acceptable — the alternative is Character.AI-style risk.
- **Training-data opt-in default OFF reduces fine-tuning dataset size.** Mitigated by lifecycle prompts at day 30 + 90 + 365 (matches ADR-0025 Decision C).
- **PHI sanitizer chokepoint adds ~50-200ms per AI call** depending on input length. Acceptable for cessation-coaching latency budget.
- **No AI feature ships at M1.6 or M2-M4.** ADR locks the shape; activation deferred to M5+.

### Neutral

- **AI feature is genuinely deferred to M5+** — this ADR ships no runtime SDK, no provider integration, no costs. The cost at M1.6 is the port spec + no-op adapter + lint extension (~1 day of work).
- **AICoach package mirrors ADR-0021 WorkflowEngine package structure** — consistent codebase shape.

## Alternatives considered

### Alternative A: Defer all AI-feature ADRs to M5+

- **What it is:** Don't lock any contract now; revisit at M5+ when AI features start.
- **Why rejected:** Mid-feature retrofit of safety middleware + PHI sanitizer + training consent is 10× more expensive than upfront contract-lock. FTC + state CHD enforcement is accelerating; getting caught mid-implementation is the worst position.

### Alternative B: Direct provider SDK in Server Components (no port)

- **What it is:** Import `@anthropic/sdk` directly in Server Components when M5+ AI ships.
- **Why rejected:** Vendor lock-in; provider SDKs change quarterly; BAA availability shifts; no clean swap. Matches the anti-pattern explicitly named in CLAUDE.md (vendor-agnostic naming + port-adapter).

### Alternative C: Use a single LLM safety library (Guardrails AI / Anthropic Constitutional / etc.)

- **What it is:** Adopt a vendor-supplied safety layer as the crisis-detection middleware.
- **Why rejected:** Single-vendor lock-in on a load-bearing safety surface; libraries change behavior unpredictably; SAMHSA-curated lexicon is more conservative + auditable. Revisit at M5+ as an ADR amendment if vendor maturity changes.

### Alternative D: Bundle AI training consent with research consent (ADR-0025 Decision C)

- **What it is:** One opt-in covers both research aggregates + AI training.
- **Why rejected:** MHMDA + MODPA + GDPR Art 9 require purpose-specific consent. Research aggregates ≠ AI training as purposes; bundling fails the granularity test.

### Alternative E: Crisis-resource fallback as a post-response filter

- **What it is:** Let the AI respond; filter post-hoc if the response is crisis-adjacent.
- **Why rejected:** Character.AI precedent — by the time the response exists, harm may have occurred (logging, conversation history, user already saw it). Pre-call middleware is the structural floor.

## Compliance / Verification

- **PHI sanitizer chokepoint ESLint rule** (extends D67 enforcement): bans direct `@anthropic/sdk` / `openai` / `@aws-sdk/client-bedrock-runtime` imports outside `packages/ai-coach/src/adapters/`.
- **Marketing-copy lint extension** (ADR-0023 Decision I): adds the Decision F forbidden-term list; enforced at M4+ when first AI feature description lands in marketing copy.
- **Crisis-lexicon coverage test** (contract test): parameterized test with 100+ phrases from SAMHSA + The Trevor Project + AAS lexicons; asserts the middleware fires `crisis_redirect` for each.
- **In-memory adapter contract test:** the AICoach port has at least the in-memory adapter + a stub provider adapter, both passing the same contract test.
- **Training-consent invariant** (Vitest): research-tier flow checks both `training_consent_at_time_of_turn === true` AND current `ai_training_consent === true` before sourcing turns to research.
- **AI telemetry boundary test** (Vitest): asserts PostHog + CloudWatch events for AI features carry no turn content, no user PII, no PHI.
- **Provider-attribution audit log:** every AICoach response stores its `attribution` field; queryable for incident response + FTC compliance.
- **Human-review-on-request pathway** (M5+ activation): DSAR pipeline accepts `request_type: 'ai_review'`.

## Revisit triggers

- **M5+ first AI feature activation** — provider selection ADR (new ADR-0027 candidate); full implementation of in-memory + named-provider adapters.
- **FTC enforcement action against any health-app AI feature** — immediate re-review of contract, especially Decision F + Decision G.
- **Replika / Character.AI / Pi class action ruling** — re-review of crisis-fallback middleware; possible tightening.
- **WA AG MHMDA AI-inference enforcement** — verification that Decision C training-consent + Decision G storage shape align with the AG's interpretation.
- **MODPA AI provision enforcement** — re-review of Decision I human-review-on-request implementation.
- **Anthropic / OpenAI / AWS Bedrock BAA terms change** — provider neutrality enables clean swap; re-review of preferred adapter.
- **SAMHSA / Trevor Project / AAS lexicon update** — quarterly review cadence on the crisis lexicon.
- **Quilty AI coach in production user-reports a bad experience** — incident review + ADR amendment + lexicon update.

## References

- FTC Operation AI Comply (Sept 2024): <https://www.ftc.gov/news-events/news/press-releases/2024/09/ftc-announces-crackdown-deceptive-ai-claims-schemes>
- FTC AI + health data blog (Jan 2025): <https://www.ftc.gov/business-guidance/blog/2025/01/health-data-ai-training>
- FTC BetterHelp settlement ($7.8M, 2023-03): <https://www.ftc.gov/news-events/news/press-releases/2023/03/ftc-ban-betterhelp-revealing-consumers-data-including-sensitive-mental-health-information-facebook>
- FTC Cerebral settlement ($7M, 2024-04): <https://www.ftc.gov/news-events/news/press-releases/2024/04/ftc-action-leads-7-million-judgment-against-cerebral-failing-secure-sensitive-consumer-data>
- WA AG MHMDA 2025 guidance (inference-as-CHD): <https://www.atg.wa.gov/my-health-my-data-act>
- MD MODPA automated-decision provisions: <https://mgaleg.maryland.gov/2024RS/bills/sb/sb0541E.pdf>
- Character.AI lawsuit (US 2024): <https://www.socialmediavictims.org/character-ai-lawsuit/>
- Replika Italy 2024 sanction: <https://www.gpdp.it/web/guest/home/docweb/-/docweb-display/docweb/9852506>
- SAMHSA crisis-language guidance: <https://www.samhsa.gov/find-help/national-helpline>
- 988 Suicide & Crisis Lifeline: <https://988lifeline.org/>
- The Trevor Project crisis resources: <https://www.thetrevorproject.org/get-help/>
- American Association of Suicidology: <https://suicidology.org/>
- Anthropic API training-data policy: <https://www.anthropic.com/legal/privacy>
- OpenAI training-data API option: <https://openai.com/policies/api-data-usage-policies>
- AWS Bedrock HIPAA-eligible services: <https://aws.amazon.com/compliance/hipaa-eligible-services-reference/>
- Pivot Breathe AI coach: <https://pivot.co/>
- Pelago clinical AI triage: <https://www.pelagohealth.com/>
- 2Morrow Health ACT modules: <https://www.2morrowinc.com/2morrow-health>
