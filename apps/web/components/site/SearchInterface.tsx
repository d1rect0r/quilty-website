'use client';

import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from 'react';
import { getClientContainer } from '@/lib/get-container';
import { makeClientContainer } from '@/composition.client';
import type { SearchHit } from '@quilty/search';

/**
 * <SearchInterface>
 *
 * Client island for the flag-ON path of /[locale]/search. Consumes
 * the `SearchIndex` port from the composition root (in-memory fake
 * by default; the Pagefind adapter at content activation per
 * ADR-0019 Decision H).
 *
 * Per ADR-0019 Decision F: empty query is treated as "match nothing"
 * (NOT match-everything). The submit handler short-circuits the empty
 * case to avoid even invoking the adapter.
 *
 * Abort discipline: a new search cancels the in-flight one via
 * AbortController. The adapter contract honors `signal.aborted` AND
 * sets `name: 'AbortError'` on the rejection.
 *
 * useTransition wraps the result-state update so the input stays
 * interactive while results render — React 19 canonical pattern for
 * search UI.
 */

const PAGE_SIZE = 10;

interface SearchState {
  readonly status: 'idle' | 'loading' | 'success' | 'error';
  readonly query: string;
  readonly hits: readonly SearchHit[];
  readonly total: number;
  readonly errorMessage?: string;
}

const INITIAL_STATE: SearchState = {
  status: 'idle',
  query: '',
  hits: [],
  total: 0,
};

export function SearchInterface(): React.JSX.Element {
  const inputId = useId();
  const statusId = useId();
  const [state, setState] = useState<SearchState>(INITIAL_STATE);
  const [isPending, startTransition] = useTransition();
  const abortRef = useRef<AbortController | undefined>(undefined);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const q = String(form.get('q') ?? '').trim();

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (q.length === 0) {
      startTransition(() => {
        setState({ status: 'idle', query: '', hits: [], total: 0 });
      });
      return;
    }

    // Full reset on each new query — mirrors the success/error
    // transitions and avoids carrying stale `errorMessage` into the
    // loading state. The aria-live region keys on `status` so the
    // stale field is unreachable today, but the explicit reset
    // documents the invariant.
    setState({ status: 'loading', query: q, hits: [], total: 0 });

    try {
      const container = getClientContainer(makeClientContainer);
      const response = await container.searchIndex.search(q, {
        page: 1,
        pageSize: PAGE_SIZE,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      startTransition(() => {
        setState({
          status: 'success',
          query: q,
          hits: response.hits,
          total: response.total,
        });
      });
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err instanceof Error && err.name === 'AbortError') return;
      const message = err instanceof Error ? err.message : 'Search failed.';
      startTransition(() => {
        setState({
          status: 'error',
          query: q,
          hits: [],
          total: 0,
          errorMessage: message,
        });
      });
    }
  }

  const showResults = state.status === 'success' || state.status === 'error';

  return (
    <div>
      <form onSubmit={handleSubmit} role="search">
        <label htmlFor={inputId} className="text-fg-default mb-2 block text-sm font-medium">
          Search articles + stories
        </label>
        <div className="flex items-center gap-3">
          <input
            id={inputId}
            name="q"
            type="search"
            inputMode="search"
            autoComplete="off"
            spellCheck="true"
            placeholder="Try “nicotine cravings” or “quit timeline”"
            // aria-label mirrors the visible <label> text exactly. The
            // jsx-a11y/control-has-associated-label rule doesn't detect
            // the htmlFor → id linkage through the flex-row wrapper, so
            // this dual-label belt-and-suspenders satisfies the rule
            // without divergence between visible + AT-announced names.
            aria-label="Search articles + stories"
            aria-describedby={statusId}
            className="border-border-default text-fg-default bg-bg-default flex-1 rounded border px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="bg-accent-primary text-accent-fg hover:bg-accent-primary-hover rounded-md px-4 py-2 text-sm font-medium"
          >
            Search
          </button>
        </div>
      </form>

      <div id={statusId} className="mt-4 text-sm" aria-live="polite" aria-atomic="true">
        {state.status === 'loading' || isPending
          ? `Searching for “${state.query}”…`
          : state.status === 'success'
            ? state.total === 0
              ? `No results for “${state.query}”.`
              : `${state.total} result${state.total === 1 ? '' : 's'} for “${state.query}”.`
            : state.status === 'error'
              ? `Search failed: ${state.errorMessage ?? 'unknown error'}`
              : null}
      </div>

      {showResults && state.hits.length > 0 ? (
        <ul className="mt-6 space-y-4">
          {state.hits.map((hit) => (
            <li key={hit.id} className="border-border-default rounded-lg border p-4">
              <a href={hit.url} className="text-fg-default text-base font-semibold hover:underline">
                {hit.title}
              </a>
              <p className="text-fg-muted mt-1 text-sm">{hit.excerpt}</p>
              <p className="text-fg-muted mt-2 text-xs uppercase tracking-wide">{hit.category}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
