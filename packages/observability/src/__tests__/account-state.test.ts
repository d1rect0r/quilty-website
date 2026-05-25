import { describe, expect, it } from 'vitest';
import { ACCOUNT_DELETE_REASONS, type AccountDeleteReason } from '../domain/account-delete-reason';
import {
  ACCOUNT_DELETION_GRACE_PERIOD_MS,
  deriveAccountStateFromReason,
  deriveStatesFromReason,
  type AccountState,
} from '../domain/account-state';

/**
 * Contract tests for the D137 + Talkspace-canon AccountState +
 * ClinicalRecordsState scaffold. Five invariants under test:
 *
 *   1. The 9-value AccountDeleteReason enum ships in the
 *      load-bearing order.
 *   2. `taking_break` → hibernating accountState +
 *      access_restricted clinicalState (Talkspace 2024 canon).
 *   3. All other reasons → pending_deletion accountState +
 *      retained_for_6_years clinicalState (Stripe/Plaid/Calm/
 *      Notion 30-day grace + HIPAA §164.530(j) retention).
 *   4. The 30-day grace constant is exactly
 *      30 × 24 × 60 × 60 × 1000 ms; `expires_at` is exactly
 *      that far past `deletion_requested_at`.
 *   5. The discriminated-union narrowing is exhaustive +
 *      `deriveAccountStateFromReason` cannot return `active`.
 */

const FIXED_TIMESTAMP = '2026-05-25T12:00:00.000Z';
const fixedNow = (): string => FIXED_TIMESTAMP;

describe('AccountDeleteReason 9-value canonical set', () => {
  it('enumerates all 9 reasons in load-bearing order', () => {
    expect(ACCOUNT_DELETE_REASONS).toEqual([
      'too_expensive',
      'not_helpful',
      'privacy',
      'switched_provider',
      'taking_break',
      'missing_features',
      'medical_records_retain',
      'other_specified',
      'other_not_specified',
    ]);
  });

  it('contains exactly 9 values (no silent enum drift)', () => {
    expect(ACCOUNT_DELETE_REASONS).toHaveLength(9);
  });

  it('renames `unspecified` to `other_not_specified` (no legacy value)', () => {
    expect(ACCOUNT_DELETE_REASONS as readonly string[]).not.toContain('unspecified');
    expect(ACCOUNT_DELETE_REASONS).toContain('other_not_specified');
  });

  it('adds the three expansion values (taking_break, missing_features, medical_records_retain)', () => {
    expect(ACCOUNT_DELETE_REASONS).toContain('taking_break');
    expect(ACCOUNT_DELETE_REASONS).toContain('missing_features');
    expect(ACCOUNT_DELETE_REASONS).toContain('medical_records_retain');
  });
});

