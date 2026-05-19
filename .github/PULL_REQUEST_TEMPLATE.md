## Summary

<!-- 1-3 sentences. What changed + why. -->

## Type

- [ ] feat — new feature
- [ ] fix — bug fix
- [ ] refactor — internal change with no behavior delta
- [ ] docs — documentation only
- [ ] test — test-only change
- [ ] chore — tooling / dependencies / housekeeping
- [ ] style — formatting / lint-only

## Decision references

<!-- Cite any D-decisions, U-locks, or ADRs this PR touches.
     If none apply, write "N/A". -->

- D-numbers:
- ADRs:

## Checklist

- [ ] Conventional Commits message on every commit
- [ ] SSH-signed commits (`commit.gpgsign=true` is set globally)
- [ ] Co-authored-by trailer if AI-assisted
- [ ] `pnpm typecheck` green locally
- [ ] `pnpm lint` green locally
- [ ] `pnpm test` green locally
- [ ] `pnpm test:a11y` green locally (axe-core zero violations)
- [ ] No PHI in committed code (sanitizer is the production defense; PR author confirms intent)
- [ ] No direct vendor SDK imports outside `lib/observability/` (D67 chokepoint)
- [ ] New observability emission paths route through `track()` / `logError()` / `logger`
- [ ] New CSP-affecting code reviewed against `apps/web/proxy.ts` per-route branching (D59)
- [ ] New reserved routes added to `app/sitemap.ts`
- [ ] If touching `.well-known/*`: verified iOS + Android deeplink still works

## Test plan

<!-- How a reviewer can confirm this works end-to-end. -->

## Screenshots / recordings

<!-- For UI changes. -->

## Rollback plan

<!-- For anything touching auth, security headers, observability, or
     deploy infrastructure. -->
