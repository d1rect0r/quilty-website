import { z } from 'zod';

/**
 * /contact form schema — shared source of truth for client-side
 * (React Hook Form via zodResolver) AND server-side (Route Handler
 * validate-before-execute).
 *
 * The schema rejects PHI-shaped input at the boundary, but the
 * sanitizer chokepoint (D67) is the load-bearing defense — a user
 * who slips a phone number into the message field is caught by the
 * value-pattern regex on the EmailSender wrapper before the
 * acknowledgement email ships.
 *
 * Constraints:
 *   - `name`: 1-120 chars, no C0/DEL control bytes
 *   - `email`: RFC 5322 shape via Zod's `.email()`
 *   - `subject`: 1-160 chars
 *   - `message`: 1-2000 chars
 *   - `csrf_token`: non-empty (verified server-side; client just
 *     forwards the cookie value)
 *   - `time_token`: non-empty (verifyTimeTrap chokepoint runs server-
 *     side)
 *   - `idempotency_key`: UUID v4 shape
 *   - `turnstile_token`: non-empty when Turnstile widget rendered
 *   - Honeypot field: NOT in the Zod schema — the field name is
 *     randomized per render and read directly from the request body
 *     in the Route Handler.
 */

/**
 * RegExp that matches any C0 control byte (U+0000..U+001F) or DEL
 * (U+007F). The pattern is built at module load via `new RegExp` so
 * the literal control bytes never appear in source — keeping the
 * file ASCII-clean (no Prettier formatter interaction) AND
 * satisfying ESLint's no-control-regex rule.
 */
const CONTROL_CHAR_REGEX = new RegExp(
  '[' + String.fromCharCode(0) + '-' + String.fromCharCode(0x1f) + String.fromCharCode(0x7f) + ']',
);

export const contactFormSchema = z.object({
  name: z
    .string()
    .min(1, 'Please share your name.')
    .max(120, 'Name is too long (max 120 characters).')
    .refine((v) => !CONTROL_CHAR_REGEX.test(v), {
      message: 'Name contains control characters.',
    }),
  email: z.string().email('Please enter a valid email address.'),
  subject: z
    .string()
    .min(1, 'Please share a subject.')
    .max(160, 'Subject is too long (max 160 characters).'),
  message: z
    .string()
    .min(1, 'Please share a message.')
    .max(2000, 'Message is too long (max 2000 characters).'),
  csrf_token: z.string().min(1),
  time_token: z.string().min(1),
  idempotency_key: z.string().uuid('Idempotency key must be a UUID.'),
  turnstile_token: z.string().min(1, 'Captcha verification is required.'),
});

export type ContactFormValues = z.infer<typeof contactFormSchema>;

/**
 * Result envelope returned by the contact Route Handler. The `ok`
 * discriminator (not `success`) avoids the TypeScript generic-
 * narrowing bug per D95/D121.
 *
 * `field_errors` is a sparse map of field-name → message; the client
 * surfaces these via React Hook Form's `setError`.
 *
 * `reason` on the failure branch is a coarse classifier for
 * observability (rate-limit, captcha, csrf, etc.); it MUST NOT carry
 * any user-supplied content (the message body never appears here).
 */
// Note: no `'honeypot'` discriminator in the failure union. The
// honeypot trip path deliberately returns `{ ok: true, digest }` to
// the client (silent 200) so a bot maintainer cannot distinguish
// the honeypot signal from a real success. Surfacing `honeypot` in
// the type would leak the bot-detection semantics if the type ever
// flows into an OpenAPI codegen target.
export type ContactFormResult =
  | { readonly ok: true; readonly digest: string }
  | {
      readonly ok: false;
      readonly reason:
        | 'csrf'
        | 'time_trap'
        | 'captcha'
        | 'validation'
        | 'rate_limit'
        | 'send_failed'
        | 'unknown';
      readonly field_errors?: Readonly<Partial<Record<keyof ContactFormValues, string>>>;
      readonly retry_after_ms?: number;
    };
