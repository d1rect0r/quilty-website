/**
 * Contract tests for every factory. Each factory MUST satisfy:
 *   1. Schema validity — Zod parse round-trip succeeds.
 *   2. Override propagation — caller-supplied overrides win.
 *   3. Determinism under a fixed seed — same seed → same output.
 *   4. HIPAA-safety invariants — no `gmail.com`-style real domains,
 *      no real phone area codes, no PHI-shaped numeric ranges.
 *
 * Factories under test:
 *   - ContactFormFactory (Zod schema)
 *   - ConsentSnapshotFactory (GPC invariant)
 *   - AnalyticsEventFactory (typed-union shape per builder)
 *   - ProblemDetailsFactory (12-slug coverage + RFC 9457 shape)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ContactFormFactory,
  ContactFormSchemaForTesting,
  ConsentSnapshotFactory,
  AnalyticsEventFactory,
  ProblemDetailsFactory,
  setFixtureSeed,
  safeEmail,
  safePhone,
  safeAdultBirthDate,
} from '../src';

describe('safe-* helpers', () => {
  it('safeEmail returns an @example.test or @quilty.test address', () => {
    for (let i = 0; i < 25; i += 1) {
      const email = safeEmail();
      expect(email).toMatch(/@(example|quilty)\.test$/);
    }
  });

  it('safePhone returns a NANP fictional 555 number', () => {
    for (let i = 0; i < 25; i += 1) {
      const phone = safePhone();
      expect(phone).toMatch(/^\+1 555 \d{3} \d{4}$/);
    }
  });

  it('safeAdultBirthDate returns a YYYY-MM-DD string between 18 and 90 years ago', () => {
    for (let i = 0; i < 25; i += 1) {
      const dob = safeAdultBirthDate();
      expect(dob).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const year = Number.parseInt(dob.slice(0, 4), 10);
      const currentYear = new Date().getFullYear();
      expect(year).toBeGreaterThanOrEqual(currentYear - 90);
      expect(year).toBeLessThanOrEqual(currentYear - 18);
    }
  });

  it('safeAdultBirthDate is deterministic under a fixed seed', () => {
    setFixtureSeed(7);
    const a = safeAdultBirthDate();
    setFixtureSeed(7);
    const b = safeAdultBirthDate();
    expect(a).toBe(b);
  });

  it('safeAdultBirthDate window is anchored to refDate (calendar-day-stable)', () => {
    // The Phase C agent flagged that wall-clock-derived window
    // endpoints break cross-day reproducibility. Pin a refDate
    // explicitly via setFixtureSeed's optional arg and assert the
    // produced date lies in the expected window relative to THAT date,
    // not to Date.now().
    const anchor = new Date('2025-06-15T00:00:00.000Z');
    setFixtureSeed(7, anchor);
    const dob = safeAdultBirthDate();
    const dobMs = Date.parse(dob);
    const minMs = Date.UTC(2025 - 90, 5, 15); // June is month 5
    const maxMs = Date.UTC(2025 - 18, 5, 15);
    expect(dobMs).toBeGreaterThanOrEqual(minMs);
    expect(dobMs).toBeLessThanOrEqual(maxMs);
  });
});

describe('ContactFormFactory', () => {
  it('builds a contact form that parses against its own Zod schema (mirror-shape integrity)', () => {
    // Mirror-shape integrity: a no-override build must satisfy the
    // local Zod mirror. This catches mirror-internal regressions
    // (e.g., generator emits a field the mirror rejects).
    //
    // Asymmetry caveat: this test does NOT detect the case where the
    // CANONICAL schema (apps/web/.../contact/schema.ts) adds a new
    // required field while the local mirror stays unchanged — the
    // mirror-build round-trip succeeds against the unchanged mirror.
    // The proper fix at M5+ is `@quilty/shared-types` exporting the
    // canonical Zod schema for both sides to share.
    const built = ContactFormFactory.build();
    const parsed = ContactFormSchemaForTesting.safeParse(built);
    expect(parsed.success).toBe(true);
  });

  it('produces HIPAA-safe defaults across many builds', () => {
    for (let i = 0; i < 50; i += 1) {
      const built = ContactFormFactory.build();
      expect(built.email).toMatch(/@(example|quilty)\.test$/);
      expect(built.message.length).toBeLessThanOrEqual(2000);
      expect(built.idempotency_key).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    }
  });

  it('overrides propagate through .build()', () => {
    const built = ContactFormFactory.build({
      email: 'pinned@quilty.test',
      subject: 'pinned subject',
    });
    expect(built.email).toBe('pinned@quilty.test');
    expect(built.subject).toBe('pinned subject');
  });

  it('is deterministic under a fixed seed', () => {
    setFixtureSeed(42);
    const a = ContactFormFactory.build();
    setFixtureSeed(42);
    const b = ContactFormFactory.build();
    expect(a).toEqual(b);
  });
});

describe('ConsentSnapshotFactory', () => {
  it('builds the default-deny posture by default', () => {
    const s = ConsentSnapshotFactory.build();
    expect(s.essential).toBe(true);
    expect(s.functional).toBe(false);
    expect(s.analytics).toBe(false);
    expect(s.marketing).toBe(false);
    expect(s.personalization).toBe(false);
    expect(s.gpc_detected).toBe(false);
  });

  it('accepts overrides for individual categories', () => {
    const s = ConsentSnapshotFactory.build({ analytics: true, marketing: true });
    expect(s.analytics).toBe(true);
    expect(s.marketing).toBe(true);
  });

  it('forces analytics + marketing off when gpc_detected: true (CCPA §7025(c)(2))', () => {
    const s = ConsentSnapshotFactory.build({
      gpc_detected: true,
      analytics: true,
      marketing: true,
    });
    expect(s.gpc_detected).toBe(true);
    expect(s.analytics).toBe(false);
    expect(s.marketing).toBe(false);
  });

  it('essential is always true (afterBuild defense layer)', () => {
    // The type system blocks `essential: false` at the call site, but
    // the afterBuild hook re-asserts the field as a runtime defense
    // for cases that bypass type-checking (cast via `as` / dynamic
    // construction / older tests built before the type was tightened).
    const s = ConsentSnapshotFactory.build({} as Record<string, never>);
    expect(s.essential).toBe(true);
  });
});

describe('AnalyticsEventFactory', () => {
  it('pageView produces { name: "page_view", props: { route, locale } }', () => {
    const e = AnalyticsEventFactory.pageView();
    expect(e.name).toBe('page_view');
    expect(typeof e.props.route).toBe('string');
    expect(['en', 'es']).toContain(e.props.locale);
  });

  it('ctaClick honours overrides', () => {
    const e = AnalyticsEventFactory.ctaClick({ cta_id: 'pinned', location: 'hero' });
    expect(e.props.cta_id).toBe('pinned');
    expect(e.props.location).toBe('hero');
  });

  it('signupCompleted method is one of password/passkey/social', () => {
    const e = AnalyticsEventFactory.signupCompleted();
    expect(['password', 'passkey', 'social']).toContain(e.props.method);
  });

  it('accountDeleted reason is one of the documented enum values', () => {
    const e = AnalyticsEventFactory.accountDeleted();
    expect(['user_request', 'inactive', 'compliance']).toContain(e.props.reason);
  });
});

describe('ProblemDetailsFactory', () => {
  const allBuilders = [
    ['validation', ProblemDetailsFactory.validation],
    ['csrf', ProblemDetailsFactory.csrf],
    ['rateLimit', ProblemDetailsFactory.rateLimit],
    ['authRequired', ProblemDetailsFactory.authRequired],
    ['forbidden', ProblemDetailsFactory.forbidden],
    ['consentRequired', ProblemDetailsFactory.consentRequired],
    ['sessionExpired', ProblemDetailsFactory.sessionExpired],
    ['stepUpRequired', ProblemDetailsFactory.stepUpRequired],
    ['notFound', ProblemDetailsFactory.notFound],
    ['serviceUnavailable', ProblemDetailsFactory.serviceUnavailable],
    ['idempotencyKeyConflict', ProblemDetailsFactory.idempotencyKeyConflict],
    ['preconditionFailed', ProblemDetailsFactory.preconditionFailed],
  ] as const;

  it('covers all 12 ADR-0017 problem-type slugs', () => {
    expect(allBuilders).toHaveLength(12);
  });

  it.each(allBuilders)('%s builder produces an RFC 9457-shaped envelope', (_name, builder) => {
    const p = builder();
    expect(p.type).toMatch(/^https:\/\/my-quilty\.com\/problems\/v1\/[a-z-]+$/);
    expect(p.title).toBeTruthy();
    expect(p.status).toBeGreaterThanOrEqual(400);
    expect(p.status).toBeLessThan(600);
    expect(p.detail).toBeTruthy();
    expect(p.slug).toBeTruthy();
    // correlationId follows the q1m_<base32> shape minted by
    // apps/web/lib/correlation-id.ts.
    expect(p.correlationId).toMatch(/^q1m_[0-9a-z]+$/);
  });

  it('rateLimit defaults to retry_after_ms: 1000', () => {
    const p = ProblemDetailsFactory.rateLimit();
    expect(p.extensions['retry_after_ms']).toBe(1000);
  });

  it('rateLimit honours overrides', () => {
    const p = ProblemDetailsFactory.rateLimit({ retryAfterMs: 5000 });
    expect(p.extensions['retry_after_ms']).toBe(5000);
  });

  it('serviceUnavailable supports retryable override', () => {
    const yes = ProblemDetailsFactory.serviceUnavailable({ retryable: true });
    expect(yes.extensions['retryable']).toBe(true);
    const no = ProblemDetailsFactory.serviceUnavailable({ retryable: false });
    expect(no.extensions['retryable']).toBe(false);
  });

  it('validation supports field_errors override', () => {
    const p = ProblemDetailsFactory.validation({ fieldErrors: { email: 'invalid format' } });
    expect((p.extensions['field_errors'] as Record<string, string>).email).toBe('invalid format');
  });
});

describe('determinism (file-level seed)', () => {
  beforeEach(() => {
    setFixtureSeed(99);
  });

  it('two sequential builds under the same seed produce different outputs', () => {
    // Determinism is about reproducibility across processes, not
    // freezing the RNG within a single process — successive calls
    // advance the generator state.
    const a = ContactFormFactory.build();
    const b = ContactFormFactory.build();
    expect(a).not.toEqual(b);
  });

  it('re-seeding reproduces a date-bearing fixture (setDefaultRefDate pinned)', () => {
    setFixtureSeed(123);
    const a = ConsentSnapshotFactory.build();
    setFixtureSeed(123);
    const b = ConsentSnapshotFactory.build();
    // updated_at depends on faker.date.recent which needs refDate
    // pinned to reproduce.
    expect(a.updated_at).toBe(b.updated_at);
  });
});
