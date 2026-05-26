/**
 * Seeded faker singleton + HIPAA-safe helpers.
 *
 * Every fixture in this package generates data through this helper —
 * NEVER through `import { faker } from '@faker-js/faker'` directly.
 * Centralization buys three properties:
 *
 *   1. Determinism — every test run can opt into a deterministic seed
 *      via `setFixtureSeed()`; otherwise the global faker default is
 *      non-deterministic per-process (matches faker's own convention).
 *   2. HIPAA safety by construction — `safeEmail()`, `safePhone()`,
 *      `safeDate()` constrain generators to ranges that cannot collide
 *      with real user identifiers. Anyone tempted to call
 *      `faker.internet.email()` directly is one ESLint rule away from
 *      a lint failure (added at the HIPAA-fixture ESLint trigger).
 *   3. Future provider swap — if `@faker-js/faker` is ever replaced
 *      with a domain-specific generator, only this file changes.
 *
 * The reserved test ranges used here are:
 *   - Email: `@example.test` / `@quilty.test` — IANA-reserved (RFC 6761
 *     §6.4 reserves `.test` as a top-level test TLD; no real domains).
 *   - Phone: `+1 555 XXX XXXX` — NANP §10.6 reserves the 555 prefix
 *     for fictional use; never assigned to a real subscriber.
 *   - Birth dates: synthesized adult range (18-90 years past) so no
 *     real DOB ever lands; never anchored to a known calendar.
 */

import { faker as fakerJs } from '@faker-js/faker';

/**
 * The shared singleton. Tests import via the `faker` re-export from
 * the package barrel; they never reach into `@faker-js/faker` directly.
 */
export const faker = fakerJs;

/**
 * Stable reference date used by `setFixtureSeed` to pin
 * `faker.setDefaultRefDate`. Without a fixed refDate, `faker.date.*`
 * calls compute their range relative to `Date.now()` and produce
 * different output across millisecond ticks even under a fixed integer
 * seed — see Faker.js's own seed docs. The chosen value (mid-point of
 * the 2020-2030 decade) is arbitrary but stable.
 */
const SEED_REFERENCE_DATE = new Date('2025-01-01T00:00:00.000Z');

/**
 * Set a deterministic seed for the singleton. Call from a `beforeEach`
 * to make a single test reproducible, or from a `beforeAll` for a
 * deterministic test file.
 *
 * Pins BOTH the integer seed AND the reference date faker uses for
 * `date.recent()` / `date.past()` / `date.between()` ranges. Without
 * the refDate pin, two builds at different millisecond ticks under
 * the same integer seed would diverge.
 *
 * The optional `refDate` argument overrides the canonical reference
 * for tests that need a specific "now" (e.g., asserting a recent-date
 * fixture is within N days of a known anchor).
 */
export function setFixtureSeed(seed: number, refDate: Date = SEED_REFERENCE_DATE): void {
  faker.seed(seed);
  faker.setDefaultRefDate(refDate);
}

/**
 * HIPAA-safe email — always `<local>@example.test` or `<local>@quilty.test`.
 * The local-part still varies so tests can assert per-field uniqueness.
 */
export function safeEmail(): string {
  const local = faker.internet.username().toLowerCase();
  const domain = faker.helpers.arrayElement(['example.test', 'quilty.test']);
  return `${local}@${domain}`;
}

/**
 * HIPAA-safe US phone — `+1 555 XXX XXXX`. The `555` prefix is the
 * NANP fictional-use reserve (never assigned to a real subscriber).
 */
export function safePhone(): string {
  const exchange = faker.string.numeric({ length: 3 });
  const subscriber = faker.string.numeric({ length: 4 });
  return `+1 555 ${exchange} ${subscriber}`;
}

/**
 * HIPAA-safe adult birth date — between 18 and 90 years ago, generated
 * through the seeded faker singleton. Returns the date-only ISO string.
 *
 * Determinism: BOTH the integer seed AND the window endpoints route
 * through `faker.defaultRefDate()`. After `setFixtureSeed(n)` pins the
 * refDate, the [now - 90y, now - 18y] window collapses to a fixed pair
 * of absolute dates, so the same seed reproduces the same output
 * across calendar days. Without `setFixtureSeed`, the window tracks
 * wall-clock — matching pre-seeded behavior.
 *
 * NEVER use `Math.random()` or `new Date()` directly here — the
 * package's headline guarantee is that the seed pins all output, and
 * either escape hatch breaks that contract silently.
 */
export function safeAdultBirthDate(): string {
  // `faker.defaultRefDate()` is the canonical "now" inside the seeded
  // singleton; it returns the pinned date after setDefaultRefDate and
  // a live Date instance otherwise. Faker types it as `Date`.
  const refDate = faker.defaultRefDate();
  const from = new Date(refDate);
  from.setFullYear(refDate.getFullYear() - 90);
  const to = new Date(refDate);
  to.setFullYear(refDate.getFullYear() - 18);
  return faker.date.between({ from, to }).toISOString().slice(0, 10);
}
