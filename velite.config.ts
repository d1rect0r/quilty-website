/**
 * Velite CLI entry-point shim.
 *
 * The actual config body lives in `@quilty/content/velite-config` so the
 * Velite logic is co-located with the schemas + block library. This file
 * stays at the repo root because Velite's CLI auto-discovers
 * `velite.config.ts` from the directory it was invoked from
 * (apps/web/package.json `prebuild` runs `velite build --config ../../velite.config.ts`).
 */
export { default } from '@quilty/content/velite-config';
