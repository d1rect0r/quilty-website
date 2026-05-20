/**
 * Compatibility shim — `assertNoPHI` has migrated to @quilty/security
 * alongside the Sanitizer primitive (it depends on `isSensitiveKey`).
 *
 * This file is a thin re-export so the legacy observability internals
 * keep working until the observability extraction deletes this directory
 * and re-wires every caller to `@quilty/security` directly.
 */

export { assertNoPHI } from '@quilty/security';
