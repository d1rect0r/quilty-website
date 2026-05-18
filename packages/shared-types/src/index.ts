/**
 * @quilty/shared-types — OpenAPI-emitted TypeScript types for the Quilty
 * Rust backend.
 *
 * Empty at M1; populated post-M5 via the ADR-0003 pipeline:
 *   1. Rust backend (`quilty-aws/lambdas/rust/`) emits OpenAPI spec via
 *      `utoipa` (currently covers auth-public; extended to auth-user +
 *      auth-admin pre-M5).
 *   2. `quilty-aws/.github/workflows/publish-shared-types.yml` runs
 *      `openapi-typescript` and publishes `@quilty/api-types` to GitHub
 *      Packages private registry.
 *   3. This workspace consumes `@quilty/api-types` via `pnpm install` and
 *      re-exports the relevant types from `src/index.ts`.
 *
 * Until M5, this file is intentionally empty — the workspace exists so
 * subsequent additions are pure, not refactors.
 */
export {};
