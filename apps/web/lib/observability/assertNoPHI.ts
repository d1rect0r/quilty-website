import { isSensitiveKey } from '@/lib/observability/sanitize';

/**
 * Runtime PHI-shape assertion. Throws in development + test on any payload
 * that contains a PHI-shaped key. Production behavior is silent (the
 * sanitizer in `lib/observability/sanitize.ts` is the production defense;
 * this assertion is a developer-feedback layer that catches mistakes
 * before they hit production CloudWatch).
 *
 * Belt-and-suspenders with `sanitize()` — sanitize is the redaction layer;
 * assertNoPHI is the surface-the-bug layer.
 *
 * Use:
 *   assertNoPHI({ user_id: '...', email: '...' }, 'analytics:event');
 *   // throws in dev: PHI key 'email' detected in payload at analytics:event
 */
export function assertNoPHI(payload: unknown, context: string): void {
  if (process.env.NODE_ENV === 'production') return;

  const findings = collectSensitiveKeys(payload, '', new Set());
  if (findings.length > 0) {
    throw new Error(
      `PHI keys detected in payload at ${context}: ${findings.join(', ')}. ` +
        `Either redact at the call site or pass through sanitize() in lib/observability/sanitize.ts.`,
    );
  }
}

function collectSensitiveKeys(
  value: unknown,
  path: string,
  seen: Set<unknown>,
): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value !== 'object') return [];
  if (seen.has(value)) return [];
  seen.add(value);

  const findings: string[] = [];

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      findings.push(...collectSensitiveKeys(value[i], `${path}[${i}]`, seen));
    }
    return findings;
  }

  for (const [k, v] of Object.entries(value as object)) {
    const here = path ? `${path}.${k}` : k;
    if (isSensitiveKey(k)) {
      findings.push(here);
    }
    findings.push(...collectSensitiveKeys(v, here, seen));
  }

  return findings;
}
