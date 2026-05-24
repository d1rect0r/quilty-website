import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ForbiddenPage from '../forbidden';

describe('app/[locale]/(account)/forbidden.tsx', () => {
  it('renders h1 "Forbidden" + 403 eyebrow', () => {
    render(<ForbiddenPage />);
    expect(screen.getByRole('heading', { level: 1, name: /forbidden/i })).toBeInTheDocument();
    expect(screen.getByText('403')).toBeInTheDocument();
  });

  it('links back to the profile (signed-in chrome contract)', () => {
    render(<ForbiddenPage />);
    const link = screen.getByRole('link', { name: /back to profile/i });
    expect(link.getAttribute('href')).toBe('/en/account');
  });
});
