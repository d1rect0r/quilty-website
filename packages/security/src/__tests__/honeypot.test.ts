import { describe, expect, it } from 'vitest';
import { makeHoneypotField, verifyHoneypot } from '../domain/honeypot';

describe('makeHoneypotField', () => {
  it('returns a field name from the rotation pool', () => {
    const field = makeHoneypotField();
    expect(field.name.length).toBeGreaterThan(0);
    expect(['fax_number', 'extension', 'prefix', 'middle_initial', 'address_line_3']).toContain(
      field.name,
    );
  });

  it('sets autocompleteHint to "nope" (unautofillable)', () => {
    const field = makeHoneypotField();
    expect(field.autocompleteHint).toBe('nope');
  });

  it('rotates names across calls (over a sample of 50)', () => {
    const names = new Set<string>();
    for (let i = 0; i < 50; i++) {
      names.add(makeHoneypotField().name);
    }
    // Probabilistic check — the chance of 50 single-name calls is
    // (1/5)^49 ≈ 1.7e-35, well past the flake floor.
    expect(names.size).toBeGreaterThan(1);
  });
});

describe('verifyHoneypot', () => {
  it('returns ok when the field value is empty', () => {
    const result = verifyHoneypot({ fieldName: 'fax_number', value: '' });
    expect(result.ok).toBe(true);
  });

  it('returns honeypot_filled when the field is non-empty', () => {
    const result = verifyHoneypot({ fieldName: 'fax_number', value: 'bot-filled-it' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('honeypot_filled');
      expect(result.error.fieldName).toBe('fax_number');
    }
  });

  it('treats a single-space value as filled (no whitespace tolerance)', () => {
    const result = verifyHoneypot({ fieldName: 'extension', value: ' ' });
    expect(result.ok).toBe(false);
  });
});