describe('ACCOUNT_DELETION_GRACE_PERIOD_MS (Stripe/Plaid/Calm/Notion canon)', () => {
  it('equals 30 days in milliseconds', () => {
    expect(ACCOUNT_DELETION_GRACE_PERIOD_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

describe('deriveStatesFromReason — Talkspace + HIPAA canonical mapping', () => {
  it('routes `taking_break` to hibernating + access_restricted', () => {
    const out = deriveStatesFromReason('taking_break', fixedNow);
    expect(out.accountState.kind).toBe('hibernating');
    expect(out.clinicalState).toBe('access_restricted');
    if (out.accountState.kind === 'hibernating') {
      expect(out.accountState.hibernated_at).toBe(FIXED_TIMESTAMP);
    }
  });

  it.each<AccountDeleteReason>([
    'too_expensive',
    'not_helpful',
    'privacy',
    'switched_provider',
    'missing_features',
    'medical_records_retain',
    'other_specified',
    'other_not_specified',
  ])('routes %s to pending_deletion + retained_for_6_years', (reason) => {
    const out = deriveStatesFromReason(reason, fixedNow);
    expect(out.accountState.kind).toBe('pending_deletion');
    expect(out.clinicalState).toBe('retained_for_6_years');
    if (out.accountState.kind === 'pending_deletion') {
      expect(out.accountState.reason).toBe(reason);
      expect(out.accountState.deletion_requested_at).toBe(FIXED_TIMESTAMP);
      // expires_at is exactly 30 days after the request timestamp
      const expectedExpiry = new Date(
        Date.parse(FIXED_TIMESTAMP) + ACCOUNT_DELETION_GRACE_PERIOD_MS,
      ).toISOString();
      expect(out.accountState.expires_at).toBe(expectedExpiry);
    }
  });

  it('defaults `now` to `new Date().toISOString()` when omitted', () => {
    const before = Date.now();
    const out = deriveStatesFromReason('too_expensive');
    const after = Date.now();
    expect(out.accountState.kind).toBe('pending_deletion');
    if (out.accountState.kind === 'pending_deletion') {
      const ts = Date.parse(out.accountState.deletion_requested_at);
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
      // ISO 8601 UTC format ends with Z (ECMA-262 spec)
      expect(out.accountState.deletion_requested_at).toMatch(/Z$/);
    }
  });

  it('throws TypeError when injected `now` returns a non-ISO-8601 string', () => {
    // Defends against an injected clock contract violation: the
    // Date.parse(ts) + GRACE_PERIOD_MS math below would otherwise
    // produce NaN, and new Date(NaN).toISOString() throws a generic
    // RangeError. The guard surfaces the contract violation explicitly.
    expect(() => deriveStatesFromReason('privacy', () => 'yesterday')).toThrow(TypeError);
    expect(() => deriveStatesFromReason('privacy', () => 'not-a-date')).toThrow(/ISO 8601/);
  });

  it('grace-period math: expires_at minus deletion_requested_at equals 30 days', () => {
    const out = deriveStatesFromReason('privacy', fixedNow);
    if (out.accountState.kind !== 'pending_deletion') {
      throw new Error('expected pending_deletion branch');
    }
    const delta =
      Date.parse(out.accountState.expires_at) - Date.parse(out.accountState.deletion_requested_at);
    expect(delta).toBe(ACCOUNT_DELETION_GRACE_PERIOD_MS);
  });
});

describe('deriveAccountStateFromReason — legacy single-state helper', () => {
  it('returns the accountState half of the tuple (taking_break path)', () => {
    const out = deriveAccountStateFromReason('taking_break', fixedNow);
    expect(out.kind).toBe('hibernating');
  });

  it('returns pending_deletion for non-taking_break reasons', () => {
    const out = deriveAccountStateFromReason('privacy', fixedNow);
    expect(out.kind).toBe('pending_deletion');
  });

  it('cannot return active (type narrowed via Exclude)', () => {
    // This is a TYPE-LEVEL contract: the function signature excludes
    // `{ kind: 'active' }` from the return type. The test below
    // demonstrates that a switch over the return must NOT need an
    // `'active'` branch — the type narrowing makes it unreachable.
    const out = deriveAccountStateFromReason('too_expensive', fixedNow);
    function describe_(state: typeof out): string {
      switch (state.kind) {
        case 'hibernating':
          return `hibernating since ${state.hibernated_at}`;
        case 'pending_deletion':
          return `pending_deletion (${state.reason}) until ${state.expires_at}`;
        case 'deleted':
          return `deleted (${state.reason}) at ${state.deleted_at}`;
        default: {
          const _exhaustive: never = state;
          return _exhaustive;
        }
      }
    }
    expect(describe_(out)).toMatch(/^pending_deletion \(too_expensive\)/);
  });
});

describe('AccountState discriminated union — exhaustive narrowing', () => {
  it('full AccountState type supports the active branch (pre-delete states)', () => {
    // The full AccountState type retains the `active` branch even
    // though deriveAccountStateFromReason can't return it. This is
    // important: pre-delete state is `active`; only post-request
    // states are produced by the helpers.
    const activeState: AccountState = { kind: 'active' };
    function describe_(state: AccountState): string {
      switch (state.kind) {
        case 'active':
          return 'active';
        case 'hibernating':
          return `hibernating since ${state.hibernated_at}`;
        case 'pending_deletion':
          return `pending_deletion (${state.reason}) until ${state.expires_at}`;
        case 'deleted':
          return `deleted (${state.reason}) at ${state.deleted_at}`;
        default: {
          const _exhaustive: never = state;
          return _exhaustive;
        }
      }
    }
    expect(describe_(activeState)).toBe('active');
  });
});
