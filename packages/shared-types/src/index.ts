/**
 * @quilty/shared-types — OpenAPI-emitted TypeScript types for the Quilty
 * Rust backend.
 *
 * Empty until the OpenAPI codegen pipeline activates per ADR-0003:
 *   1. Rust backend (`quilty-aws/lambdas/rust/`) emits OpenAPI spec via
 *      `utoipa` (currently covers auth-public; extended to auth-user +
 *      auth-admin before the website consumes them).
 *   2. `quilty-aws/.github/workflows/publish-shared-types.yml` runs
 *      `openapi-typescript` and publishes `@quilty/api-types` to GitHub
 *      Packages private registry.
 *   3. This workspace consumes `@quilty/api-types` via `pnpm install`
 *      and re-exports the relevant types from `src/index.ts`.
 *
 * Until the pipeline activates, this file is intentionally empty — the
 * workspace exists so subsequent additions are pure, not refactors.
 */
export {};
