---
description: Scaffold a new shadcn-wrapped component with our 3-layer token namespace, a11y baseline, and a colocated test. Use when the user asks to create a new UI primitive or feature component.
argument-hint: [ComponentName] [primitive|feature]
---

Scaffold component `$0` as a `$1` (primitive or feature).

## Conventions for this project

- **Primitives** live under `components/ui/<name>.tsx` and wrap a shadcn/radix primitive (these are owned code, wrap-don't-edit rule per D18)
- **Feature components** live under `components/<area>/<name>.tsx` and compose primitives
- All `className` uses the 3-layer token namespace per D17: `bg-surface-base`, `text-content-primary`, etc. — never raw Tailwind color utilities like `bg-blue-500`
- Every component exports a single named component (no default exports) and a types file if props are non-trivial
- Every interactive primitive supports `asChild` via Radix Slot and forwards refs
- Every component ships with a colocated `.test.tsx` for the unit case
- WCAG 2.2 AA baseline (D22): proper roles, labels, keyboard support, `:focus-visible`

## Steps

Generate three things:

1. **The component file** with:
   - `'use client'` directive only if it uses hooks
   - `forwardRef` for any DOM-receiving primitive
   - Typed props interface
   - 3-layer token classNames
   - Accessibility primitives wired (aria-*, role, keyboard handlers)

2. **A colocated test file** (`<Name>.test.tsx`) covering:
   - Renders correctly
   - Accessibility (axe-core) passes
   - Keyboard interaction (Tab, Enter, ESC) works
   - Forwards ref correctly (for primitives)

3. **An index re-export** in the nearest `index.ts`

## After generating

Run `pnpm typecheck && pnpm test -- <Name>` and report results. Do NOT push.
