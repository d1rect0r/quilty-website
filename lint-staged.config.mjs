/**
 * lint-staged config — runs the right formatter/linter against each
 * staged file type, with workspace-aware filters.
 *
 * Per the Round-5 plan: ESLint + Prettier on JS/TS; Prettier-only on
 * JSON/MD/MDX/CSS/YAML. Typecheck is invoked separately at the husky
 * pre-commit hook (across affected workspaces, not per-file).
 *
 * `--max-warnings=0` on ESLint so warnings fail just like errors — per
 * the strict M1 posture. Adjust at M3+ when a particular rule warrants
 * a soft-warning grace period.
 */
const config = {
  '*.{ts,tsx,js,jsx,mjs,cjs}': [
    'prettier --write',
    // --no-warn-ignored prevents lint-staged from surfacing "file ignored"
    // notices as failures when --max-warnings=0 is in effect (Round-5 TS
    // reviewer cross-check).
    'eslint --fix --max-warnings=0 --no-warn-ignored',
  ],
  '*.{json,md,mdx,css,yml,yaml}': ['prettier --write'],
  // Secret scanning — Node-native complement to the project's gitleaks
  // pre-commit hook. Runs only on changed files for speed; gitleaks
  // continues to scan history. Per the dev-tooling research finding,
  // this is the documented 2026 layered pattern (gitleaks history +
  // secretlint per-file). Trufflehog on the .next build artifact
  // catches NEXT_PUBLIC_* leakage at CI build time.
  '*': ['secretlint --secretlintrc .secretlintrc.json'],
};

export default config;
