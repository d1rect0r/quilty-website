/**
 * Skip-to-main-content link (WCAG 2.4.1 Bypass Blocks).
 *
 * Visually hidden via the `.skip-link:not(:focus)` rule in globals.css until
 * focused — on focus, the rule no longer applies and the link becomes
 * visible. Styling here pins it to a known location + ensures z-index +
 * background so it's actually readable on focus (a11y reviewer
 * flagged the fragility of mixing Tailwind sr-only + the CSS class).
 *
 * Must be the first thing in every layout's tab order.
 */
export function SkipLink() {
  return (
    <a
      href="#main"
      className="skip-link bg-bg-elevated text-fg-default ring-ring absolute left-2 top-2 z-50 rounded-md px-4 py-2 text-sm font-medium shadow ring-2"
    >
      Skip to main content
    </a>
  );
}
