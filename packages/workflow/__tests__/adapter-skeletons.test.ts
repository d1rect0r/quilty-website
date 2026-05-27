/**
 * Adapter-skeleton activation-gate tests.
 *
 * Both production adapters (`makeStepFunctionsAdapter` +
 * `makeTemporalAdapter`) throw at instantiation by design until the
 * activation triggers per ADR-0021 fire. These tests lock the shape:
 *   - The factory functions are callable with their typed options.
 *   - Instantiation surfaces an `instanceof Error` failure pointing
 *     at the activation ADR (catch-block ergonomics + log-grep names).
 *   - The error names match the class names exactly.
 *
 * Pivot at activation: when a real adapter ships, this file is
 * replaced with vendor-specific behaviour assertions; the contract
 * tests in `in-memory-fake.test.ts` become parameterised against
 * the now-live adapters.
 */

import { describe, expect, it } from 'vitest';
import {
  makeStepFunctionsAdapter,
  StepFunctionsAdapterNotActivatedError,
} from '../src/adapters/step-functions';
import { makeTemporalAdapter, TemporalAdapterNotActivatedError } from '../src/adapters/temporal';

describe('Step Functions adapter skeleton — activation gate', () => {
  it('throws StepFunctionsAdapterNotActivatedError on instantiation', () => {
    expect(() =>
      makeStepFunctionsAdapter({
        region: 'us-east-1',
        stateMachineArns: new Map(),
        sidecarTableName: 'quilty-workflow-sidecar',
      }),
    ).toThrow(StepFunctionsAdapterNotActivatedError);
  });

  it('error name matches class for log-grep ergonomics', () => {
    try {
      makeStepFunctionsAdapter({
        region: 'us-east-1',
        stateMachineArns: new Map(),
        sidecarTableName: 'fake',
      });
      expect.fail('expected makeStepFunctionsAdapter to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      if (err instanceof Error) {
        expect(err.name).toBe('StepFunctionsAdapterNotActivatedError');
      }
    }
  });

  it('error message points at ADR-0021 activation gate', () => {
    expect(() =>
      makeStepFunctionsAdapter({
        region: 'us-east-1',
        stateMachineArns: new Map(),
        sidecarTableName: 'fake',
      }),
    ).toThrow(/ADR-0021/);
  });
});

describe('Temporal Cloud adapter skeleton — activation gate', () => {
  it('throws TemporalAdapterNotActivatedError on instantiation', () => {
    expect(() =>
      makeTemporalAdapter({
        namespace: 'test.a1b2c3',
        clientCert: 'stub',
        clientKey: 'stub',
        taskQueue: 'default',
      }),
    ).toThrow(TemporalAdapterNotActivatedError);
  });

  it('error message points at ADR-0021 activation gate', () => {
    expect(() =>
      makeTemporalAdapter({
        namespace: 'test',
        clientCert: 'stub',
        clientKey: 'stub',
        taskQueue: 'default',
      }),
    ).toThrow(/ADR-0021/);
  });
});
