# ADR-0020: Design tokens architecture (@quilty/tokens + Style Dictionary v5 + Tailwind v4 + Flutter target)

- **Status:** Accepted
- **Date:** 2026-05-27
- **Last reviewed:** 2026-05-27
- **Deciders:** Volodymyr Petrychenko
- **Originating discussion:** M1.6 Workstream D.2 research (per `docs/m1.6_foundation_finishing_plan.md` § D.2); 2 user alignment decisions (custom Flutter formatter; pub.dev private publish) answered 2026-05-27
- **Related decisions:** D17 (Tailwind v4 CSS-first, no `tailwind.config.ts`), D18 (shadcn wrap-don't-edit), D20 (dark mode), D22+D23 (WCAG 2.2 AA + a11y enforcement)
- **Related ADRs:** [ADR-0001](0001-monorepo-shape.md) (workspace layout), [ADR-0014](0014-port-adapter-naming.md), [ADR-0015](0015-monorepo-packaging-tooling.md)
- **Software versions assumed:** Style Dictionary 5.4.x (DTCG 2025.10 native), Tailwind 4.x, Next.js 16.2, Dart 3.x (consumer side)

## Context

Three forcing functions converge on this commit:

1. **Cross-platform reuse incoming.** The Quilty Flutter app at `~/AppBuilding/quilty/` ships at M3 visual-identity lock and consumes the same brand palette + spacing scale. Hand-mirroring CSS variable values into `lib/theme/` Dart constants is the canonical maintenance trap (Polaris / Carbon / Primer post-mortems all cite "two sources of truth for the same color" as the dominant brand-drift root cause).
2. **Token namespace is already public-API.** `apps/web/app/globals.css` exposes 30+ CSS custom properties consumed by shadcn primitives, component wrappers, and inline `style={{ ... var(--…) }}` overrides. Renaming or re-shaping them late forces a multi-thousand-line refactor.
3. **DTCG 2025.10 settled the JSON shape.** Pre-DTCG, every token tool had its own bespoke schema; the migration cost was 2x because the JSON had to be rewritten for every vendor swap. With DTCG locked, the JSON sources are vendor-portable for the lifetime of the project.

The "do nothing" outcome: globals.css stays the single source of truth for the website; the Flutter app re-types every color/spacing constant at M3; brand drift between platforms surfaces in the first marketing campaign that crosses surfaces.

## Decision

We will ship a new workspace package `@quilty/tokens` authoring all design tokens in DTCG 2025.10 JSON, with Style Dictionary v5.4.x generating:

- A Tailwind v4 `@theme` CSS file consumed by `apps/web` (this commit, lift phase per Decision G)
- A Flutter `ThemeExtension<T>` package published to a private pub.dev registry (subsequent commit per Decision G)

### Decision A — Schema: DTCG 2025.10 JSON in dot-notation hierarchy

Tokens authored as `*.tokens.json` files using the [Design Tokens Community Group format](https://design-tokens.github.io/community-group/format/):

```json
{
  "color": {
    "neutral": {
      "50": { "$value": "oklch(98.4% 0.003 247.86)", "$type": "color" }
    },
    "bg": {
      "surface": { "$value": "{color.neutral.50}", "$type": "color" }
    }
  }
}
```

The `{path.to.token}` reference syntax is the DTCG-native cross-token reference; Style Dictionary v5 resolves it natively and `$type` annotations enable per-platform type-aware emission (e.g., Dart's `Color(0xFF…)` vs CSS's `oklch(…)`).

### Decision B — Three-tier namespace (primitive → semantic → component)

Mirrors the Polaris / Carbon / Primer 2026 canon:

1. **Primitives** (`tokens/primitives/`) — raw values. Color authored as OKLCH (perceptually uniform; survives hue rotations without contrast drift).
2. **Semantic** (`tokens/semantic/`) — design-system roles (`bg.surface`, `fg.default`, `accent.primary`, etc.) reference primitives. Two files: `light.tokens.json` + `dark.tokens.json` (overrides only).
3. **Components** (`tokens/components/`) — empty at producer-launch; reserved for cross-platform-meaningful component tokens (button / link / focus-ring / brand-identity). Per-platform component tokens stay app-side (Polaris canon: 70-80% of component tokens are platform-specific and don't belong in the shared layer).

### Decision C — Style Dictionary v5.4.x as the build tool

Adopted because:

- Native DTCG support (no source rewrite when DTCG bumps)
- TypeScript-native plugin authoring (Node 22+ required; we're on Node 24)
- Multi-platform out of the box (CSS, SCSS, JS, iOS, Android, Dart via custom formatters)
- Mature plugin ecosystem (tokens-studio sync, Figma export, semantic-versioning emit)

The alternatives rejected: hand-rolled emitters (already failed the cross-platform proliferation test at every shop that tried), Theo (Salesforce-archived 2024), token-transformer (single-platform only).

### Decision D — Custom CSS format for Tailwind v4 `@theme`

We hand-roll a custom Style Dictionary format (`css/quilty-tailwind-v4-globals` in `src/platforms/tailwind-v4-theme.mjs`) instead of using the built-in `css/variables` format. Reason: Tailwind v4 requires `@theme { }` (NOT `:root { }`) to convert variables into utility classes. The default `transformGroup: 'css'` ALSO normalises CSS color keywords (`white` → `#ffffff`), breaking the byte-identical migration check. The custom format:

- Wraps primitives + semantic-light tokens inside `@theme { }`
- Emits dark-mode overrides in a SIBLING `[data-theme='dark'] { }` block (OUTSIDE `@theme` per Tailwind v4 docs — only `@theme` declarations get Tailwind utility-class treatment; theme overrides cascade via a separate selector)
- Preserves all section comments + base reset rules (html / body / skip-link / focus-visible / reduced-motion) verbatim
- Uses ONLY the `name/kebab` transform to avoid keyword normalisation

### Decision E — Custom Flutter formatter (NOT the built-in `flutter/class.dart`)

The built-in Flutter formatter emits `static const` color/spacing fields, which break Flutter's `ThemeData.copyWith` + `lerp` (theme transitions, accessibility-tuning overrides, Material 3 dynamic-color binding). The Quilty Flutter app expects `ThemeExtension<T>` subclasses, which give:

- Per-component `copyWith` (override one token without re-declaring the rest)
- `lerp(a, b, t)` (theme transition animations)
- `Theme.of(context).extension<T>()` (the canonical Flutter 3.7+ access pattern)

Subsequent commit per Decision G ships a ~150-LOC formatter emitting one `ThemeExtension<T>` subclass per token category (`QuiltyColorsExtension`, `QuiltySpacingExtension`, `QuiltyRadiusExtension`), with a composite `ThemeData` builder in `lib/tokens/theme.dart`.

**OKLCH → sRGB hex gamut-mapping policy (Flutter consumer):** Flutter's `Color` class accepts only `ARGB32` hex. Primitive colors are authored as OKLCH (perceptually uniform); the custom Flutter formatter converts to sRGB hex at emit time via the `culori` library (the same library Polaris + Primer v8 use for the inverse direction). When a primitive's OKLCH value lies outside the sRGB gamut (possible at the 950 end of high-chroma scales), the formatter applies CSS Color 4's `to sRGB` chroma-reduction mapping (NOT clip — clip produces hue-shifted colors that violate the perceptually-uniform invariant). The same value is also emitted to the CSS web target in its native OKLCH form, so the web + Flutter outputs are _intentionally_ different colors in the gamut-clamped case; the Flutter output is documented as "the best sRGB approximation of the perceptually-correct color" rather than "the same color in two formats." The mapping policy is locked in the formatter source (`src/platforms/flutter-theme-extension.mjs`) at commit-c.

### Decision F — Flutter distribution: private pub.dev publish

The Flutter consumer is the cross-repo `quilty/` app; sharing via git submodule (universally regretted per Carbon/Polaris post-mortems) or copy-paste-on-update (the trap we're avoiding) is rejected. The producer publishes to a private pub.dev registry; the consumer adds `quilty_tokens: ^X.Y.Z` to `pubspec.yaml`.

Pub.dev was chosen over GitHub Packages (Dart support poor + private repo coupling), self-hosted Dart Cloud (operational overhead), and Flutter Hub (early-stage tooling). Pub.dev's private-registry auth integrates with the existing `~/.config/dart/pub-credentials.json` flow.

The first publish happens at the M3 visual-identity lock (TW-012 watchlist entry per `docs/runbook/trigger-watchlist.md`); this commit lands the producer side only.

**Version-sync policy across npm + pub.dev:** any semver bump to `@quilty/tokens` (npm) triggers a synchronized publish to `quilty_tokens` on pub.dev within the same CI run, matching Polaris's coordinated-bump pattern across npm + CocoaPods + Maven. If a web-only token addition does not affect the Flutter subset (e.g., a new `--color-bg-overlay` variant), the npm bump still triggers a no-op Flutter publish at the same semver to maintain the synchronized version invariant — consumers always see the same version number on both sides. The CI workflow at `packages/tokens/.github/workflows/publish.yml` (added at commit-c) enforces this.

### Decision G — Three-commit migration sequence

1. **Lift** (this commit): tokens authored in DTCG JSON; Style Dictionary build produces `dist/web/globals-generated.css` byte-identical to current `apps/web/app/globals.css` (verified by `__tests__/byte-identical.test.ts`); `apps/web/app/globals.css` UNCHANGED.
2. **Adopt** (subsequent commit): `apps/web/app/globals.css` becomes a one-line `@import` of the generated file; the verify pipeline ensures `apps/web` rebuilds tokens on any JSON-source change.
3. **Flutter target** (subsequent commit): custom `ThemeExtension<T>` formatter + pub.dev publish workflow + sample consumer integration test.

The byte-identical bar at the lift commit is the dominant migration-safety check: it proves the JSON sources + Style Dictionary pipeline can reproduce the current hand-authored CSS exactly, with zero visual regression risk. After adoption (the next commit), drift detection switches from "generated vs hand-authored" to "JSON-sources vs committed-CSS" (same diff, different framing).

### Decision H — Component-tier token allowlist

At producer-launch the component tier is empty. We will populate it sparingly, on this allowlist:

- `button.primary` — brand-identity, cross-platform consistent
- `button.danger` — accessibility-critical (WCAG 1.4.3 + 3.2.4 expectations)
- `link.default` — visited/unvisited contrast across platforms
- `focus-ring` — already cross-platform (WCAG 2.4.7 + 1.4.11 spec applies identically)

Per-component tokens for everything else (spacing inside cards, font weights for navigation, etc.) stay app-side; Polaris's "shared component-tier sprawl" lesson is that >90% of cross-team friction in token systems comes from over-promotion of platform-specific tokens to the shared tier.

**Latent name-coupling note (`--color-ring`):** the `focus-ring` allowlist entry above maps to today's semantic-layer token `--color-ring` (rendered inside `@theme`). When `focus-ring` is promoted to the component tier, the CSS variable name should be migrated to a more explicit form (e.g., `--color-component-focus-ring`) in lockstep with consumer-side references in `:focus-visible` selectors. The promotion PR must update both the JSON path AND the emitter template AND the `apps/web/app/globals.css` `:focus-visible` rule simultaneously to keep byte-identical drift detection working.

### Decision I — Dark-mode authoring shape (deviation from DTCG canonical)

Canonical DTCG + Tokens Studio practice authors dark-mode tokens at _identical paths_ in a separate file (`semantic/dark.tokens.json` with `color.bg.surface`, NOT `dark.color.bg.surface`), then disambiguates at build time via Style Dictionary's per-platform `selector` config or a `mode` filter. Tokens Studio's [Token Engine docs](https://docs.tokens.studio/configuration/token-sets) call the "mode-as-prefix" pattern an anti-pattern by name.

We DEVIATE from the canonical shape at the lift commit and author dark overrides under `dark.color.*`. Two reasons:

1. **Single-file emit.** The byte-identical guarantee requires ONE CSS file containing BOTH the light `@theme { }` block AND the dark `[data-theme='dark'] { }` block. The canonical multi-file/multi-mode build emits two separate platforms; combining them requires a post-build concatenation step.
2. **Lift-commit minimal-surface scope.** The deviation is contained to a single JSON file and a single template emitter; the next iteration can refactor to multi-platform builds without touching consumers (the JSON shape changes, the emitted CSS does not).

The Flutter target at commit-c will use the canonical multi-mode build (one `ThemeData.light()` + one `ThemeData.dark()`), so the deviation is web-side only. The refactor to canonical is tracked as TW-026 in the trigger watchlist with the activation trigger "before a third theme mode (e.g., high-contrast) is needed."

### Decision J — Color-with-alpha primitives without a DTCG reference modifier

DTCG 2025.10 does not specify an alpha-modifier on `{path.to.token}` references (Polaris + Primer both surface this gap). The lone affected token in our current set is `--color-bg-overlay`, which is `oklch(20.8% 0.042 265.75 / 0.4)` — the alpha-blended form of `color.neutral.900`. We author it as a literal in `semantic/light.tokens.json` and document the synchronization requirement: when `color.neutral.900` is updated at the M3 visual-identity lock, `color.bg.overlay` MUST be re-derived by hand. A unit test (`__tests__/alpha-derivation.test.ts` — added at commit-c when the gamut-map utilities land) asserts the OKLCH triple of `bg.overlay` matches `neutral.900` modulo the trailing `/ 0.4` alpha clause.

This is the dominant trap in DTCG token systems (Polaris ships a custom `$extensions.alphaOf` annotation for the same reason); we accept the literal-duplication-with-test-guard pattern at the lift commit rather than ship a custom annotation pre-validation.

### Decision K — Interaction-state tokens deferred to a future iteration

Polaris, Carbon, Primer, and Material 3 all ship interaction-state token families (`*.hover`, `*.pressed`, `*.active`, `*.disabled`, `*.selected`). The current Quilty token surface ships only `accent.primary-hover` because that's all `globals.css` defines today, and the byte-identical bar forbids token additions at this commit. The follow-up plan adds `accent.primary-pressed`, `accent.primary-disabled`, `button.danger-pressed`, etc. in lockstep with the M3 visual-identity work; pending that, button + link components compose hover-state CSS inline. The deferral is tracked at TW-027 with activation trigger "first cross-platform button/link component design that needs more than hover."

## Consequences

### Positive

- **Single source of truth** for brand identity across the website + Flutter app at M3+.
- **DTCG-portable**: future swap to Tokens Studio / Specify / Supernova / any DTCG-compatible tool is JSON-rename only.
- **Byte-identical migration**: zero risk of visual regression at the lift commit; verify-css-diff runs in CI as a permanent drift guard.
- **OKLCH primitives**: contrast preserved across all hue rotations (the rebrand at M3 won't silently break WCAG 1.4.3 for accent-fg pairings).
- **Style Dictionary v5 is mature** with a 5+ year support runway; not betting on an early-stage tool.

### Negative / Trade-offs

- **Dual-update friction during lift commit window**: adding a new token requires updating BOTH the JSON source AND the CSS template emitter to maintain byte-identical guarantee. After adoption (Decision G step 2), this constraint relaxes — the generated file becomes canonical.
- **Custom CSS format is hand-rolled** (~250 LOC in `tailwind-v4-theme.mjs`). The alternative — using `formattedVariables({ outputReferences: true })` — would not preserve section comments + base reset block exactly. The trade is justified by the byte-identical migration safety; once we're past the lift window, the emitter can be simplified.
- **Pub.dev publish workflow is bespoke**: no widely-used "publish-Dart-from-Node-monorepo" tool exists; we ship a GitHub Actions workflow specifically for this. Total effort estimated 1-2 hours including registry credential setup at the M3 trigger.

### Neutral

- Tailwind v4 `@theme` semantics mean tokens automatically become utility classes (`bg-color-bg-surface`, `text-color-fg-default`, etc.) — this is by design and matches D17. Dark-mode overrides live OUTSIDE `@theme` because Tailwind doesn't apply utility-class generation to theme-state overrides.

## Activation triggers (cross-references)

- **M3 — Flutter pub.dev publish trigger**: TW-012 in `docs/runbook/trigger-watchlist.md` (visual-identity lock; first Flutter consumer).
- **Adoption — globals.css re-import**: subsequent commit in the same workstream per Decision G step 2.
- **Component-tier population**: per-token review at the time the first cross-platform component lands (e.g., a button design that appears on both surfaces).

## Anti-patterns to avoid

- **Vendor names in token paths** — `tokens.material.button.primary` (Flutter-bound name in shared layer) ban; all tokens use vendor-agnostic names per ADR-0014.
- **Component tokens that aren't cross-platform-meaningful** — `tokens/components/sidebar-collapse-icon-size` ban; that stays in apps/web component-local CSS.
- **Hand-mirroring values between web + Flutter** — at M3, the Flutter consumer adds `quilty_tokens: ^X.Y.Z` to pubspec; no copy-paste.
- **Bypassing the JSON sources** — adding a CSS variable directly in apps/web/app/globals.css after the adoption commit is banned; the generated file is the source of truth.

## References

- [Design Tokens Community Group format spec](https://design-tokens.github.io/community-group/format/)
- [Style Dictionary v5 docs](https://styledictionary.com)
- [Tailwind v4 `@theme` reference](https://tailwindcss.com/docs/theme)
- [Flutter `ThemeExtension<T>` API](https://api.flutter.dev/flutter/material/ThemeExtension-class.html)
- [Polaris token architecture](https://polaris.shopify.com/tokens)
- [Carbon Design System token philosophy](https://carbondesignsystem.com/elements/colors/tokens/)
- [pub.dev private registries](https://dart.dev/tools/pub/private-package-repositories)
