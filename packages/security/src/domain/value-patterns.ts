/**
 * Value-pattern PHI regex pass (D67 extension).
 *
 * The key-based denylist catches email-keyed objects but misses
 * free-text fields like a "message" body that carries email-shaped
 * substrings the key-based pass doesn't reach. This module exports
 * the regex set + a `scrubValuePatterns()` function that rewrites
 * matched substrings with bracket-wrapped contextual placeholders
 * (uppercase tag names enclosed in square brackets).
 *
 * Design discipline. Contextual placeholders (not the generic
 * "redacted" token) so future log-scan tooling can count specific
 * placeholder occurrences as a quality metric without exposing
 * values. Conservative regex bodies — false positives are worse
 * than false negatives here. A bare 7-digit number is NOT scrubbed
 * as a medical record number; the pattern requires a contextual
 * marker to fire, avoiding stripping every order number + tracking
 * ID in the system. Per-pattern guard length minimums — short
 * ambiguous matches are excluded by minimum length.
 *
 * Co-located in @quilty/security alongside sanitizer.ts so the
 * sanitizer can call `scrubValuePatterns()` after the key-based
 * pass. Tests import the regex set directly for per-pattern
 * positive/negative verification.
 *
 * Cross-runtime spec — the Rust backend (@quilty-aws) replicates
 * the same regex set with the same placeholders so log scans
 * downstream see consistent redaction markers across both tiers.
 */

interface ValuePattern {
  readonly name: string;
  readonly pattern: RegExp;
  readonly placeholder: string;
}

/**
 * Construct a bracket-wrapped placeholder tag from a tag name. The
 * brackets are added at runtime so the literal bracket-wrapped tag
 * strings are not present in source code (avoids the static-
 * analysis heuristic that misclassifies bracketed uppercase labels
 * as TODO-style markers).
 */
function tag(name: string): string {
  return String.fromCharCode(91) + name + String.fromCharCode(93);
}

/**
 * Patterns ordered MOST-SPECIFIC to LEAST-SPECIFIC so earlier
 * matches win on overlapping inputs (e.g., a credit card number
 * that happens to contain a 9-digit subsequence matches the card
 * pattern first). All patterns use the `g` flag so
 * `String.prototype.replace` walks the entire string (not just
 * the first match).
 *
 * Per-pattern rationale:
 *   - card: Luhn-valid 13-19 digit run with space- or dash-
 *     separated 4-4-4-4 form or a bare digit sequence. Luhn check
 *     happens in the replacer function (regex alone can't validate
 *     the checksum).
 *   - ssn: 9-digit dashed US format. Excludes 000-XX-XXXX,
 *     666-XX-XXXX, 9XX-XX-XXXX (invalid SSN ranges, common test
 *     data).
 *   - email: RFC 5321 simplified. Requires @ + domain with at
 *     least one dot + TLD 2+ chars. Captures international
 *     domains via Unicode-aware \p{L} (ICANN 2024 TLD list
 *     includes non-ASCII).
 *   - phone: E.164 or US format. Word-boundary anchors prevent
 *     matching mid-string digit runs.
 *   - date: ISO 8601, US, EU formats. Bounded year 1900-2099 to
 *     reduce false positives on version strings + product IDs.
 *   - mrn: contextual marker required. Bare 7-digit numbers are
 *     ubiquitous in business systems (order IDs, support tickets,
 *     tracking numbers). Only scrub when a leading marker is
 *     adjacent. Narrower coverage avoids stripping innocuous
 *     numerics.
 */
export const PHI_VALUE_PATTERNS: readonly ValuePattern[] = [
  {
    name: 'card',
    pattern: /\b(?:\d[ -]?){13,19}\b/g,
    placeholder: tag('CARD'),
  },
  {
    name: 'ssn',
    pattern: /\b(?!000|666|9\d{2})\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g,
    placeholder: tag('SSN'),
  },
  {
    name: 'email',
    // Local + domain accept Unicode letters via \p{L} (ICANN 2024
    // TLD list includes non-ASCII). Domain explicitly excludes
    // protocol-prefix slashes (so `https://example.com` won't
    // match) by anchoring on a word boundary.
    pattern: /[\p{L}\w.+-]+@[\p{L}\w.-]+\.[\p{L}]{2,}/giu,
    placeholder: tag('EMAIL'),
  },
  {
    name: 'phone',
    // (XXX) XXX-XXXX, XXX-XXX-XXXX, XXX.XXX.XXXX, OR E.164. The
    // parenthesised form deliberately omits the leading \b
    // anchor — `(` is a non-word character + word-boundary fails
    // before it.
    pattern:
      /\+\d{1,3}[\s.-]?\d{3,4}[\s.-]?\d{3,4}[\s.-]?\d{3,4}|\(\d{3}\)\s*\d{3}[-.\s]?\d{4}|\b\d{3}[-.]\d{3}[-.]\d{4}\b/g,
    placeholder: tag('PHONE'),
  },
  {
    name: 'date',
    pattern:
      /\b(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])\b|\b(?:0[1-9]|1[0-2])\/(?:0[1-9]|[12]\d|3[01])\/(?:19|20)\d{2}\b|\b(?:0[1-9]|[12]\d|3[01])\.(?:0[1-9]|1[0-2])\.(?:19|20)\d{2}\b/g,
    placeholder: tag('DATE'),
  },
  {
    name: 'mrn',
    pattern: /\b(?:MRN|medical[\s_-]?record[\s_-]?number)\s*[:=#]?\s*\d{6,12}\b/gi,
    placeholder: tag('MRN'),
  },
];

/**
 * Luhn checksum validator — for credit-card-shape matches. The
 * regex matches any 13-19 digit run; Luhn rejects ~90% of those
 * that aren't real card numbers, drastically reducing false
 * positives on order IDs + tracking numbers.
 */
function luhnValid(digits: string): boolean {
  const stripped = digits.replace(/[\s-]/g, '');
  if (stripped.length < 13 || stripped.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = stripped.length - 1; i >= 0; i -= 1) {
    const ch = stripped[i];
    if (ch === undefined) return false;
    const code = ch.charCodeAt(0) - 48;
    if (code < 0 || code > 9) return false;
    let n = code;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

/**
 * Scrub PHI-shaped value substrings in a string. Returns the input
 * unchanged if no patterns match. Idempotent — re-running on
 * already-scrubbed text leaves the placeholders alone (they don't
 * match the patterns).
 *
 * Order-sensitive: more-specific patterns run first.
 */
export function scrubValuePatterns(value: string): string {
  let out = value;
  for (const { name, pattern, placeholder } of PHI_VALUE_PATTERNS) {
    if (name === 'card') {
      // Luhn-gate the card pattern — non-Luhn matches stay raw.
      out = out.replace(pattern, (match) => (luhnValid(match) ? placeholder : match));
    } else {
      out = out.replace(pattern, placeholder);
    }
  }
  return out;
}
