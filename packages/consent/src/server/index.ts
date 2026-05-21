import 'server-only';

/**
 * Server-only subpath barrel — modules that depend on Next.js's
 * `headers()` / `cookies()` runtime. Each module also carries its own
 * `import 'server-only'` so the build error fires at module level even
 * if a consumer ever deep-imports past this barrel.
 */

export { makeServerConsentReader, type ServerConsentReaderInput } from './cookie-reader.js';
export { GpcHonoredIndicator } from '../components/GpcHonoredIndicator.js';
