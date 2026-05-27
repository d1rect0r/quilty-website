import StyleDictionary from 'style-dictionary';

/**
 * Custom CSS format `css/quilty-tailwind-v4-globals` — emits a single
 * file matching apps/web/app/globals.css byte-for-byte during the
 * D.2(a) lift commit. The template embeds the EXACT non-token content
 * (comments, `@import`, base reset rules); token VALUES are
 * interpolated from the resolved DTCG dictionary so the JSON sources
 * remain the source of truth.
 *
 * Structure of the emitted file:
 *   1. File header comment (verbatim from current globals.css)
 *   2. `@import 'tailwindcss';`
 *   3. `@theme { ... }` block with primitives + semantic LIGHT tokens
 *      (semantic tokens emit as `var(--<primitive-name>)` references
 *       so the cascade behaves identically to hand-written CSS)
 *   4. `[data-theme='dark'] { ... }` block — semantic overrides only,
 *      OUTSIDE `@theme` per Tailwind v4 docs (only `@theme` declarations
 *      become Tailwind utility classes; dark overrides are cascade-only).
 *   5. Base reset (html, body, skip-link, focus-visible, reduced-motion).
 *
 * The split between "@theme" and "[data-theme='dark']" mirrors the
 * Tailwind v4 design-tokens canon (Tokens Studio + Tailwind v4 docs):
 * only base-state values belong in `@theme`; theme overrides cascade
 * via a separate selector block.
 *
 * Reference resolution: tokens whose JSON `$value` is `{path.to.foo}`
 * emit as `var(--<resolved-name>)`. Tokens with literal values (e.g.,
 * 'white', 'oklch(...)') emit the literal. This preserves the
 * cascade-based theming behaviour of the source globals.css.
 */

const TEMPLATE_HEAD = `/*
 * Quilty Website — global styles (Tailwind v4 CSS-first).
 *
 * Per D17 (revised): no \`tailwind.config.ts\`. Token namespace lives
 * in the \`@theme\` block below, which exposes every token as BOTH a Tailwind
 * utility class (e.g., \`bg-color-bg-surface\`) AND a CSS custom property
 * (e.g., \`var(--color-bg-surface)\`).
 *
 * 3-layer token namespace (primitive → semantic → component):
 *   - Primitive: raw color values (OKLCH where possible per architecture lock a11y agent).
 *   - Semantic: design-system roles (foreground, background, accent, danger,
 *               success, etc.) — references primitives.
 *   - Component: optional per-component overrides (lands as components are
 *               extracted; populated when shared components land).
 *
 * Dark mode (D20): light tokens ship now; dark variants will live in
 *   [data-theme="dark"] selector + matching semantic overrides. Pre-hydration
 *   inline script (CSP-nonce-aware) sets data-theme before first paint to
 *   avoid FOUC.
 *
 * Reduced motion baseline: every consumer-health site that takes a11y
 *   seriously resets transition/animation when prefers-reduced-motion:reduce.
 */

@import 'tailwindcss';

@theme {
  /* ── Primitive layer — neutral OKLCH palette ───────────────────────── */
  /* Neutrals (gray scale) */
`;

const TEMPLATE_BRAND_HEADER = `
  /* Brand placeholder (identity-discovery milestone replaces these) */
`;

const TEMPLATE_STATUS_HEADER = `
  /* Status colors — primitive bg/icon variants */
`;

const TEMPLATE_STATUS_FG_HEADER = `
  /* Status colors — darker variants for text use (contrast-vetted ≥ 4.5:1 on
     light bg per WCAG 1.4.3). a11y agent flagged the 500-line variants
     as too light for normal-text use; semantic -fg tokens now reference these. */
`;

const TEMPLATE_SEMANTIC_HEADER = `
  /* ── Semantic layer — design-system roles ──────────────────────────── */
`;

const TEMPLATE_TYPOGRAPHY_HEADER = `
  /* ── Typography ────────────────────────────────────────────────────── */
  /* \`next/font\` lands at the identity-discovery milestone (D17/D21). Until then, the
     stack is OS-native fonts so there's no dangling CSS variable reference
     (typescript-reviewer flagged the old \`var(--font-quilty-sans)\`
     placeholder as silently broken). When \`next/font\` ships, swap this to
     \`var(--font-quilty-sans), system-ui, sans-serif\`. */
`;

const TEMPLATE_SPACING_HEADER = `
  /* ── Spacing scale extension (Tailwind default + named tokens) ─────── */
`;

const TEMPLATE_RADIUS_HEADER = `
  /* ── Radii ──────────────────────────────────────────────────────────── */
`;

const TEMPLATE_RING_HEADER = `
  /* ── Focus ring (overrides shadcn's 3:1-failing default per architecture lock a11y) ─ */
`;

const TEMPLATE_COMPONENT_HEADER = `
  /* ── Component layer — empty for now; per-component overrides arrive as they're built ── */
}

`;

