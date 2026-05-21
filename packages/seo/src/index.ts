/**
 * Public barrel for @quilty/seo.
 *
 * Deep imports into `src/*` are forbidden by
 * `.dependency-cruiser.cjs` rule `cross-package-imports-must-use-barrel`.
 */

export { JsonLd, type JsonLdProps } from './JsonLd.js';

export {
  buildBreadcrumbsJsonLd,
  buildFAQPageJsonLd,
  buildMedicalWebPageJsonLd,
  buildOrganizationJsonLd,
  buildSoftwareApplicationJsonLd,
  buildWebSiteJsonLd,
  type Breadcrumb,
  type FAQPageInput,
  type FaqEntry,
  type MedicalWebPageInput,
} from './schemas.js';

export {
  buildIconMetadata,
  buildOpenGraphMetadata,
  type IconMetadataInput,
  type OpenGraphMetadataInput,
} from './metadata.js';
