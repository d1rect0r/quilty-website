import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeEnvFlagEvaluator } from '../adapters/env-flags.js';

describe('env-flag FeatureFlagEvaluator', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the default when the env var is unset', () => {
    const evaluator = makeEnvFlagEvaluator();
    expect(evaluator.flag('my_flag', false)).toBe(false);
    expect(evaluator.flag('my_flag', true)).toBe(true);
  });

  it('returns the default when the env var is empty', () => {
    vi.stubEnv('FEATURE_FLAG_MY_FLAG', '');
    const evaluator = makeEnvFlagEvaluator();
    expect(evaluator.flag('my_flag', false)).toBe(false);
  });

  it('returns true only on the literal string `true` (defense-in-depth)', () => {
    vi.stubEnv('FEATURE_FLAG_MY_FLAG', 'true');
    expect(makeEnvFlagEvaluator().flag('my_flag', false)).toBe(true);

    vi.stubEnv('FEATURE_FLAG_MY_FLAG', 'TRUE');
    expect(makeEnvFlagEvaluator().flag('my_flag', false)).toBe(false);

    vi.stubEnv('FEATURE_FLAG_MY_FLAG', '1');
    expect(makeEnvFlagEvaluator().flag('my_flag', false)).toBe(false);

    vi.stubEnv('FEATURE_FLAG_MY_FLAG', 'yes');
    expect(makeEnvFlagEvaluator().flag('my_flag', false)).toBe(false);
  });

  it('returns the raw string for non-boolean defaults', () => {
    vi.stubEnv('FEATURE_FLAG_VARIANT', 'b');
    expect(makeEnvFlagEvaluator().flag('variant', 'a')).toBe('b');
  });

  it('all() snapshots every FEATURE_FLAG_ env var', () => {
    vi.stubEnv('FEATURE_FLAG_A', 'true');
    vi.stubEnv('FEATURE_FLAG_B', 'false');
    vi.stubEnv('FEATURE_FLAG_C', 'variant');
    const snap = makeEnvFlagEvaluator().all();
    expect(snap['a']).toBe(true);
    expect(snap['b']).toBe(false);
    expect(snap['c']).toBe('variant');
  });
});
