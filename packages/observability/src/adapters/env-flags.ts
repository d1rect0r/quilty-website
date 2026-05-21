/**
 * env-var FeatureFlagEvaluator adapter (D43).
 *
 * Reads `FEATURE_FLAG_<NAME>` env vars; defaults to the caller's safe
 * fallback when the env var is unset, empty, or any value other than
 * the literal string `'true'`. Defense-in-depth against typos like
 * `'TRUE'` or `'1'` enabling unintentionally.
 *
 * The runtime-toggle vendor flags adapter (D43; Amplitude Experiment
 * per the locked Amplitude pivot) replaces this adapter at the trigger
 * point without changing the FeatureFlagEvaluator port signature.
 *
 * LaunchDarkly Oct 2025 outage lesson: callers supply the default at
 * the call site. If the future runtime-toggle adapter is unreachable,
 * it returns the supplied default rather than `false`-everything.
 */

import type { FeatureFlagEvaluator } from '../ports';

function envName(flagName: string): string {
  // Mirror the legacy convention `FEATURE_FLAG_<UPPER>`.
  return `FEATURE_FLAG_${flagName.toUpperCase()}`;
}

export function makeEnvFlagEvaluator(): FeatureFlagEvaluator {
  return {
    flag: <T>(name: string, defaultValue: T): T => {
      const raw = process.env[envName(name)];
      if (raw === undefined || raw === '') return defaultValue;
      // Only the literal string 'true' enables a boolean flag.
      if (typeof defaultValue === 'boolean') {
        return (raw === 'true') as T;
      }
      return raw as T;
    },
    all: (): Readonly<Record<string, unknown>> => {
      const prefix = 'FEATURE_FLAG_';
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(process.env)) {
        if (key.startsWith(prefix) && value !== undefined) {
          const flagKey = key.slice(prefix.length).toLowerCase();
          out[flagKey] = value === 'true' ? true : value === 'false' ? false : value;
        }
      }
      return out;
    },
  };
}
