import { cookies } from 'next/headers';
import dynamic from 'next/dynamic';
import { makeHoneypotField, makeRenderTimestamp } from '@quilty/security';
import type { Metadata } from 'next';

/**
 * ContactForm is dynamically imported so the RHF + Zod + zodResolver
 * payload (~35-40 KB gz) does not ship synchronously on first paint
 * of the /contact route. Critical for keeping the (marketing) route
 * chunk under the 60 KB ceiling once Turnstile activates
 * (+18-22 KB gz). The `ssr: true` (default) preserves no-JS form
 * rendering and SEO. The skeleton fallback below reserves the form's
 * vertical space to avoid CLS while the chunk loads.
 */
const ContactForm = dynamic(
  () => import('./ContactForm').then((mod) => ({ default: mod.ContactForm })),
  {
    loading: () => (
      <div className="space-y-6" aria-busy="true" aria-label="Loading contact form">
        <div className="bg-bg-elevated min-h-[44px] w-full rounded border" />
        <div className="bg-bg-elevated min-h-[44px] w-full rounded border" />
        <div className="bg-bg-elevated min-h-[44px] w-full rounded border" />
        <div className="bg-bg-elevated min-h-[150px] w-full rounded border" />
      </div>
    ),
  },
);

/**
 * /contact route.
 *
 * Server Component responsibilities:
 *   1. READ the `__Host-quilty_csrf` cookie that proxy.ts minted on
 *      this request. Next.js 16 hardened the `cookies()` API to be
 *      read-only outside Server Actions invoked from the client,
 *      Route Handlers, and middleware (proxy.ts). The mint happens
 *      at the proxy layer via the Web Crypto `generateCsrfTokenEdge()`
 *      helper; this page only reads.
 *   2. Mint a fresh time-trap token. The token's render timestamp
 *      becomes the lower-bound check at submission.
 *   3. Mint a honeypot field name (random per render so a bot
 *      maintainer who pattern-matched the field name on one visit
 *      cannot reuse the result on the next).
 *   4. Render the visible disclaimer — HIPAA-aligned mitigation for
 *      the user-locked echo-the-message UX choice; the sanitizer
 *      value-pattern regex (D67 + D148) is the layered backstop.
 *   5. Render the Client Component form with the server-minted
 *      tokens passed as props.
 *
 * Cookie name `__Host-quilty_csrf` per OWASP — the `__Host-` prefix
 * forces `Secure` + `Path=/` + no `Domain` (mutually exclusive with
 * parent-domain sharing). HttpOnly is NOT set: the Client Component
 * reads the cookie to forward the token in the `X-Quilty-CSRF`
 * header (the canonical double-submit defense; this cookie is not a
 * session credential).
 *
 * CSP-tier drift trigger: this route ships under the marketing-tier
 * CSP today (no nonce, no strict-dynamic) per D59. When the Turnstile
 * widget activates (Cloudflare BAA + secret provisioning), the
 * proxy.ts route classifier should be revisited — adding
 * `additionalScriptSrc` + `additionalConnectSrc` for
 * `https://challenges.cloudflare.com` is necessary but not
 * sufficient: a third-party DOM widget on the first user-input
 * surface is a strong argument to upgrade /contact to the portal
 * (nonce + strict-dynamic) tier so a future inline-script injection
 * has no permissive script-src fallback.
 */

export const metadata: Metadata = {
  title: 'Contact Quilty — get in touch with our team',
  description:
    'Have a question about Quilty? Send our team a note and we will respond within two business days. For clinical questions, please contact your provider directly.',
  alternates: {
    canonical: '/en/contact',
    languages: { 'en-US': '/en/contact', 'x-default': '/en/contact' },
  },
  openGraph: {
    title: 'Contact Quilty — get in touch with our team',
    description:
      'Send our team a note and we will respond within two business days. For clinical questions, please contact your provider directly.',
    url: '/en/contact',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Contact Quilty — get in touch with our team',
    description: 'Send our team a note and we will respond within two business days.',
  },
};

const CSRF_COOKIE_NAME = '__Host-quilty_csrf';

export default async function ContactPage() {
  const cookieStore = await cookies();
  const timeToken = makeRenderTimestamp();
  const honeypot = makeHoneypotField();

  // Read the CSRF token that proxy.ts minted on this request. The mint
  // logic lives in middleware because Next.js 16 forbids `cookies().set()`
  // during Server Component render — proxy.ts uses `request.cookies.set()`
  // (visible to this read) + `response.cookies.set()` (browser persistence)
  // before the page renders. A null value here means the page was
  // reached without proxy.ts running (route-matcher misconfiguration);
  // we throw rather than rendering an unverifiable form.
  const csrfToken = cookieStore.get(CSRF_COOKIE_NAME)?.value;
  if (csrfToken === undefined) {
    throw new Error(
      'CSRF cookie missing — proxy.ts should have minted it for /contact routes. Verify the proxy.ts matcher and isFormsRoute() coverage.',
    );
  }

  return (
    <section className="mx-auto max-w-2xl px-6 py-24">
      <header className="mb-8">
        <h1 className="text-fg-default text-4xl font-semibold">Contact us</h1>
        <p className="text-fg-muted mt-3">
          Have a question or want to learn more about Quilty? Send us a note and we&apos;ll respond
          within two business days.
        </p>
      </header>

      {/* `<aside>` keeps its native `complementary` landmark role —
          we drop the `role="note"` override per the a11y review so AT
          users can navigate to the privacy disclaimer via landmark
          rotor. `aria-label` names the region. WCAG 1.3.6. */}
      <aside
        aria-label="Privacy disclaimer"
        className="bg-bg-elevated text-fg-default mb-8 rounded-r border-l-4 p-4 text-sm shadow-sm"
        style={{ borderLeftColor: 'var(--color-warning-500)' }}
      >
        <p>
          <strong className="font-semibold">A note on privacy: </strong>
          We email a copy of your message back to you for your records. Please do not include
          sensitive medical or personal information in your message. For clinical questions, contact
          your provider directly.
        </p>
      </aside>

      <ContactForm csrfToken={csrfToken} timeToken={timeToken} honeypotFieldName={honeypot.name} />
    </section>
  );
}
