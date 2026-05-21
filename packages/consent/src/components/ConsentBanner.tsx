/**
 * Consent banner — renderless skeleton.
 *
 * The full banner UI (consent categories + accept-all + reject-all +
 * preference modal) lands at the consent-banner activation that wires
 * the cookie write path + the `useConsent()` client hook + the
 * shadcn-based banner UI. Until then, this component returns `null` so
 * apps/web can `<ConsentBanner />` in the root layout without a visual
 * surface.
 *
 * The renderless stub is deliberate over an "absent component" because:
 *   - it locks the public-API shape early (consumers don't need a code
 *     change at activation)
 *   - it surfaces the consent surface in the React tree from day one,
 *     so any client-side regression that breaks the layout is caught
 *     immediately rather than at activation
 *   - server-side rendering of `null` has zero hydration cost
 */
export function ConsentBanner(): React.JSX.Element | null {
  return null;
}