const TEMPLATE_DARK_HEADER = `/* Dark-mode overrides (D20). Every semantic token used as text or focus
   indicator gets a dark-surface variant that maintains WCAG 1.4.3 / 1.4.11
   contrast ratios. a11y agent flagged the original draft's
   missing --color-ring + --color-fg-subtle overrides (2.55:1 + 4.23:1
   against neutral-950) — both now overridden below. */
[data-theme='dark'] {
`;

const TEMPLATE_DARK_RING_HEADER = `
  /* Focus indicator — needs ≥ 3:1 on dark surfaces (WCAG 1.4.11). brand-700
     is the default light-surface value; on neutral-950 it falls to 2.55:1
     (invisible). Override to brand-50 (lightest brand tint). */
`;

const TEMPLATE_DARK_STATUS_HEADER = `
  /* Status-text variants need the lighter "500" primitives on dark bg, not
     the darker "700" variants used for light bg. */
`;

const TEMPLATE_TAIL = `}

/* Baseline reset — applied after Tailwind's preflight.
   Smooth scroll is opt-in via prefers-reduced-motion: no-preference per
  (semantic correctness: opt-in for
   motion, not opt-out, mirrors the reduced-motion block below). */
html {
  text-size-adjust: 100%;
}

@media (prefers-reduced-motion: no-preference) {
  html {
    scroll-behavior: smooth;
  }
}

body {
  background-color: var(--color-bg-surface);
  color: var(--color-fg-default);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Skip-link visibility on keyboard focus only (a11y).
   \`:focus-visible\` excludes programmatic focus (FocusOnNavigate
   targets \`<main>\` after route changes — the bare \`:focus\` would
   flash the skip link visible during those transitions). */
.skip-link:not(:focus-visible) {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* Focus-visible ring (a11y agent: shadcn defaults fail 3:1; override) */
:focus-visible {
  outline: var(--spacing-ring-width) solid var(--color-ring);
  outline-offset: var(--spacing-ring-offset);
}

/* Reduced-motion: respect user's OS-level preference per WCAG 2.3.3 */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
`;

const NEUTRAL_STEPS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
const BRAND_STEPS = ['50', '500', '700', '900'];
const STATUS_KEYS = ['danger', 'success', 'warning'];

function pathToVarName(path) {
  return `--${path.join('-')}`;
}

function refPathToVarName(refStr) {
  return `--${refStr.replace(/\./g, '-')}`;
}

function buildLookup(dictionary) {
  const byPath = new Map();
  for (const token of dictionary.allTokens) {
    byPath.set(token.path.join('.'), token);
  }
  return byPath;
}

function tokenValue(token) {
  // Style Dictionary v5 stores the resolved value under `$value` (DTCG
  // schema) on the token object itself; the pre-resolution form lives
  // under `original.$value` (may be a `{path}` reference or a literal).
  return token.$value ?? token.value;
}

function tokenOriginalValue(token) {
  return token.original?.$value ?? token.original?.value;
}

function emitLiteral(token) {
  if (!token) throw new Error('emitLiteral: token is undefined');
  return tokenValue(token);
}

function emitRefOrLiteral(token) {
  if (!token) throw new Error('emitRefOrLiteral: token is undefined');
  const orig = tokenOriginalValue(token);
  if (typeof orig === 'string' && orig.startsWith('{') && orig.endsWith('}')) {
    return `var(${refPathToVarName(orig.slice(1, -1))})`;
  }
  return tokenValue(token);
}

