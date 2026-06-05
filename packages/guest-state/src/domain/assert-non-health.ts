import { isSensitiveKey } from '@quilty/security';
import type { GuestStateSnapshot } from '../ports';

/**
 * Hard zero-PHI contract for the guest-state carrier (D31). Deep-walks a
 * snapshot and THROWS on any health/PHI-shaped key, in EVERY environment
 * (unlike `assertNoPHI`, which is dev/test-only developer feedback — this
 * is a load-bearing write-time invariant the carrier must never violate,
 * including in production).
 *
 * It checks KEY NAMES against the shared `isSensitiveKey` denylist (the
 * same single source the observability PHI sanitizer uses), so the carrier
 * can never structurally hold a `diagnosis` / `condition` / `medication` /
 * `email` / … field, at the top level or nested inside `selections` /
 * `attribution`. Free-text VALUES are not classifiable and are not scanned;
 * the structural key ban is the enforceable contract.
 */
export function assertGuestStateNonHealth(snapshot: GuestStateSnapshot): void {
  const findings = collectSensitiveKeys(snapshot, '', new Set());
  if (findings.length > 0) {
    throw new Error(
      `Guest-state carrier rejected health-shaped field(s) (zero-PHI, D31): ${findings.join(', ')}. ` +
        `The guest carrier holds NON-health UI/nav state only.`,
    );
  }
}

function collectSensitiveKeys(value: unknown, path: string, seen: Set<unknown>): string[] {
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

  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const here = path ? `${path}.${k}` : k;
    if (isSensitiveKey(k)) {
      findings.push(here);
    }
    findings.push(...collectSensitiveKeys(v, here, seen));
  }

  return findings;
}
