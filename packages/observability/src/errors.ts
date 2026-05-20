/**
 * Typed errors for the observability package.
 *
 * Each port that can fail returns a Result envelope whose error branch is one
 * of these discriminated-union members. The factory wrappers compose these
 * into the consent-gate / sanitizer chokepoint without ever swallowing the
 * underlying cause.
 */

export interface ConsentDeniedError {
  readonly kind: 'consent_denied';
  readonly required: 'analytics' | 'marketing' | 'preferences';
}

export interface AdapterUnavailableError {
  readonly kind: 'adapter_unavailable';
  readonly reason: string;
}

export interface PhiAssertionError {
  readonly kind: 'phi_assertion_failed';
  readonly findings: readonly string[];
}

export type AnalyticsError = ConsentDeniedError | AdapterUnavailableError | PhiAssertionError;

export interface ReplayConfigError {
  readonly kind: 'replay_config_rejected';
  readonly reason: string;
}

export type ReplayError = AdapterUnavailableError | ReplayConfigError;

export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };
