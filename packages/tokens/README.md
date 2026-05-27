# @quilty/tokens

> Design tokens authored in [DTCG 2025.10](https://design-tokens.github.io/community-group/format/) JSON. [Style Dictionary v5](https://styledictionary.com) generates platform outputs at build time.

Producer-only workspace package. Consumers:

- **`apps/web`** — imports `dist/web/globals-generated.css` from the package `exports` field at `./globals.css`. Wires through `apps/web/app/globals.css` at the adoption commit (the next step in this migration per ADR-0020).
- **Flutter mobile app** (cross-repo `quilty/`) — will consume a published pub.dev package emitting `ThemeExtension<T>` subclasses at the visual-identity milestone trigger (TW-012). Producer side ships in a subsequent commit per ADR-0020 Decision E.

---

## Architecture (ADR-0020)

Three-tier token namespace per [Polaris / Carbon / Primer 2026 canon](https://polaris.shopify.com/tokens):

1. **Primitives** (`tokens/primitives/`) — raw values. Colors authored as OKLCH per architecture-lock a11y agent's contrast preservation across hue rotations.
2. **Semantic** (`tokens/semantic/`) — design-system roles (`bg-surface`, `fg-default`, `accent-primary`, …) reference primitives via DTCG `{path.to.foo}` syntax. Two files: `light.tokens.json` + `dark.tokens.json` (overrides only).
3. **Components** (`tokens/components/`) — empty at producer-launch; reserved for cross-platform-meaningful component tokens (button / link / focus-ring / brand-identity). Per-platform component tokens stay app-side to avoid premature genericization.

---

## Build pipeline

```bash
# Regenerate dist/ from tokens/ sources
pnpm --filter @quilty/tokens build

# Regenerate + verify the generated CSS is byte-identical to the
# committed apps/web/app/globals.css (the lift-commit safety check).
pnpm --filter @quilty/tokens build:verify

# Drift check only (no regeneration — fast guard for CI)
pnpm --filter @quilty/tokens verify
```

The custom Style Dictionary format `css/quilty-tailwind-v4-globals` (in `build/platforms/tailwind-v4-theme.mjs`) emits a single file matching Tailwind v4's `@theme { }` directive + a sibling `[data-theme='dark'] { }` cascade override block, mirroring the structure of the source-of-truth handwritten CSS exactly.

---

## Adoption + drift detection

At the lift commit (this commit per ADR-0020 Decision G): `apps/web/app/globals.css` is **unchanged**. The package is wired through pnpm + Turborepo, the build runs, the generated output is verified byte-identical, but consumers don't yet read from `dist/`.

At the adoption commit (the next migration step per ADR-0020 Decision G): `apps/web/app/globals.css` becomes a one-line `@import '@quilty/tokens/globals.css';` re-export; the `pnpm verify` pipeline includes `build:tokens` + `verify-css-diff.mjs` so drift surfaces at PR time.

---

## Adding a token

1. Add the `$value` + `$type` entry to the relevant JSON file under `tokens/primitives/`, `tokens/semantic/`, or `tokens/components/`.
2. Append the corresponding `dec(...)` line to the template emitter in `build/platforms/tailwind-v4-theme.mjs` at the position where it should appear in the generated CSS.
3. `pnpm --filter @quilty/tokens build:verify` — should pass byte-identical against the updated `apps/web/app/globals.css` after the lift commit window.

The dual-update (JSON + template emitter) is a deliberate trade for the byte-identical guarantee at the lift commit. After the Flutter target lands (the third commit in the migration), the same JSON source feeds both the CSS and Flutter outputs; the CSS template emitter remains the canonical source of CSS structure (comments, section order, base reset).

---

## Cross-references

- ADR-0020: design-tokens architecture + migration sequence + Flutter `ThemeExtension` formatter rationale.
- Style Dictionary v5 docs: <https://styledictionary.com>
- DTCG community spec: <https://design-tokens.github.io/community-group/format/>
- Tokens Studio Tailwind v4 guidance: <https://tokens.studio/docs/integrations/tailwind>
- Tailwind v4 `@theme` reference: <https://tailwindcss.com/docs/theme>
