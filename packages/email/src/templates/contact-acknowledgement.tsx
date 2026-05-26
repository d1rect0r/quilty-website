/**
 * Contact-acknowledgement transactional email template (D31 + D67).
 *
 * The locked echo-the-message UX (D113 forms-canonical surface):
 * we email a copy of the user's submitted message back to them for
 * their records. The value-pattern regex pass in @quilty/security
 * sanitize (D67 + D148) catches free-text PHI in the message body
 * BEFORE this template renders, so any phone / email / SSN / card /
 * DOB / MRN shape arrives as `[EMAIL]`, `[PHONE]`, etc. The visible
 * disclaimer on /contact is the user-facing mitigation; this template
 * is the user-visible artifact of that contract.
 *
 * Rendering surface: @react-email/components produces both HTML and
 * plain-text bodies. The in-memory EmailSender adapter records the
 * EmailEnvelope without rendering today; the SES adapter at
 * activation calls `render(<ContactAcknowledgementEmail ... />)` to
 * produce the HTML payload + uses the same component's `toText()`
 * variant for the multipart text alternative.
 *
 * Non-PHI invariant: `templateData` arriving here has already passed
 * through `wrapEmailSender`'s sanitizer chokepoint (the recursive
 * scrub + value-pattern regex). The template MUST NOT add new
 * PHI-shaped strings; only structural copy + the four templateData
 * fields are interpolated.
 */

import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import * as React from 'react';

export interface ContactAcknowledgementProps {
  /** Recipient first name (or full name if first name not parsed). */
  readonly name: string;
  /** User-submitted subject line. */
  readonly subject: string;
  /** User-submitted message body — already PHI-scrubbed at the wrapper. */
  readonly message: string;
  /** Request-scoped correlation ID (q1m_<crockford-base32>). */
  readonly reference: string;
  /** Locale-prefixed root URL for cross-links (e.g., https://my-quilty.com/en). */
  readonly siteUrl?: string;
}

const DEFAULT_SITE_URL = 'https://my-quilty.com/en';

export function ContactAcknowledgementEmail({
  name,
  subject,
  message,
  reference,
  siteUrl = DEFAULT_SITE_URL,
}: ContactAcknowledgementProps): React.JSX.Element {
  const previewText = `We received your message — reference ${reference}`;

  return (
    <Html lang="en">
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Heading as="h1" style={headingStyle}>
            Quilty — your inquiry
          </Heading>

          <Text style={paragraphStyle}>Hi {name},</Text>

          <Text style={paragraphStyle}>
            Thanks for reaching out. We received your message and will respond within two business
            days.
          </Text>

          <Text style={referenceStyle}>
            Reference: <code style={codeStyle}>{reference}</code>
          </Text>

          <Hr style={hrStyle} />

          <Section style={echoSectionStyle}>
            <Text style={echoLabelStyle}>Your message — for your records:</Text>
            <Text style={echoSubjectStyle}>
              <strong>Subject:</strong> {subject}
            </Text>
            <Text style={echoBodyStyle}>{message}</Text>
          </Section>

          <Hr style={hrStyle} />

          <Text style={footerStyle}>
            For clinical questions, please contact your provider directly. Quilty does not provide
            medical advice through this channel.
          </Text>

          <Text style={footerStyle}>
            <Link href={`${siteUrl}/legal/privacy`} style={linkStyle}>
              Privacy policy
            </Link>
            {' · '}
            <Link href={`${siteUrl}/accessibility`} style={linkStyle}>
              Accessibility
            </Link>
            {' · '}
            <Link href={`${siteUrl}/contact`} style={linkStyle}>
              Contact
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

// react-email recommends inline styles for maximum email-client
// compatibility (Outlook, Gmail clipping, Apple Mail dark mode).
// Tailwind utility classes don't reliably make it through email
// rendering pipelines.

const bodyStyle: React.CSSProperties = {
  backgroundColor: '#f4f4f5',
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  margin: 0,
  padding: 0,
};

const containerStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: '8px',
  margin: '40px auto',
  maxWidth: '600px',
  padding: '32px',
};

const headingStyle: React.CSSProperties = {
  color: '#0f172a',
  fontSize: '24px',
  fontWeight: 600,
  margin: '0 0 16px 0',
};

const paragraphStyle: React.CSSProperties = {
  color: '#0f172a',
  fontSize: '16px',
  lineHeight: '24px',
  margin: '12px 0',
};

const referenceStyle: React.CSSProperties = {
  ...paragraphStyle,
  color: '#475569',
};

const codeStyle: React.CSSProperties = {
  backgroundColor: '#f1f5f9',
  borderRadius: '4px',
  fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
  fontSize: '14px',
  padding: '2px 6px',
};

const hrStyle: React.CSSProperties = {
  borderColor: '#e2e8f0',
  borderStyle: 'solid',
  borderWidth: '1px 0 0 0',
  margin: '24px 0',
};

const echoSectionStyle: React.CSSProperties = {
  backgroundColor: '#f8fafc',
  borderLeftColor: '#475569',
  borderLeftStyle: 'solid',
  borderLeftWidth: '4px',
  borderRadius: '0 4px 4px 0',
  margin: '16px 0',
  padding: '16px',
};

const echoLabelStyle: React.CSSProperties = {
  color: '#64748b',
  fontSize: '12px',
  fontWeight: 600,
  letterSpacing: '0.05em',
  margin: '0 0 8px 0',
  textTransform: 'uppercase',
};

const echoSubjectStyle: React.CSSProperties = {
  ...paragraphStyle,
  margin: '0 0 8px 0',
};

const echoBodyStyle: React.CSSProperties = {
  ...paragraphStyle,
  margin: 0,
  whiteSpace: 'pre-wrap' as const,
};

const footerStyle: React.CSSProperties = {
  color: '#64748b',
  fontSize: '14px',
  lineHeight: '20px',
  margin: '8px 0',
};

const linkStyle: React.CSSProperties = {
  color: '#0369a1',
  textDecoration: 'underline',
};
