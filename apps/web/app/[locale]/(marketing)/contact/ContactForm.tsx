'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { contactFormSchema, type ContactFormResult, type ContactFormValues } from './schema';

/**
 * Client Component — React Hook Form + Zod resolver.
 *
 * Why no shadcn/Radix primitives today: the project ships native HTML
 * + Tailwind elsewhere (Banner, Header) without shadcn. Forms-canonical
 * (D117) prescribes shadcn `<Form>` over time; this commit ships the
 * 8-piece behavioural pattern + RHF + Zod surface, with shadcn
 * adoption deferred to a focused boundary commit. The a11y contract
 * (aria-describedby + aria-invalid + role="alert" field errors +
 * role="status" form-level live region) is identical to what shadcn
 * `<FormMessage>` would render.
 *
 * Submission flow:
 *   1. RHF validates client-side via zodResolver (immediate feedback).
 *   2. onSubmit reads CSRF cookie + POSTs to /api/contact with custom
 *      `X-Quilty-CSRF` header (the triple-layer canonical pattern).
 *   3. Server returns Result envelope (success → reset form + show
 *      success message; failure → setError on each field; rate-limit
 *      → top-level error message).
 *
 * Idempotency: a UUID minted at mount via `crypto.randomUUID()` is
 * embedded in the request. Network retry / double-click submits
 * return the cached envelope — see lib/idempotency.ts.
 *
 * a11y contract:
 *   - `<output role="status" aria-live="polite">` for form-level
 *     success/error announcements (WCAG 4.1.3 Status Messages).
 *   - Each field has `aria-describedby` pointing to its error message
 *     + `aria-invalid={hasError}`.
 *   - Submit button shows `aria-busy="true"` during submission.
 *   - Honeypot field is `aria-hidden="true"` + `tabindex="-1"` and
 *     visually offscreen (offscreen pattern, not display:none).
 */

export interface ContactFormProps {
  readonly csrfToken: string;
  readonly timeToken: string;
  readonly honeypotFieldName: string;
}

