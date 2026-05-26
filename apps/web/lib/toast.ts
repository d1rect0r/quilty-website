'use client';

/**
 * Typed toast helpers — wraps the underlying toast vendor at a single
 * point. Consumers `import { toast } from '@/lib/toast'` and never
 * touch the vendor module directly. Vendor swap is a one-file change
 * here (per D18 + ADR-0014 Rule 5).
 *
 * UX behavior locked per ADR-0017 Decision I:
 *   - retry-on-second-failure: `toast.info('Reconnecting…')` fires when
 *     the api-client's `onRetry` callback observes attempt ≥ 2.
 *   - generic info / success / error helpers for future use.
 */

import { toast as sonnerToast } from 'sonner';

export interface ToastOptions {
  readonly durationMs?: number;
}

const DEFAULT_DURATION_MS = 3000;
const ERROR_DURATION_MS = 5000;

export const toast = {
  info(message: string, options: ToastOptions = {}): void {
    sonnerToast.info(message, { duration: options.durationMs ?? DEFAULT_DURATION_MS });
  },
  success(message: string, options: ToastOptions = {}): void {
    sonnerToast.success(message, { duration: options.durationMs ?? DEFAULT_DURATION_MS });
  },
  error(message: string, options: ToastOptions = {}): void {
    sonnerToast.error(message, { duration: options.durationMs ?? ERROR_DURATION_MS });
  },
  /**
   * The retry-visibility surface (ADR-0017 Decision I) — fires from
   * the api-client `onRetry` callback at attempt ≥ 2. Distinct helper
   * so a future visual-identity reskin can theme this specific toast differently
   * without re-wiring the api-client's callback path.
   */
  reconnecting(): void {
    sonnerToast.info('Reconnecting…', { duration: DEFAULT_DURATION_MS });
  },
};
