/**
 * Server-only barrel — consumed by the server + edge composition roots via
 * `import { … } from '@quilty/guest-state/server'`. The store adapters carry
 * an in-process Map (in-memory) or a Node-only SDK (DynamoDB) and must never
 * instantiate in a client bundle; the `server-only` guard on each adapter
 * enforces that at build time.
 */

export { makeInMemoryGuestStateStore } from '../adapters/in-memory';
export {
  makeDynamoDBGuestStateStore,
  type DynamoDBGuestStateStoreInput,
} from '../adapters/dynamodb';