export function ContactForm({
  csrfToken,
  timeToken,
  honeypotFieldName,
}: ContactFormProps): React.JSX.Element {
  const baseId = useId();
  // useState lazy initializer mints the idempotency key exactly once
  // on mount; subsequent renders + re-validations reuse it so a
  // retry/double-click maps to the same dedupe slot.
  const [idempotencyKey] = useState<string>(() => crypto.randomUUID());
  const [formStatus, setFormStatus] = useState<
    { kind: 'idle' } | { kind: 'success'; digest: string } | { kind: 'error'; message: string }
  >({ kind: 'idle' });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
    reset,
  } = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    mode: 'onBlur',
    defaultValues: {
      name: '',
      email: '',
      subject: '',
      message: '',
      csrf_token: csrfToken,
      time_token: timeToken,
      idempotency_key: idempotencyKey,
      // Placeholder token consumed by the in-memory CaptchaVerifier
      // (default-pass) before the Turnstile widget activates. The
      // value is intentionally non-descriptive so the client bundle
      // does not document the pre-activation bypass.
      turnstile_token: 'pending',
    },
  });

  async function onSubmit(values: ContactFormValues): Promise<void> {
    setFormStatus({ kind: 'idle' });
    try {
      // Header source: forward the form-state CSRF token (the one
      // embedded at render time and persisted in form state), NOT a
      // late `document.cookie` read. The cookie may rotate between
      // mount and submit (a sibling tab opening /contact rewrites the
      // cookie); reading it at submit time would diverge from the
      // hidden-input body token and trip verifyCsrf's mismatch branch.
      // The server compares cookie + body + header — all three must
      // match. Sourcing both body and header from `values.csrf_token`
      // keeps them aligned; cookie drift surfaces as a clean
      // origin_mismatch / token_invalid error rather than a silent
      // submit failure across tabs.
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-quilty-csrf': values.csrf_token,
        },
        body: JSON.stringify(values),
      });
      const envelope = (await res.json()) as ContactFormResult;
      if (envelope.ok) {
        setFormStatus({ kind: 'success', digest: envelope.digest });
        reset({
          name: '',
          email: '',
          subject: '',
          message: '',
          csrf_token: csrfToken,
          time_token: timeToken,
          idempotency_key: idempotencyKey,
          // Placeholder token consumed by the in-memory CaptchaVerifier
          // (default-pass) before the Turnstile widget activates. The
          // value is intentionally non-descriptive so the client bundle
          // does not document the pre-activation bypass.
          turnstile_token: 'pending',
        });
        return;
      }
      if (envelope.field_errors) {
        for (const [field, msg] of Object.entries(envelope.field_errors)) {
          if (typeof msg === 'string') {
            setError(field as keyof ContactFormValues, { message: msg });
          }
        }
      }
      const userMessage =
        envelope.reason === 'rate_limit'
          ? 'Too many submissions. Please try again in a few minutes.'
          : envelope.reason === 'captcha'
            ? 'Captcha verification failed. Please reload the page and try again.'
            : envelope.reason === 'csrf' || envelope.reason === 'time_trap'
              ? 'Your form expired. Please reload the page and try again.'
              : envelope.reason === 'send_failed'
                ? 'We could not send the acknowledgement email. Please try again shortly.'
                : envelope.reason === 'validation'
                  ? 'Please review the highlighted fields.'
                  : 'Something went wrong. Please try again.';
      setFormStatus({ kind: 'error', message: userMessage });
    } catch {
      setFormStatus({
        kind: 'error',
        message: 'Network error — please check your connection and try again.',
      });
    }
  }

  const nameErrId = `${baseId}-name-err`;
  const emailErrId = `${baseId}-email-err`;
  const subjectErrId = `${baseId}-subject-err`;
  const messageErrId = `${baseId}-message-err`;
  const statusId = `${baseId}-status`;

  return (
    <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <input type="hidden" {...register('csrf_token')} />
      <input type="hidden" {...register('time_token')} />
      <input type="hidden" {...register('idempotency_key')} />
      <input type="hidden" {...register('turnstile_token')} />

      {/* Honeypot — CSS-offscreen, aria-hidden, tabindex -1. The
          field is intentionally unlabeled-for-assistive-tech because
          aria-hidden hides it from the accessibility tree. The
          aria-label on the input satisfies the jsx-a11y rule without
          surfacing the field to screen readers (aria-hidden takes
          precedence over aria-label in the accessibility tree).
      */}
      <div className="absolute left-[-9999px] h-px w-px overflow-hidden" aria-hidden="true">
        <input
          id={`${baseId}-${honeypotFieldName}`}
          name={honeypotFieldName}
          type="text"
          tabIndex={-1}
          autoComplete="nope"
          aria-label="Do not fill — anti-bot honeypot"
          data-lpignore="true"
          data-1p-ignore=""
        />
      </div>

      <div>
        <label
          htmlFor={`${baseId}-name`}
          className="text-fg-default mb-1 block text-sm font-medium"
        >
          Name
        </label>
        <input
          id={`${baseId}-name`}
          type="text"
          autoComplete="name"
          aria-describedby={errors.name ? nameErrId : undefined}
          aria-invalid={errors.name ? true : undefined}
          {...register('name')}
          className="border-border-default focus-visible:border-border-strong focus-visible:ring-ring bg-bg-elevated text-fg-default block min-h-[44px] w-full rounded border px-3 py-2 outline-none focus-visible:ring-2"
        />
        {errors.name && (
          <p id={nameErrId} role="alert" className="text-danger-fg mt-1 text-sm font-medium">
            {errors.name.message}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor={`${baseId}-email`}
          className="text-fg-default mb-1 block text-sm font-medium"
        >
          Email
        </label>
        <input
          id={`${baseId}-email`}
          type="email"
          autoComplete="email"
          aria-describedby={errors.email ? emailErrId : undefined}
          aria-invalid={errors.email ? true : undefined}
          {...register('email')}
          className="border-border-default focus-visible:border-border-strong focus-visible:ring-ring bg-bg-elevated text-fg-default block min-h-[44px] w-full rounded border px-3 py-2 outline-none focus-visible:ring-2"
        />
        {errors.email && (
          <p id={emailErrId} role="alert" className="text-danger-fg mt-1 text-sm font-medium">
            {errors.email.message}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor={`${baseId}-subject`}
          className="text-fg-default mb-1 block text-sm font-medium"
        >
          Subject
        </label>
        <input
          id={`${baseId}-subject`}
          type="text"
          aria-describedby={errors.subject ? subjectErrId : undefined}
          aria-invalid={errors.subject ? true : undefined}
          {...register('subject')}
          className="border-border-default focus-visible:border-border-strong focus-visible:ring-ring bg-bg-elevated text-fg-default block min-h-[44px] w-full rounded border px-3 py-2 outline-none focus-visible:ring-2"
        />
        {errors.subject && (
          <p id={subjectErrId} role="alert" className="text-danger-fg mt-1 text-sm font-medium">
            {errors.subject.message}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor={`${baseId}-message`}
          className="text-fg-default mb-1 block text-sm font-medium"
        >
          Message
        </label>
        <textarea
          id={`${baseId}-message`}
          rows={6}
          aria-describedby={errors.message ? messageErrId : undefined}
          aria-invalid={errors.message ? true : undefined}
          {...register('message')}
          className="border-border-default focus-visible:border-border-strong focus-visible:ring-ring bg-bg-elevated text-fg-default block min-h-[44px] w-full rounded border px-3 py-2 outline-none focus-visible:ring-2"
        />
        {errors.message && (
          <p id={messageErrId} role="alert" className="text-danger-fg mt-1 text-sm font-medium">
            {errors.message.message}
          </p>
        )}
      </div>

      {/* Form-level live regions: success (polite) + error (assertive).
          Two regions are intentional — for transient failures (csrf /
          time_trap / rate_limit / captcha) the user has already
          submitted, so assertive announce takes precedence over polite
          AT activity. The success branch stays polite per WCAG 4.1.3
          Status Messages convention. */}
      {/* Live regions: success (polite) + error (assertive). The
          inner <span> is keyed on the message text so React removes
          and re-inserts the node when the message changes — JAWS 2024
          and NVDA 2024.1 require populated-to-empty-to-populated
          (NOT populated-to-populated) to re-fire announcements on
          successive submissions. WCAG SC 4.1.3 Status Messages. */}
      <output
        id={`${statusId}-success`}
        aria-label="Form status"
        aria-live="polite"
        className="block min-h-[1.5rem]"
      >
        {formStatus.kind === 'success' && (
          <span
            key={`success-${formStatus.digest}`}
            className="text-success-fg text-sm font-medium"
          >
            Thanks — we&apos;ve received your message. Reference: <code>{formStatus.digest}</code>.
          </span>
        )}
      </output>
      <output
        id={`${statusId}-error`}
        aria-label="Form error"
        role="alert"
        aria-live="assertive"
        className="block"
      >
        {formStatus.kind === 'error' && (
          <span key={`error-${formStatus.message}`} className="text-danger-fg text-sm font-medium">
            {formStatus.message}
          </span>
        )}
      </output>

      <button
        type="submit"
        aria-busy={isSubmitting ? true : undefined}
        disabled={isSubmitting}
        className="bg-accent-primary text-accent-fg hover:bg-accent-primary-hover focus-visible:ring-ring inline-flex min-h-[44px] items-center justify-center rounded px-6 font-medium focus-visible:ring-2 disabled:opacity-50"
      >
        {isSubmitting ? 'Sending…' : 'Send message'}
      </button>
    </form>
  );
}
