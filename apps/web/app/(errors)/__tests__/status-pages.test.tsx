import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import GonePage from '../410/page';
import LegalBlockPage from '../451/page';
import MaintenancePage from '../503/page';

describe('app/(errors)/410/page.tsx', () => {
  it('renders the Gone heading + eyebrow', () => {
    render(<GonePage />);
    expect(
      screen.getByRole('heading', { level: 1, name: /this page is gone/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('410')).toBeInTheDocument();
  });

  it('provides a Go home CTA pointing at the locale-prefixed apex', () => {
    render(<GonePage />);
    const link = screen.getByRole('link', { name: /go home/i });
    expect(link.getAttribute('href')).toBe('/en');
  });
});

describe('app/(errors)/451/page.tsx', () => {
  it('renders the legal-block heading + eyebrow', () => {
    render(<LegalBlockPage />);
    expect(
      screen.getByRole('heading', { level: 1, name: /unavailable for legal reasons/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('451')).toBeInTheDocument();
  });

  it('exposes support contact for appeals (RFC 7725 body identifies the authority)', () => {
    render(<LegalBlockPage />);
    expect(screen.getByRole('link', { name: /contact support/i })).toBeInTheDocument();
  });
});

describe('app/(errors)/503/page.tsx', () => {
  it('renders the maintenance heading + eyebrow + status copy', () => {
    render(<MaintenancePage />);
    expect(screen.getByRole('heading', { level: 1, name: /maintenance/i })).toBeInTheDocument();
    expect(screen.getByText('503')).toBeInTheDocument();
    expect(screen.getByText(/briefly offline for scheduled maintenance/i)).toBeInTheDocument();
  });

  it('links to the future status subdomain + provides support email', () => {
    render(<MaintenancePage />);
    const statusLink = screen.getByRole('link', { name: /live status/i });
    expect(statusLink.getAttribute('href')).toBe('https://status.my-quilty.com');
    expect(screen.getByRole('link', { name: /email support/i })).toBeInTheDocument();
  });

  it('omits a retry button — Retry-After header is the canonical signal', () => {
    render(<MaintenancePage />);
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
  });
});
