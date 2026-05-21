/**
 * Contract test for `wrapReplay` — verifies the D68 floor:
 *   - sessionSampleRate MUST be 0 (no always-on replay)
 *   - mask-all + block-all defaults applied
 *   - non-zero session sample rate is rejected outright
 */

import { describe, expect, it } from 'vitest';
import { makeReplayFake } from '../testing/index.js';
import { wrapReplay } from '../domain/wrap-replay.js';

describe('wrapReplay — D68 floor enforcement', () => {
  it('initializes once when given no config', async () => {
    const adapter = makeReplayFake();
    const wrapped = wrapReplay({ adapter });

    await wrapped.initialize();

    expect(adapter.initializeCalls).toBe(1);
  });

  it('accepts an explicit sessionSampleRate: 0 (the only permitted value)', async () => {
    const adapter = makeReplayFake();
    const wrapped = wrapReplay({ adapter });

    await wrapped.initialize({ sessionSampleRate: 0 });

    expect(adapter.initializeCalls).toBe(1);
  });

  it('rejects sessionSampleRate > 0 (HIPAA-aligned floor)', async () => {
    const adapter = makeReplayFake();
    const wrapped = wrapReplay({ adapter });

    // The cast bypasses TS structural narrowing — we want to verify the
    // RUNTIME guard rejects this regardless of how the caller invokes it.
    const bad = { sessionSampleRate: 0.5 } as unknown as Parameters<typeof wrapped.initialize>[0];

    await expect(wrapped.initialize(bad)).rejects.toThrow(/sessionSampleRate must be 0/);
    expect(adapter.initializeCalls).toBe(0);
  });

  it('rejects sessionSampleRate: 1 (defense-in-depth on the always-on form)', async () => {
    const adapter = makeReplayFake();
    const wrapped = wrapReplay({ adapter });

    const bad = { sessionSampleRate: 1 } as unknown as Parameters<typeof wrapped.initialize>[0];

    await expect(wrapped.initialize(bad)).rejects.toThrow(/sessionSampleRate must be 0/);
    expect(adapter.initializeCalls).toBe(0);
  });
});
