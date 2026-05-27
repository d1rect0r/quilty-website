# @quilty/search

Search infrastructure — `SearchIndex` port + Pagefind adapter (default) +
swap-trigger skeletons (Algolia / future Typesense / Meilisearch).

## Why a separate package

Search is one of the highest-retrofit-cost seams: the call surface
proliferates across the marketing site (cmd-K modal, search results
page, in-page filters) AND eventually the portal (settings search,
account-data search). Without a locked port, every feature ships its
own search call signature; every vendor swap touches every call site.

Locking the port at M1.6 — before the first MDX content lands — means
the eventual Algolia / Typesense / Meilisearch swap is a one-file
adapter change behind the same port.

## Privacy stance (ADR-0019)

**Pagefind keeps every query on the device.** Static inverted-index
segments live at `/pagefind/index/*.pf_index`; the browser fetches
segments via HTTP range requests + computes scoring locally. The query
string NEVER appears in a network request. This is the strongest
privacy stance available in 2026 for any non-trivial search experience.

Any future hosted-engine swap (Algolia / Typesense / Meilisearch) MUST
preserve the stance via:

1. **First-party proxy** at `apps/web/app/api/search/route.ts` — the
   client never holds the engine API key; the proxy strips IP +
   forwards the user-agent via an opaque token.
2. **Per-query rate limit** + **per-tenant key isolation** at the
   proxy layer.
3. **BAA in force** with the vendor before activation.

The swap is documented as a deferred decision in
`docs/runbook/trigger-watchlist.md` (TW-NNN).

## Public surface

```ts
import {
  // Port
  type SearchIndex,
  type SearchOptions,
  type SearchResponse,
  type SearchHit,
  type SearchHitCategory,
  type SearchFilter,
  type SearchSort,

  // Production adapter
  makePagefindAdapter,
  type PagefindAdapterOptions,
  PagefindBundleUnavailableError,

  // Swap-trigger skeleton (throws at instantiation today)
  makeAlgoliaAdapter,
  type AlgoliaAdapterOptions,
  AlgoliaAdapterNotActivatedError,
} from '@quilty/search';

import { makeInMemorySearchIndex } from '@quilty/search/testing';
```

## Pagefind activation

Pagefind requires a static-route inventory to index. At M1.6 the
marketing tree has zero MDX content, so the index is empty. Activation
fires when the first MDX content lands at M3+:

1. `pnpm add -D pagefind` (workspace root).
2. `pnpm build:pagefind` script (already wired in apps/web's `build`
   chain) emits `/pagefind/` artefacts under `apps/web/public/`.
3. Composition root flips `composition.client.ts` from
   `makeInMemorySearchIndex(...)` to `makePagefindAdapter(...)`.
4. Search route's flag (`features.flag('search_enabled')`) flips to
   `true`.

Until then, `<ComingSoonSearch>` renders at `/[locale]/search`.

## Cmd-K modal

The Cmd-K trigger lives at `apps/web/components/site/Header.tsx` (per
the D.1 wiring). Keyboard shortcut binding + modal state management
land at the activation milestone.

## Contract test

The `SearchIndex` port contract test parameterises against the
in-memory fake; the Pagefind adapter exercises Pagefind-specific
normalisation (category narrowing, score synthesis, raw_url
preference) via mocked bundle imports.

Adding a new adapter:

1. Implement `make<Vendor>Adapter(...)` in `src/adapters/<vendor>.ts`.
2. Add the adapter to the contract test's parameterisation.
3. Document privacy implications + activation steps in the ADR.
4. Add ESLint vendor-import allowlist entry.

## Architecture

Per ADR-0014 (port-adapter naming) + ADR-0010 (composition-root
choice point), every search consumer holds the `SearchIndex` interface
— never the concrete adapter. Vendor errors are translated at the
adapter boundary into either the port's `SearchResponse` shape or a
package-scoped `Error` subclass.
