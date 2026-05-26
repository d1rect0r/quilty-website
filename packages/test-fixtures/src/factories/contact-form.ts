/**
 * ContactFormFactory — fixture for the marketing contact-form payload.
 *
 * The factory's TYPE is inferred from the local Zod mirror of the
 * canonical `contactFormSchema` (source of truth at
 * `apps/web/app/[locale]/(marketing)/contact/schema.ts`; mirrored
 * inline to avoid a workspace cycle). Schema-drift detection happens
 * in the factory contract test, which calls `.build()` with no
 * overrides and runs `ContactFormSchema.safeParse(built)` — that test
 * fails the moment the canonical adds / renames a field.
 *
 * The generator does NOT parse-validate before fishery merges
 * overrides — overriding to an invalid value is a feature (validation-
 * branch tests pass `{ email: 'not-an-email' }` and expect the route
 * to reject), and a pre-merge parse can't see the final shape anyway.
 *
 * HIPAA-safe by construction: `email` uses `@example.test`, `subject`
 * + `message` draw from `faker.lorem` (never PHI-shaped strings).
 * Token fields (csrf / time / idempotency / turnstile) are placeholder
 * shapes; tests that exercise the real verifiers override these.
 */

import { Factory } from 'fishery';
import { z } from 'zod';
import { faker, safeEmail } from '../faker';

const ContactFormSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  subject: z.string().min(1).max(160),
  message: z.string().min(1).max(2000),
  csrf_token: z.string().min(1),
  time_token: z.string().min(1),
  idempotency_key: z.string().uuid(),
  turnstile_token: z.string().min(1),
});

export type ContactFormFixture = z.infer<typeof ContactFormSchema>;

// Re-exported for the drift-detection contract test (the only consumer
// that should ever parse against the mirror).
export const ContactFormSchemaForTesting = ContactFormSchema;

// Message-length cap: faker.lorem.paragraph can pathologically exceed
// the canonical schema's 2000-char ceiling under certain seeds (6
// sentences × 20 words × 16 chars > 1900). Bound at 1800 chars to keep
// a safety margin while preserving realistic paragraph shape.
const MESSAGE_MAX_CHARS = 1800;

export const ContactFormFactory = Factory.define<ContactFormFixture>(() => {
  const paragraph = faker.lorem.paragraph({ min: 2, max: 4 });
  const message =
    paragraph.length > MESSAGE_MAX_CHARS ? paragraph.slice(0, MESSAGE_MAX_CHARS) : paragraph;
  return {
    name: faker.person.fullName(),
    email: safeEmail(),
    subject: faker.lorem.sentence({ min: 3, max: 8 }),
    message,
    csrf_token: faker.string.alphanumeric({ length: 40 }),
    time_token: faker.string.alphanumeric({ length: 40 }),
    idempotency_key: faker.string.uuid(),
    turnstile_token: faker.string.alphanumeric({ length: 64 }),
  };
});
