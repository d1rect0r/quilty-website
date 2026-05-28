/**
 * In-memory WorkflowEngine fake — contract + vendor-specific tests.
 *
 * Covers the WorkflowEngine port's 6-method surface (start, status,
 * cancel, signal, query, waitForCompletion) plus the testing-only
 * primitives (registerWorkflow, advanceTime, time-skipping for
 * sleep gates).
 *
 * The same suite shape will eventually be parameterised against the
 * Step Functions + Temporal adapters at their activation milestones;
 * shared port-contract assertions live here and validate the LCD
 * across all three engines.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeInMemoryWorkflowEngine } from '../src/adapters/in-memory';
import {
  WorkflowNotFoundError,
  WorkflowQueryNotFoundError,
  WorkflowTimeoutError,
} from '../src/ports/workflow-engine';
import { isTerminal } from '../src/domain/workflow-status';
import { parseExecutionToken } from '../src/domain/execution-token';
import type { WorkflowDefinition, WorkflowEngine } from '../src/ports/workflow-engine';

const noopDefinition: WorkflowDefinition<{ x: number }, { y: number }> = {
  name: 'noop',
  version: '1.0.0',
};

const cancellableDefinition: WorkflowDefinition<{ wait: number }, string> = {
  name: 'cancellable',
  version: '1.0.0',
};

const signallingDefinition: WorkflowDefinition<undefined, string> = {
  name: 'signalling',
  version: '1.0.0',
};

describe('In-memory WorkflowEngine — 6-method contract', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('start() returns an opaque ExecutionToken immediately', async () => {
    const engine = makeInMemoryWorkflowEngine();
    engine.registerWorkflow<{ x: number }, { y: number }>('noop', async (input) => ({
      y: input.x * 2,
    }));
    const token = await engine.start(noopDefinition, { x: 21 });
    expect(token.kind).toBe('in-memory');
  });

  it('status() reaches a completed terminal state after waitForCompletion', async () => {
    // The fake transitions pending → running → completed via
    // microtask scheduling; observing the intermediate 'pending'
    // state from outside is timing-sensitive and intentionally not
    // asserted here. The contract guarantees: status() returns one
    // of the six WorkflowStatus types at any moment, and reaches a
    // terminal state once waitForCompletion resolves.
    const engine = makeInMemoryWorkflowEngine();
    engine.registerWorkflow<{ x: number }, { y: number }>('noop', async (input) => ({
      y: input.x * 2,
    }));
    const token = await engine.start(noopDefinition, { x: 21 });
    await engine.waitForCompletion<{ y: number }>(token);
    const final = await engine.status(token);
    expect(final.type).toBe('completed');
    expect(isTerminal(final)).toBe(true);
  });

  it('waitForCompletion() resolves with the workflow output', async () => {
    const engine = makeInMemoryWorkflowEngine();
    engine.registerWorkflow<{ x: number }, { y: number }>('noop', async (input) => ({
      y: input.x * 2,
    }));
    const token = await engine.start(noopDefinition, { x: 21 });
    const result = await engine.waitForCompletion<{ y: number }>(token);
    expect(result).toEqual({ y: 42 });
  });

  it('waitForCompletion() rejects with WorkflowTimeoutError when timeout exceeded', async () => {
    const engine = makeInMemoryWorkflowEngine();
    engine.registerWorkflow<{ wait: number }, string>('cancellable', async (input, ctx) => {
      await ctx.sleep(input.wait);
      return 'done';
    });
    const token = await engine.start(cancellableDefinition, { wait: 1_000_000 });
    await expect(engine.waitForCompletion(token, { timeout: 50 })).rejects.toBeInstanceOf(
      WorkflowTimeoutError,
    );
  });

  it('cancel() transitions a sleeping workflow to cancelled with reason captured', async () => {
    const engine = makeInMemoryWorkflowEngine();
    engine.registerWorkflow<{ wait: number }, string>('cancellable', async (input, ctx) => {
      await ctx.sleep(input.wait);
      ctx.throwIfCancelled();
      return 'done';
    });
    const token = await engine.start(cancellableDefinition, { wait: 100 });
    await engine.cancel(token, 'user requested');
    await engine.advanceTime(100);
    await expect(engine.waitForCompletion(token)).rejects.toMatchObject({
      name: 'WorkflowCancellationError',
    });
    const final = await engine.status(token);
    expect(final.type).toBe('cancelled');
    if (final.type === 'cancelled') {
      expect(final.reason).toBe('user requested');
    }
  });

  it('signal() delivers payload to the running workflow via waitForSignal', async () => {
    const engine = makeInMemoryWorkflowEngine();
    engine.registerWorkflow<undefined, string>('signalling', async (_input, ctx) => {
      const payload = await ctx.waitForSignal<string>('go');
      return `received:${payload}`;
    });
    const token = await engine.start(signallingDefinition, undefined);
    await engine.signal(token, 'go', 'hello');
    const result = await engine.waitForCompletion<string>(token);
    expect(result).toBe('received:hello');
  });

  it('query() invokes the registered handler against current workflow state', async () => {
    const engine = makeInMemoryWorkflowEngine();
    engine.registerWorkflow<undefined, string>('signalling', async (_input, ctx) => {
      let counter = 0;
      ctx.registerQuery('counter', () => counter);
      counter += 5;
      await ctx.waitForSignal<undefined>('done');
      return 'finished';
    });
    const token = await engine.start(signallingDefinition, undefined);
    // Allow microtasks to drain so the workflow body runs to its
    // first await (registers the handler + increments counter).
    await new Promise<void>((r) => queueMicrotask(r));
    await new Promise<void>((r) => queueMicrotask(r));
    const counter = await engine.query<number>(token, 'counter');
    expect(counter).toBe(5);
    await engine.signal(token, 'done', undefined);
    await engine.waitForCompletion(token);
  });
});

describe('In-memory WorkflowEngine — vendor-specific behaviours', () => {
  it('throws WorkflowNotFoundError on status() with an unknown token', async () => {
    const engine = makeInMemoryWorkflowEngine();
    const bogusToken = { kind: 'in-memory' as const, id: 'does-not-exist' } as Parameters<
      WorkflowEngine['status']
    >[0];
    await expect(engine.status(bogusToken)).rejects.toBeInstanceOf(WorkflowNotFoundError);
  });

  it('start() with an unregistered definition rejects WorkflowNotFoundError', async () => {
    const engine = makeInMemoryWorkflowEngine();
    await expect(
      engine.start({ name: 'no-such-impl', version: '1.0.0' }, undefined),
    ).rejects.toBeInstanceOf(WorkflowNotFoundError);
  });

  it('execution tokens are deterministic counter-based (NOT UUID) for test reproducibility', async () => {
    const engine = makeInMemoryWorkflowEngine();
    engine.registerWorkflow<undefined, string>('signalling', async () => 'ok');
    const t1 = await engine.start(signallingDefinition, undefined);
    const t2 = await engine.start(signallingDefinition, undefined);
    expect(t1.kind === 'in-memory' && t1.id).toBe('1');
    expect(t2.kind === 'in-memory' && t2.id).toBe('2');
  });

  it('advanceTime() resolves multiple pending sleep waiters whose deadlines passed', async () => {
    const engine = makeInMemoryWorkflowEngine();
    let firstResolved = false;
    let secondResolved = false;
    engine.registerWorkflow<{ wait: number }, string>('cancellable', async (input, ctx) => {
      await ctx.sleep(input.wait);
      if (input.wait === 100) firstResolved = true;
      else secondResolved = true;
      return `done:${input.wait}`;
    });
    const t1 = await engine.start(cancellableDefinition, { wait: 100 });
    const t2 = await engine.start(cancellableDefinition, { wait: 250 });
    await engine.advanceTime(100);
    await new Promise<void>((r) => queueMicrotask(r));
    expect(firstResolved).toBe(true);
    expect(secondResolved).toBe(false);
    await engine.advanceTime(150);
    await new Promise<void>((r) => queueMicrotask(r));
    expect(secondResolved).toBe(true);
    await engine.waitForCompletion(t1);
    await engine.waitForCompletion(t2);
  });

  it('getExecutionState exposes internal state (testing-only escape hatch)', async () => {
    const engine = makeInMemoryWorkflowEngine();
    engine.registerWorkflow<undefined, string>('signalling', async () => 'done');
    const token = await engine.start(signallingDefinition, undefined);
    const state = engine.getExecutionState(token);
    expect(state?.definitionName).toBe('signalling');
  });
});

describe('In-memory WorkflowEngine — Phase-B regression coverage', () => {
  it('waitForSignal rejects with WorkflowCancellationError on cancel(token) while parked', async () => {
    // Phase-A bug-hunter D3-B1: the prior microtask-spin model
    // never rejected a parked waiter on cancel(); this asserts the
    // push-model registry's cancel-walk wires through.
    const engine = makeInMemoryWorkflowEngine();
    engine.registerWorkflow<undefined, string>('signalling', async (_input, ctx) => {
      await ctx.waitForSignal<string>('never-arrives');
      return 'unreachable';
    });
    const token = await engine.start(signallingDefinition, undefined);
    // Yield twice so the workflow body parks its waiter.
    await new Promise<void>((r) => queueMicrotask(r));
    await new Promise<void>((r) => queueMicrotask(r));
    await engine.cancel(token, 'test-cancel');
    await expect(engine.waitForCompletion(token)).rejects.toMatchObject({
      name: 'WorkflowCancellationError',
    });
  });

  it('waitForCompletion timeout clears the setTimeout handle (no event-loop hold)', async () => {
    // Phase-A bug-hunter D3-B2: validating the handle is cleared
    // is awkward without inspecting the event loop, but the
    // observable contract is that a fast-completing workflow with
    // a long timeout returns immediately on resolution AND a
    // subsequent status() reports `completed` (NOT `timed-out`).
    const engine = makeInMemoryWorkflowEngine();
    engine.registerWorkflow<undefined, string>('signalling', async () => 'fast');
    const token = await engine.start(signallingDefinition, undefined);
    const result = await engine.waitForCompletion<string>(token, { timeout: 60_000 });
    expect(result).toBe('fast');
    const finalStatus = await engine.status(token);
    expect(finalStatus.type).toBe('completed');
  });

  it('emits timed-out terminal status when waitForCompletion times out', async () => {
    // Phase-A bug-hunter D3-B6: status() previously returned
    // 'running' indefinitely after a timeout reject.
    const engine = makeInMemoryWorkflowEngine();
    engine.registerWorkflow<{ wait: number }, string>('cancellable', async (input, ctx) => {
      await ctx.sleep(input.wait);
      return 'done';
    });
    const token = await engine.start(cancellableDefinition, { wait: 1_000_000 });
    await expect(engine.waitForCompletion(token, { timeout: 50 })).rejects.toBeInstanceOf(
      WorkflowTimeoutError,
    );
    const finalStatus = await engine.status(token);
    expect(finalStatus.type).toBe('timed-out');
  });

  it('query against an unregistered handler throws WorkflowQueryNotFoundError (NOT NotFoundError)', async () => {
    // Phase-A bug-hunter D3-B7: distinguishing "execution gone"
    // from "query gone" makes the HTTP status mapping unambiguous.
    const engine = makeInMemoryWorkflowEngine();
    engine.registerWorkflow<undefined, string>('signalling', async (_input, ctx) => {
      await ctx.waitForSignal<undefined>('done');
      return 'ok';
    });
    const token = await engine.start(signallingDefinition, undefined);
    await new Promise<void>((r) => queueMicrotask(r));
    await expect(engine.query(token, 'missing')).rejects.toBeInstanceOf(WorkflowQueryNotFoundError);
    await engine.signal(token, 'done', undefined);
    await engine.waitForCompletion(token);
  });

  it('parseExecutionToken round-trips a JSON-serialised in-memory token', () => {
    // Phase-A bug-hunter D3-B5 + TS-7: the brand is compile-time
    // only, so deserialised tokens MUST re-pass through this
    // validator before being typed as ExecutionToken.
    const original = JSON.stringify({ kind: 'in-memory', id: '42' });
    const parsed = parseExecutionToken(JSON.parse(original));
    expect(parsed.kind).toBe('in-memory');
    if (parsed.kind === 'in-memory') {
      expect(parsed.id).toBe('42');
    }
  });

  it('parseExecutionToken rejects malformed shapes with a legible error', () => {
    expect(() => parseExecutionToken(null)).toThrow(/must be an object/);
    expect(() => parseExecutionToken({ kind: 'sfn' })).toThrow(/missing executionArn/);
    expect(() => parseExecutionToken({ kind: 'wat' })).toThrow(/unknown token kind/);
  });
});
