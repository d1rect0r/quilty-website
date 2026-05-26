import 'server-only';

/**
 * Server-only subpath barrel — modules that depend on Next.js's
 * `headers()` / `cookies()` runtime. Each module also carries its own
 * `import 'server-only'` so the build error fires at module level even
 * if a consumer ever deep-imports past this barrel.
 */

export { makeServerConsentReader, type ServerConsentReaderInput } from './cookie-reader';
export { GpcHonoredIndicator } from '../components/GpcHonoredIndicator';

// `detectGpcFromHeaders` reads a request header — meaningless on the
// client. Surfacing it via /server keeps the universal barrel free of
// utilities that look client-safe but only have a server-runtime
// meaning (per D63 GPC-detection server-tier scoping).
export { detectGpcFromHeaders, type HeaderGetter } from '../domain/gpc-detector';

export { makeDynamoDBConsentStore, type DynamoDBConsentStoreInput } from '../adapters/dynamodb';
export { makeInMemoryConsentStore, type InMemoryConsentStore } from '../adapters/in-memory';
