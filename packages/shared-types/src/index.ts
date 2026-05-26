/**
 * @quilty/shared-types — OpenAPI-emitted TypeScript types for the Quilty
 * Rust backend.
 *
 * Two emission targets per ADR-0003 + ADR-0017:
 *   - `./auth` — `paths` + `components` types for the Cognito-backed
 *     auth v2 surface (`quilty-aws/docs/auth/auth_v2_openapi.yaml`).
 *   - `./sync` — `paths` + `components` types for the offline-first
 *     mobile-sync API surface (`quilty-aws/docs/api/openapi.yaml`).
 *
 * Regenerate locally via `node apps/web/scripts/codegen-api-types.mjs`.
 * The full CI publish pipeline activates at the codegen-CI trigger per ADR-0003; until
 * then the generated files are committed to source so the workspace
 * stays self-contained at every checkout.
 *
 * Consumer usage:
 *
 *   import type { Auth, Sync } from '@quilty/shared-types';
 *
 *   type SignInRequest = Auth.components['schemas']['SignInRequest'];
 *   type SyncPushBody = Sync.paths['/sync/push']['post']['requestBody']['content']['application/json'];
 *
 * The namespace re-export shape keeps the two specs isolated so a
 * future spec rename (e.g., `auth_v3`) does not propagate through
 * unrelated consumers.
 */

// eslint-disable-next-line no-restricted-syntax -- Type-only namespace re-export; zero runtime impact (tree-shaking constraint does not apply to the type space).
export type * as Auth from './generated/auth';
// eslint-disable-next-line no-restricted-syntax -- Type-only namespace re-export; zero runtime impact (tree-shaking constraint does not apply to the type space).
export type * as Sync from './generated/sync';
