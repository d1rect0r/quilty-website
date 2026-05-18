'use client';

/**
 * Global error boundary — catches errors in the root layout itself.
 *
 * Per Next.js convention: must render its own `<html>` + `<body>` because
 * the root layout failed to render. Cannot use any layout JSX from above.
 *
 * At M6+ wires logError() (D67). At M1 a minimal text-only fallback so the
 * page at least renders even if the entire layout pipeline crashes.
 */
interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  return (
    <html lang="en">
      <body>
        <main
          style={{
            maxWidth: '40rem',
            margin: '0 auto',
            padding: '6rem 1.5rem',
            textAlign: 'center',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <h1 style={{ fontSize: '2rem', fontWeight: 600 }}>
            Something went wrong
          </h1>
          <p style={{ marginTop: '1rem', color: '#666' }}>
            The page failed to load. Try again, or contact support if the
            problem persists.
          </p>
          {error.digest ? (
            <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#999' }}>
              Reference: <code>{error.digest}</code>
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: '2rem',
              padding: '0.5rem 1rem',
              borderRadius: '0.375rem',
              border: '1px solid #ccc',
              background: '#fff',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
