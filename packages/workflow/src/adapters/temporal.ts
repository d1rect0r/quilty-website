/**
 * Temporal Cloud adapter — SKELETON.
 *
 * Throws `TemporalAdapterNotActivatedError` at instantiation per
 * ADR-0021. Activation trigger: cascading-complexity migration from
 * Step Functions to Temporal Cloud (typically when a workflow needs
 * durable signals + queries that the SFN sidecar emulation can't
 * support efficiently — usually around the third or fourth
 * workflow definition).
 *
 * Temporal Cloud HIPAA posture (ADR-0021 §HIPAA):
 *   - HIPAA-eligible service with BAA signed.
 *   - SOC 2 Type II.
 *   - Same constraint as SFN: never put raw PHI in workflow I/O
 *     payloads; pass S3 URIs only. Temporal's event history stores
 *     full payloads forever (default retention is 30 days; HIPAA
 *     workflows should explicitly opt-in to shorter retention).
 *   - Encryption in transit: Temporal Cloud TLS + mTLS for client
 *     auth. Encryption at rest: HSM-backed AWS KMS.
 */

import { WorkflowEngineError, type WorkflowEngine } from '../ports/workflow-engine';

/**
 * Minimal Temporal `PayloadCodec` shape — client-side encoding hook
 * Temporal runs over every workflow input/output before the bytes
 * reach the server. Required for HIPAA workflows per ADR-0021
 * §HIPAA: workflow PARAMETERS (S3 URIs, request IDs) still hit
 * Temporal's event history; the codec encrypts them with a
 * KMS-managed key so the server sees opaque bytes only.
 *
 * Mirrors `@temporalio/common`'s `PayloadCodec` interface (kept
 * narrow here so a Temporal major-version bump doesn't quietly
 * widen the adapter's contract).
 */
export interface TemporalPayloadCodec {
  readonly encode: (payloads: readonly Uint8Array[]) => Promise<readonly Uint8Array[]>;
  readonly decode: (payloads: readonly Uint8Array[]) => Promise<readonly Uint8Array[]>;
}

export interface TemporalAdapterOptions {
  /** Temporal Cloud namespace (e.g., 'quilty.a1b2c3'). */
  readonly namespace: string;
  /** mTLS client cert + key (read from secrets at adapter init). */
  readonly clientCert: string;
  readonly clientKey: string;
  /** Task queue the workers poll. */
  readonly taskQueue: string;
  /**
   * Optional client-side encryption hook for workflow payloads.
   * REQUIRED for any workflow that handles PHI per ADR-0021
   * §HIPAA — without it, parameter bytes hit Temporal's event
   * history unencrypted. The skeleton reserves the slot; the
   * activation commit will throw `TemporalAdapterNotActivatedError`
   * if a HIPAA-tagged workflow is wired without a codec.
   */
  readonly payloadCodec?: TemporalPayloadCodec;
}

export class TemporalAdapterNotActivatedError extends WorkflowEngineError {
  constructor() {
    super(
      'Temporal Cloud adapter not activated. Activate when SFN sidecar ' +
        'emulation of signals/queries no longer scales (typically by the ' +
        '3rd-4th workflow definition) per ADR-0021. See ' +
        'packages/workflow/src/adapters/README.md.',
    );
    this.name = 'TemporalAdapterNotActivatedError';
  }
}

export function makeTemporalAdapter(_options: TemporalAdapterOptions): WorkflowEngine {
  throw new TemporalAdapterNotActivatedError();
}
