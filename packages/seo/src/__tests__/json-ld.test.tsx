import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { JsonLd } from '../JsonLd.js';

describe('JsonLd component', () => {
  it('renders a JSON-LD script tag with the correct type attribute', () => {
    const html = renderToString(<JsonLd data={{ '@type': 'WebSite' }} />);
    expect(html).toContain('type="application/ld+json"');
  });

  it('escapes `<` so </script> in the payload cannot break out of the tag', () => {
    const html = renderToString(<JsonLd data={{ description: 'inject </script><img>' }} />);
    expect(html).not.toContain('</script><img>');
    expect(html).toContain('\\u003c');
  });

  it('escapes `>` for symmetry against `<`', () => {
    const html = renderToString(<JsonLd data={{ description: 'a>b' }} />);
    expect(html).toContain('\\u003e');
  });

  it('escapes `&` so the inline script does not get entity-confused', () => {
    const html = renderToString(<JsonLd data={{ description: 'a & b' }} />);
    expect(html).toContain('\\u0026');
  });

  it('includes the nonce attribute when provided', () => {
    const html = renderToString(<JsonLd data={{ '@type': 'WebSite' }} nonce="abc-123" />);
    expect(html).toContain('nonce="abc-123"');
  });

  it('omits the nonce attribute when not provided (marketing tier static-hash CSP)', () => {
    const html = renderToString(<JsonLd data={{ '@type': 'WebSite' }} />);
    expect(html).not.toContain('nonce=');
  });

  it('serializes arrays of LD nodes (graph fragment usage)', () => {
    const html = renderToString(
      <JsonLd
        data={[
          { '@type': 'Organization', name: 'A' },
          { '@type': 'WebSite', name: 'B' },
        ]}
      />,
    );
    expect(html).toContain('"@type":"Organization"');
    expect(html).toContain('"@type":"WebSite"');
  });

  it('escapes U+2028 line separator so inline JSON-LD cannot break the JS parser', () => {
    // U+2028 is valid inside a JSON string but breaks legacy JS parsers
    // when the JSON is read inline as a script body — the XSS defense
    // surface JsonLd is meant to harden.
    const lineSep = String.fromCodePoint(0x2028);
    const html = renderToString(<JsonLd data={{ note: `line${lineSep}break` }} />);
    expect(html).toContain('\\u2028');
    expect(html).not.toContain(lineSep);
  });

  it('escapes U+2029 paragraph separator', () => {
    const paraSep = String.fromCodePoint(0x2029);
    const html = renderToString(<JsonLd data={{ note: `para${paraSep}break` }} />);
    expect(html).toContain('\\u2029');
    expect(html).not.toContain(paraSep);
  });
});
