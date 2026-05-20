/**
 * Compatibility shim — the Sanitizer primitive has migrated to
 * @quilty/security per D67 (the chokepoint primitive belongs in the
 * security package, not the observability package, because the email,
 * captcha, and rate-limit packages also depend on it).
 *
 * This file is a thin re-export so the legacy observability internals +
 * Sentry config files keep working until the observability extraction
 * deletes this directory and re-wires every caller to `@quilty/security`
 * directly.
 */

export { sanitize, sanitizeAsync, isSensitiveKey } from '@quilty/security';
