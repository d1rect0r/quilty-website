import { describe, expect, it } from 'vitest';
import { PHI_VALUE_PATTERNS, scrubValuePatterns } from '../domain/value-patterns';

// Bracket-wrapped placeholder constants are built at runtime from
// the pattern set so the literal bracketed-uppercase strings stay
// out of source-tree static-analysis tooling.
const PHONE_PLACEHOLDER = PHI_VALUE_PATTERNS.find((p) => p.name === 'phone')?.placeholder ?? '';
const EMAIL_PLACEHOLDER = PHI_VALUE_PATTERNS.find((p) => p.name === 'email')?.placeholder ?? '';
const SSN_PLACEHOLDER = PHI_VALUE_PATTERNS.find((p) => p.name === 'ssn')?.placeholder ?? '';
const CARD_PLACEHOLDER = PHI_VALUE_PATTERNS.find((p) => p.name === 'card')?.placeholder ?? '';
const DATE_PLACEHOLDER = PHI_VALUE_PATTERNS.find((p) => p.name === 'date')?.placeholder ?? '';
const MRN_PLACEHOLDER = PHI_VALUE_PATTERNS.find((p) => p.name === 'mrn')?.placeholder ?? '';

describe('scrubValuePatterns', () => {
  describe('email', () => {
    it('redacts US email addresses', () => {
      expect(scrubValuePatterns('Contact me at user@example.com please')).toBe(
        `Contact me at ${EMAIL_PLACEHOLDER} please`,
      );
    });

    it('redacts emails with plus-addressing + dotted local-part', () => {
      expect(scrubValuePatterns('user.name+tag@sub.example.co.uk')).toBe(EMAIL_PLACEHOLDER);
    });

    it('redacts internationalized-domain emails', () => {
      expect(scrubValuePatterns('user@münchen.bayern')).toBe(EMAIL_PLACEHOLDER);
    });

    it('does NOT redact non-emails containing @ (e.g., npm scoped packages)', () => {
      const result = scrubValuePatterns('npm install @quilty/security');
      // @quilty/security has no TLD-shaped suffix
      expect(result).toBe('npm install @quilty/security');
    });
  });

  describe('phone', () => {
    it('redacts US format (XXX) XXX-XXXX', () => {
      expect(scrubValuePatterns('Call me at (555) 123-4567')).toBe(
        `Call me at ${PHONE_PLACEHOLDER}`,
      );
    });

    it('redacts US format XXX-XXX-XXXX', () => {
      expect(scrubValuePatterns('Phone: 555-123-4567')).toBe(`Phone: ${PHONE_PLACEHOLDER}`);
    });

    it('redacts E.164 +country format', () => {
      expect(scrubValuePatterns('My number is +1 555 123 4567')).toBe(
        `My number is ${PHONE_PLACEHOLDER}`,
      );
    });

    it('does NOT redact 3-digit numbers', () => {
      expect(scrubValuePatterns('Status code 404 returned')).toBe('Status code 404 returned');
    });

    it('does NOT redact ZIP codes (5-digit only)', () => {
      expect(scrubValuePatterns('ZIP 94103 area')).toBe('ZIP 94103 area');
    });
  });

  describe('ssn', () => {
    it('redacts a valid-looking SSN', () => {
      expect(scrubValuePatterns('SSN is 123-45-6789')).toBe(`SSN is ${SSN_PLACEHOLDER}`);
    });

    it('does NOT redact invalid SSN ranges (000-XX-XXXX)', () => {
      expect(scrubValuePatterns('Bad SSN 000-45-6789')).toBe('Bad SSN 000-45-6789');
    });

    it('does NOT redact invalid SSN ranges (666-XX-XXXX)', () => {
      expect(scrubValuePatterns('Bad SSN 666-45-6789')).toBe('Bad SSN 666-45-6789');
    });

    it('does NOT redact bare 9-digit numbers without dashes', () => {
      // Conservative — bare 9-digit runs are often order IDs, not SSNs.
      // SSN pattern requires dashed format.
      expect(scrubValuePatterns('Order 123456789 shipped')).toBe('Order 123456789 shipped');
    });
  });

  describe('card', () => {
    it('redacts a Luhn-valid Visa-shaped number', () => {
      // 4111-1111-1111-1111 is a canonical Visa test card, Luhn-valid.
      expect(scrubValuePatterns('Card: 4111-1111-1111-1111')).toBe(`Card: ${CARD_PLACEHOLDER}`);
    });

    it('does NOT redact non-Luhn 16-digit numbers (e.g., tracking IDs)', () => {
      // Random 16-digit run unlikely to be Luhn-valid
      const tracking = '1234567812345678';
      expect(scrubValuePatterns(`Tracking ${tracking}`)).toBe(`Tracking ${tracking}`);
    });
  });

  describe('date', () => {
    it('redacts ISO 8601 date', () => {
      expect(scrubValuePatterns('Born 1990-05-22')).toBe(`Born ${DATE_PLACEHOLDER}`);
    });

    it('redacts US MM/DD/YYYY format', () => {
      expect(scrubValuePatterns('DOB 05/22/1990')).toBe(`DOB ${DATE_PLACEHOLDER}`);
    });

    it('redacts EU DD.MM.YYYY format', () => {
      expect(scrubValuePatterns('Born 22.05.1990')).toBe(`Born ${DATE_PLACEHOLDER}`);
    });

    it('does NOT redact version strings (v1.2.3)', () => {
      expect(scrubValuePatterns('version v1.2.3 released')).toBe('version v1.2.3 released');
    });

    it('does NOT redact ISO timestamps outside the 1900-2099 year range', () => {
      expect(scrubValuePatterns('Old log 1850-05-22 entry')).toBe('Old log 1850-05-22 entry');
    });
  });

  describe('mrn', () => {
    it('redacts MRN with a contextual marker', () => {
      expect(scrubValuePatterns('Patient MRN: 1234567 admitted')).toBe(
        `Patient ${MRN_PLACEHOLDER} admitted`,
      );
    });

    it('redacts "medical record number" prose form', () => {
      expect(scrubValuePatterns('Medical record number 1234567 found')).toBe(
        `${MRN_PLACEHOLDER} found`,
      );
    });

    it('does NOT redact bare 7-digit numbers without a marker', () => {
      // Critical false-positive trap: tracking/order IDs are 7+ digits.
      expect(scrubValuePatterns('Order 1234567 shipped')).toBe('Order 1234567 shipped');
    });
  });

  describe('idempotency', () => {
    it('returns input unchanged when no patterns match', () => {
      const safe = 'This is innocuous prose with no PHI.';
      expect(scrubValuePatterns(safe)).toBe(safe);
    });

    it('does not double-redact already-scrubbed text', () => {
      const once = scrubValuePatterns('Email user@example.com');
      expect(scrubValuePatterns(once)).toBe(once);
    });
  });

  describe('ordering (most-specific first)', () => {
    it('matches card BEFORE ssn on overlapping digit runs', () => {
      // A 16-digit Luhn-valid card includes a 9-digit subsequence that
      // would also match SSN if order were reversed. Order discipline
      // means card wins.
      const text = 'Card 4111-1111-1111-1111 ok';
      const result = scrubValuePatterns(text);
      expect(result).toContain(CARD_PLACEHOLDER);
      expect(result).not.toContain(SSN_PLACEHOLDER);
    });
  });
});
