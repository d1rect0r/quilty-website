import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import UnauthorizedPage from '../unauthorized';

describe('app/[locale]/(account)/unauthorized.tsx', () => {
  it('renders h1 "Sign in required" + 401 eyebrow', () => {
    render(<UnauthorizedPage />);
    expect(
      screen.getByRole('heading', { level: 1, name: /sign in required/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('401')).toBeInTheDocument();
  });

  it('provides a sign-in CTA + go-home secondary', () => {
    render(<UnauthorizedPage />);
    expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go home/i })).toBeInTheDocument();
  });
});
