/**
 * `wrapReplay` — enforces D68 invariants at `initialize()` time.
 *
 * Mandatory floor for every Replay adapter:
 *   - `sessionSampleRate: 0` — no always-on replay (HIPAA-aligned).
 *     Any config that tries to set a non-zero rate is rejected.
 *   - `maskAllText: true`, `blockAllMedia: true`, `maskAllInputs: true`
 *     default-on. Callers may override to MORE-restrictive (`true` →
 *     `true` no-op), never less-restrictive.
 *
 * Per the locked vendor matrix: Sentry Replay is the only acceptable
 * adapter. Amplitude Session Replay is rejected outright (HTML-attribute
 * leak is structural). The wrapper does not enforce vendor identity —
 * that's the composition root's job — but the contract test asserts the
 * floor against the Sentry adapter.
 */

import type { Replay, ReplayConfig } from '../ports';

export interface WrappedReplayOptions {
  readonly adapter: Replay;
}

const MANDATORY_FLOOR: Required<
  Pick<ReplayConfig, 'sessionSampleRate' | 'maskAllText' | 'blockAllMedia' | 'maskAllInputs'>
> = {
  sessionSampleRate: 0,
  maskAllText: true,
  blockAllMedia: true,
  maskAllInputs: true,
};

export function wrapReplay(options: WrappedReplayOptions): Replay {
  const { adapter } = options;
  return {
    initialize: async (config?: Partial<ReplayConfig>): Promise<void> => {
      // sessionSampleRate is the only field that's an OUTRIGHT REJECT
      // if the caller passes anything but 0 — D68 says zero, full stop.
      if (config?.sessionSampleRate !== undefined && config.sessionSampleRate !== 0) {
        // Throwing here is fail-loud at composition time — easier to
        // catch in tests + CI than a silent override.
        throw new Error(
          'Replay sessionSampleRate must be 0 per D68 (HIPAA-aligned posture); always-on replay is not permitted.',
        );
      }
      await adapter.initialize(MANDATORY_FLOOR);
    },
  };
}
