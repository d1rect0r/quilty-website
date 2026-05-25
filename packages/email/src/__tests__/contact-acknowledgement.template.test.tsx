import { render } from '@react-email/render';
import { describe, expect, it } from 'vitest';
import { ContactAcknowledgementEmail } from '../templates/contact-acknowledgement';

describe('ContactAcknowledgementEmail template (D113 + D67)', () => {
  const sample = {
    name: 'Alice',
    subject: 'Question about pricing',
    message: 'Could you tell me about the team plan?',
    reference: 'q1m_abc123def',
  } as const;

  it('renders HTML containing the greeting + reference + echoed subject + message', async () => {
    const html = await render(<ContactAcknowledgementEmail {...sample} />);
    // React renders `Hi {name},` as separate text nodes with
    // HTML-comment markers between adjacent strings. Match by
    // tolerant pattern rather than literal concatenation.
    expect(html).toMatch(/Hi\s*(<!--\s*-->)?Alice/);
    expect(html).toContain('q1m_abc123def');
    expect(html).toContain('Question about pricing');
    expect(html).toContain('Could you tell me about the team plan?');
  });

  it('emits the privacy footer + cross-links', async () => {
    const html = await render(<ContactAcknowledgementEmail {...sample} />);
    expect(html).toContain('clinical questions');
    expect(html).toMatch(/Privacy policy/i);
    expect(html).toMatch(/Accessibility/i);
  });

  it('renders plain-text alternative with the same load-bearing copy', async () => {
    const text = await render(<ContactAcknowledgementEmail {...sample} />, { plainText: true });
    expect(text).toContain('Alice');
    expect(text).toContain('q1m_abc123def');
    expect(text).toContain('Question about pricing');
    expect(text).toContain('Could you tell me about the team plan?');
  });

  it('respects override siteUrl prop for cross-links', async () => {
    const html = await render(
      <ContactAcknowledgementEmail {...sample} siteUrl="https://example.org/es" />,
    );
    expect(html).toContain('https://example.org/es/legal/privacy');
    expect(html).toContain('https://example.org/es/accessibility');
  });

  it('does NOT inject scripts or sanitizer placeholders into the template output', async () => {
    // The template assumes its inputs have already been scrubbed by
    // wrapEmailSender's sanitizer chokepoint (D67 + D148). A naive
    // template might wrap raw HTML; react-email + JSX guarantees
    // text-content escaping for interpolated props.
    const html = await render(
      <ContactAcknowledgementEmail {...sample} message='<script>alert("xss")</script>Hi' />,
    );
    // The literal <script> tag must be HTML-escaped (rendered as text)
    // so a malicious message can't execute when the user views the
    // email in a web client.
    expect(html).not.toMatch(/<script>alert/);
    expect(html).toMatch(/&lt;script&gt;|&#x3C;script/);
  });
});
