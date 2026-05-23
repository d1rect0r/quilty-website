/**
 * Date-formatting helpers for legal + marketing pages.
 *
 * Two surface forms:
 *   1. `formatReviewDate(iso)` — visible human-readable form
 *      ("May 22, 2026"). Used as the text content of `<time>`
 *      elements so sighted users + screen-magnification users read
 *      a familiar locale-formatted date rather than the ISO string.
 *   2. `toIsoDateTime(iso)` — JSON-LD `dateModified` / `datePublished`
 *      form. Promotes a bare `YYYY-MM-DD` to the full ISO 8601
 *      datetime `YYYY-MM-DDT00:00:00Z`. schema.org accepts both but
 *      some structured-data validators warn on the bare date.
 *
 * Locale is hard-locked to `en-US` until next-intl activates. Once
 * the i18n milestone lands, formatReviewDate accepts a locale param.
 *
 * Both helpers are deterministic — they receive an ISO-shaped string
 * + return a fully resolved string. No `new Date()` at request time,
 * so callers stay statically renderable.
 */

const REVIEW_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
});

/**
 * Render a YYYY-MM-DD string as "Month D, YYYY" in en-US locale.
 * The Date constructor receives the ISO string + UTC anchor so the
 * formatter never drifts by timezone (a server in PST + a server in
 * UTC produce identical output).
 */
export function formatReviewDate(isoDate: string): string {
  return REVIEW_DATE_FORMATTER.format(new Date(`${isoDate}T00:00:00Z`));
}

/**
 * Promote a YYYY-MM-DD string to the JSON-LD-preferred ISO 8601
 * datetime form `YYYY-MM-DDT00:00:00Z`. The UTC anchor is the
 * least-ambiguous representation — schema.org's Date + DateTime
 * types both accept it.
 */
export function toIsoDateTime(isoDate: string): string {
  return `${isoDate}T00:00:00Z`;
}