function emitGlobalsCss(dictionary) {
  const tok = buildLookup(dictionary);
  const get = (path) => {
    const t = tok.get(path);
    if (!t) throw new Error(`token missing: ${path}`);
    return t;
  };
  const dec = (varName, value) => `  ${varName}: ${value};\n`;

  let out = TEMPLATE_HEAD;

  for (const step of NEUTRAL_STEPS) {
    out += dec(`--color-neutral-${step}`, emitLiteral(get(`color.neutral.${step}`)));
  }

  out += TEMPLATE_BRAND_HEADER;
  for (const step of BRAND_STEPS) {
    out += dec(`--color-brand-${step}`, emitLiteral(get(`color.brand.${step}`)));
  }

  out += TEMPLATE_STATUS_HEADER;
  for (const key of STATUS_KEYS) {
    out += dec(`--color-${key}-500`, emitLiteral(get(`color.${key}.500`)));
  }

  out += TEMPLATE_STATUS_FG_HEADER;
  for (const key of STATUS_KEYS) {
    out += dec(`--color-${key}-700`, emitLiteral(get(`color.${key}.700`)));
  }

  out += TEMPLATE_SEMANTIC_HEADER;
  out += dec('--color-bg-surface', emitRefOrLiteral(get('color.bg.surface')));
  out += dec('--color-bg-elevated', emitRefOrLiteral(get('color.bg.elevated')));
  out += dec('--color-bg-overlay', emitRefOrLiteral(get('color.bg.overlay')));
  out += '\n';
  out += dec('--color-fg-default', emitRefOrLiteral(get('color.fg.default')));
  out += dec('--color-fg-muted', emitRefOrLiteral(get('color.fg.muted')));
  out += dec('--color-fg-subtle', emitRefOrLiteral(get('color.fg.subtle')));
  out += dec('--color-fg-inverse', emitRefOrLiteral(get('color.fg.inverse')));
  out += '\n';
  out += dec('--color-border-default', emitRefOrLiteral(get('color.border.default')));
  out += dec('--color-border-strong', emitRefOrLiteral(get('color.border.strong')));
  out += dec('--color-border-focus', emitRefOrLiteral(get('color.border.focus')));
  out += '\n';
  out += dec('--color-accent-primary', emitRefOrLiteral(get('color.accent.primary')));
  out += dec('--color-accent-primary-hover', emitRefOrLiteral(get('color.accent.primary-hover')));
  out += dec('--color-accent-fg', emitRefOrLiteral(get('color.accent.fg')));
  out += '\n';
  out += dec('--color-danger-fg', emitRefOrLiteral(get('color.danger-fg')));
  out += dec('--color-success-fg', emitRefOrLiteral(get('color.success-fg')));
  out += dec('--color-warning-fg', emitRefOrLiteral(get('color.warning-fg')));

  out += TEMPLATE_TYPOGRAPHY_HEADER;
  out += dec('--font-sans', emitLiteral(get('font.sans')));
  out += dec('--font-mono', emitLiteral(get('font.mono')));

  out += TEMPLATE_SPACING_HEADER;
  out += dec('--spacing-page-x', emitLiteral(get('spacing.page-x')));
  out += dec('--spacing-page-x-lg', emitLiteral(get('spacing.page-x-lg')));
  out += dec('--spacing-section-y', emitLiteral(get('spacing.section-y')));

  out += TEMPLATE_RADIUS_HEADER;
  out += dec('--radius-sm', emitLiteral(get('radius.sm')));
  out += dec('--radius-md', emitLiteral(get('radius.md')));
  out += dec('--radius-lg', emitLiteral(get('radius.lg')));
  out += dec('--radius-xl', emitLiteral(get('radius.xl')));

  out += TEMPLATE_RING_HEADER;
  out += dec('--color-ring', emitRefOrLiteral(get('color.ring')));
  out += dec('--spacing-ring-width', emitLiteral(get('spacing.ring-width')));
  out += dec('--spacing-ring-offset', emitLiteral(get('spacing.ring-offset')));

  out += TEMPLATE_COMPONENT_HEADER;

  out += TEMPLATE_DARK_HEADER;
  out += dec('--color-bg-surface', emitRefOrLiteral(get('dark.color.bg.surface')));
  out += dec('--color-bg-elevated', emitRefOrLiteral(get('dark.color.bg.elevated')));
  out += dec('--color-fg-default', emitRefOrLiteral(get('dark.color.fg.default')));
  out += dec('--color-fg-muted', emitRefOrLiteral(get('dark.color.fg.muted')));
  out += dec('--color-fg-subtle', emitRefOrLiteral(get('dark.color.fg.subtle')));
  out += dec('--color-fg-inverse', emitRefOrLiteral(get('dark.color.fg.inverse')));
  out += dec('--color-border-default', emitRefOrLiteral(get('dark.color.border.default')));
  out += dec('--color-border-strong', emitRefOrLiteral(get('dark.color.border.strong')));

  out += TEMPLATE_DARK_RING_HEADER;
  out += dec('--color-ring', emitRefOrLiteral(get('dark.color.ring')));

  out += TEMPLATE_DARK_STATUS_HEADER;
  out += dec('--color-danger-fg', emitRefOrLiteral(get('dark.color.danger-fg')));
  out += dec('--color-success-fg', emitRefOrLiteral(get('dark.color.success-fg')));
  out += dec('--color-warning-fg', emitRefOrLiteral(get('dark.color.warning-fg')));

  out += TEMPLATE_TAIL;
  return out;
}

const FORMAT_NAME = 'css/quilty-tailwind-v4-globals';

export function registerQuiltyTailwindV4Format() {
  // Style Dictionary v5 keeps registered formats on a module-level
  // Map; a duplicate registerFormat call on the same name either
  // throws or warns depending on minor version. The guard makes this
  // function safe to call multiple times across vitest worker
  // reloads + sequential build invocations.
  if (FORMAT_NAME in (StyleDictionary.hooks?.formats ?? {})) {
    return;
  }
  StyleDictionary.registerFormat({
    name: FORMAT_NAME,
    format: ({ dictionary }) => emitGlobalsCss(dictionary),
  });
}

export { FORMAT_NAME, pathToVarName, refPathToVarName, emitGlobalsCss };
