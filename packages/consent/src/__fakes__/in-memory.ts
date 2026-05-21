/**
 * In-memory ConsentReader for tests. Returns a caller-controlled
 * `ConsentSnapshot` every call.
 */

import type { ConsentReader, ConsentSnapshot } from '../ports.js';

export interface InMemoryConsentReaderInput {
  readonly snapshot: ConsentSnapshot;
}

export function makeInMemoryConsentReader(input: InMemoryConsentReaderInput): ConsentReader {
  return {
    read: () => input.snapshot,
  };
}
