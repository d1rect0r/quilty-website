import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockHeaders = vi.fn();

vi.mock('next/headers', () => ({
  headers: () => mockHeaders(),
}));

// `server-only` is globally mocked in vitest.setup.ts (the package's
// production server-only guard fires at the Next.js bundler layer, not
// the test runtime).

const { GpcHonoredIndicator } = await import('../components/GpcHonoredIndicator.js');

describe('GpcHonoredIndicator', () => {
  afterEach(() => {
    mockHeaders.mockReset();
  });

  function makeHeaderShape(gpc: string | null) {
    return {
      get: (name: string) => (name.toLowerCase() === 'sec-gpc' ? gpc : null),
    };
  }

  it('renders the visible §7025(c)(6) acknowledgment when Sec-GPC: 1', async () => {
    mockHeaders.mockReturnValue(Promise.resolve(makeHeaderShape('1')));
    const result = await GpcHonoredIndicator();
    expect(result).not.toBeNull();
    const { container } = render(result);
    const paragraph = container.querySelector('p');
    expect(paragraph).not.toBeNull();
    expect(paragraph?.textContent).toMatch(/Global Privacy Control/);
    expect(paragraph?.textContent).toMatch(/honored/);
  });

  it('returns null when Sec-GPC absent (does NOT render an empty element implying GPC support)', async () => {
    mockHeaders.mockReturnValue(Promise.resolve(makeHeaderShape(null)));
    const result = await GpcHonoredIndicator();
    expect(result).toBeNull();
  });

  it('returns null for Sec-GPC: 0 (opt-in is the absence of a signal, not a 0)', async () => {
    mockHeaders.mockReturnValue(Promise.resolve(makeHeaderShape('0')));
    const result = await GpcHonoredIndicator();
    expect(result).toBeNull();
  });
});
