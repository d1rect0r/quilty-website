/**
 * Renders a JSON-LD <script> tag with the given structured-data payload.
 *
 * Per ADR-0005 (two-tier CSP): the nonce is propagated via `(await headers())
 * .get('x-nonce')` on portal routes; marketing routes use static CSP with
 * pre-computed hash. This component accepts an optional `nonce` prop —
 * when provided, the inline script carries it; when omitted, the inline
 * script falls under whatever static-hash CSP allowlist applies.
 *
 * Per D27 (Round-5 revised): Organization + SoftwareApplication + WebSite +
 * BreadcrumbList carry SERP weight; MedicalWebPage + FAQPage serve AI-overview
 * citation graphs (Google retired FAQPage rich-result eligibility 2026-05-07).
 */

export interface JsonLdProps {
  data: Record<string, unknown> | Record<string, unknown>[];
  nonce?: string;
}

/**
 * Escape characters that could either close out the surrounding <script>
 * block or trip JS source-code parsers when JSON-LD is read inline:
 *   - `<` / `>` — guards against `</script>` injection
 *   - `&` — guards against HTML entity confusion
 *   - U+2028 / U+2029 — line/paragraph separators are valid in JSON but
 *     break in some JS contexts (legacy JS parsers, eval paths)
 *
 * Escape-sequence form (` ` / ` `) used in the regex literals
 * — the raw codepoints are invisible in diff viewers and editor round-trips
 * can silently strip them (Round-5 SEO reviewer cross-check).
 */
function safeStringify(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function JsonLd({ data, nonce }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      dangerouslySetInnerHTML={{ __html: safeStringify(data) }}
    />
  );
}
