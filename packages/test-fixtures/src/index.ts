/**
 * Public barrel for `@quilty/test-fixtures`.
 *
 * Consumers import factories + helpers from this file; deep imports
 * are not exposed (no subpath exports today). Every fixture is
 * generated through the local `faker` singleton from `./faker`; never
 * import from `@faker-js/faker` directly in consumer tests.
 *
 * Future-factory triggers (locked, not yet shipped):
 *   - `PersonFactory` — when the OpenAPI spec emits a Person/Profile
 *     entity (gated on auth-user crate utoipa coverage per ADR-0003).
 *   - `AccountFactory` — same trigger.
 *   - `SessionFactory` — when the BFF session-cookie shape stabilises
 *     (D51 + D52 deliverables).
 *   - `SubscriptionFactory` — when the Stripe → Rust bridge ships
 *     (subscription-track activation in `docs/website_workflow_roadmap.md`).
 *   - `MfaEnrollmentFactory` — when the D55 Argon2id backup-codes
 *     surface lands.
 *
 * The pattern documented in this barrel (faker singleton + Zod-mirror
 * + fishery Factory) is sufficient for each of those when their shapes
 * land — no infrastructure change required.
 */

// Faker singleton + HIPAA-safe helpers
export { faker, setFixtureSeed, safeEmail, safePhone, safeAdultBirthDate } from './faker';

// Factory exports
export {
  ContactFormFactory,
  ContactFormSchemaForTesting,
  type ContactFormFixture,
} from './factories/contact-form';
export { ConsentSnapshotFactory, type ConsentSnapshotFixture } from './factories/consent-snapshot';
export {
  AnalyticsEventFactory,
  type AnalyticsEventFixture,
  type AnalyticsEventName,
  type PageViewEvent,
  type CtaClickEvent,
  type SignupStartedEvent,
  type SignupCompletedEvent,
  type SubscriptionStartedEvent,
  type AccountDeletedEvent,
} from './factories/analytics-event';
export {
  ProblemDetailsFactory,
  type ProblemDetailsFixture,
  type ProblemTypeSlug,
} from './factories/problem-details';
