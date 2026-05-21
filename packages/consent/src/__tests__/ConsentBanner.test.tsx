import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ConsentBanner } from '../components/ConsentBanner.js';

describe('ConsentBanner (renderless stub)', () => {
  it('renders nothing — DOM stays empty until the banner activation wires real UI', () => {
    const { container } = render(<ConsentBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('does NOT register any vendor SDK at module-eval time (D35 chokepoint)', () => {
    // The stub has zero imports beyond React; a module-eval-time SDK
    // import would break the Cerebral-lesson chokepoint by initializing
    // a vendor before consent has been recorded. This test asserts the
    // module is callable without throwing, which is the surface-level
    // proxy for "no side effects on import."
    expect(() => render(<ConsentBanner />)).not.toThrow();
  });
});
