/**
 * Email package ports.
 *
 * Single hexagonal port: `EmailSender` carries transactional email
 * payloads to one of the adapters (in-memory in tests + pre-SES-lift,
 * SES once the AWS sandbox is lifted + a BAA is in force).
 *
 * D31 invariant — zero PHI in email content. Email subject + body MUST
 * NOT contain identifying clinical fields (free-text symptom notes,
 * therapy session content, anything from a mental-health prompt
 * response). Transactional emails are scoped to identity/auth/billing:
 *   - email-verification
 *   - password-reset
 *   - account-deletion-confirmation
 *   - subscription-renewal-receipt
 *   - sign-in-from-new-device-alert
 *
 * The `EmailKind` enum below is the closed set. Adding a new kind
 * requires a HIPAA review at the time of the schema change, not a code
 * review of the call site.
 *
 * Naming discipline (META-1): the port + types carry no vendor names —
 * vendor identifiers appear only inside `adapters/<vendor>.ts`.
 */

/**
 * Closed set of transactional email kinds. Each is a non-PHI surface
 * by construction. Mental-health clinical content (therapy notes,
 * symptom reports, AI conversation transcripts) is forbidden in this
 * channel; those flows do not use email.
 */
export type EmailKind =
  | 'email_verification'
  | 'password_reset'
  | 'account_deletion_confirmation'
  | 'subscription_renewal_receipt'
  | 'sign_in_from_new_device_alert';

/**
 * Per-recipient send envelope. The adapter renders the subject + body
 * from the `kind` + `templateData` payload (templates live in a future
 * `templates/` subdirectory; M1.5 ships the port without templates).
 *
 * `templateData` is structurally typed as `Readonly<Record<string,
 * string | number>>` (no nested objects, no arrays, no PHI-shaped
 * strings) so the PHI sanitizer chokepoint at the adapter layer can
 * walk it without recursion overflow risk. Free-text user input must
 * NOT appear here; the call site classifies into a fixed schema.
 */
export interface EmailEnvelope {
  readonly kind: EmailKind;
  readonly to: string;
  readonly templateData: Readonly<Record<string, string | number>>;
}

/**
 * Result of a send attempt. Adapters return `Result` rather than
 * throwing so the call site can decide whether a transient failure is
 * retry-worthy (email delivery is inherently best-effort).
 */
export type EmailSendResult =
  | { readonly ok: true; readonly providerId: string }
  | { readonly ok: false; readonly reason: 'transient' | 'permanent'; readonly message: string };

/**
 * EmailSender port — single send call. Composition root wires the
 * production adapter (in-memory at M1.5; SES once sandbox-lift +
 * BAA-execute). Consumer code MUST NOT call vendor SDKs directly per
 * D67 (the dep-cruiser rule + ESLint chokepoint enforce this).
 */
export interface EmailSender {
  readonly send: (envelope: EmailEnvelope) => Promise<EmailSendResult>;
}
