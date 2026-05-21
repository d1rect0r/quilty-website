/**
 * Renders a JSON-LD script tag with the given structured-data payload.
 *
 * Per ADR-0005 (two-tier CSP): the nonce is propagated via
 * `(await headers()).get('x-nonce')` on portal routes; marketing routes
 * use static CSP with pre-computed hash. This component accepts an
 * optional `nonce` prop — when provided, the inline script carries it;
 * when omitted, the inline script falls under the static-hash CSP
 * allowlist.
 *
 * Per D27: Organization + SoftwareApplication + WebSite + BreadcrumbList
 * carry SERP weight; MedicalWebPage + FAQPage serve AI-overview citation
 * graphs (Google retired FAQPage rich-result eligibility 2026-05-07).
 */

import type { ReactElement } from 'react';

export interface JsonLdProps {
  data: Record<string, unknown> | Record<string, unknown>[];
  nonce?: string;
}

// Build regex objects for U+2028 / U+2029 via the RegExp constructor +
// String.fromCodePoint. Avoids putting the raw codepoints into the
// source — they are silently strippable during editor round-trips and
// some bundlers reject the literal form outright (TS 5.7 + Next.js 16
// SWC for example).
const LINE_SEP_REGEX = new RegExp(String.fromCodePoint(0x2028), 'g');
const PARA_SEP_REGEX = new RegExp(String.fromCodePoint(0x2029), 'g');

/**
 * Escape characters that could either close out the surrounding script
 * block or trip JS source-code parsers when JSON-LD is read inline:
 *   - `<` / `>` — guards against `</script>` injection
 *   - `&` — guards against HTML entity confusion
 *   - U+2028 / U+2029 — line/paragraph separators are valid in JSON but
 *     break in some JS contexts (legacy parsers, eval paths)
 */
function safeStringify(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(LINE_SEP_REGEX, '\\u2028')
    .replace(PARA_SEP_REGEX, '\\u2029');
}

export function JsonLd({ data, nonce }: JsonLdProps): ReactElement {
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      dangerouslySetInnerHTML={{ __html: safeStringify(data) }}
    />
  );
}
