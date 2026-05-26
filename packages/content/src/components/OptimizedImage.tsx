/**
 * OptimizedImage — the only image-render seam in @quilty/content.
 *
 * Wraps `next/image` (the vendor-bound `<Image>`) behind the
 * ImagePipeline port + the alt-required type-layer contract. Block
 * components (Hero, FeatureGrid, TestimonialQuote, etc.) consume this
 * component instead of `<img>` or `<Image>` directly so vendor swap
 * is a one-file change to the adapter wiring.
 *
 * `alt` is REQUIRED at the prop type — TypeScript rejects a render
 * without alt rather than relying on jsx-a11y/alt-text to catch it
 * post-hoc. Decorative images pass `alt=""` (the explicit choice).
 *
 * Two render shapes:
 *   1. Sized — `width` + `height` REQUIRED + positive integers. The
 *      renderer reserves layout space so CLS stays at 0.
 *   2. Fill — `fill={true}` + the parent element MUST have
 *      `position: relative | absolute | fixed` AND a defined size.
 *      Next.js's fill mode is documented at
 *      https://nextjs.org/docs/app/api-reference/components/image#fill —
 *      callers who break the positioned-parent invariant get incorrect
 *      layout (a documented next/image footgun). The discriminated
 *      union enforces the prop-shape boundary at the type layer; the
 *      positioned-parent contract is enforced at the CALLER.
 *
 * Both shapes are discriminated on `fill` so the compiler enforces
 * the right field set at each call site.
 *
 * `preload` is the Next.js 16 canonical prop (replaces the deprecated
 * `priority`); set true on the LCP candidate image only — one per
 * page per the Core Web Vitals guidance.
 */

import NextImage from 'next/image';
import type { ImagePipeline } from '../ports/image-pipeline';

interface BaseOptimizedImageProps {
  readonly src: string;
  readonly alt: string;
  readonly className?: string;
  /** Next.js 16 preload prop. Maps to `<Image preload>`; one image per
   * page should set this (the LCP candidate). */
  readonly preload?: boolean;
  /** Quality 1-100. MUST be in `next.config.ts` images.qualities. */
  readonly quality?: number;
  readonly sizes?: string;
  /** Pipeline-resolver; consumer supplies via composition root or prop drilling. */
  readonly pipeline: ImagePipeline;
}

interface SizedOptimizedImageProps extends BaseOptimizedImageProps {
  readonly fill?: false;
  readonly width: number;
  readonly height: number;
}

interface FillOptimizedImageProps extends BaseOptimizedImageProps {
  readonly fill: true;
  readonly width?: never;
  readonly height?: never;
}

export type OptimizedImageProps = SizedOptimizedImageProps | FillOptimizedImageProps;

export function OptimizedImage(props: OptimizedImageProps): React.JSX.Element {
  const { pipeline, alt, src, className, preload, quality, sizes } = props;

  if (props.fill) {
    const resolved = pipeline.resolve({
      src,
      alt,
      preload: preload ?? false,
      ...(quality !== undefined && { quality }),
      ...(sizes !== undefined && { sizes }),
      ...(className !== undefined && { className }),
    });
    return (
      <NextImage
        src={resolved.src}
        alt={resolved.alt}
        fill
        preload={resolved.preload}
        {...(resolved.quality !== undefined && { quality: resolved.quality })}
        {...(resolved.sizes !== undefined && { sizes: resolved.sizes })}
        {...(resolved.className !== undefined && { className: resolved.className })}
      />
    );
  }

  // Sized variant: type layer requires positive width + height on the
  // call site, but a stray 0/NaN slipping through (e.g., via a dynamic
  // construction that bypasses the type check) would cause next/image
  // to throw at render with a non-actionable message. `NaN <= 0` is
  // false in JS, so the guard checks finiteness explicitly before the
  // positive-integer comparison.
  if (
    !Number.isFinite(props.width) ||
    !Number.isFinite(props.height) ||
    props.width <= 0 ||
    props.height <= 0
  ) {
    throw new Error(
      `OptimizedImage (sized): width + height must be positive finite integers (got ${props.width}, ${props.height}). Use fill={true} for unknown dimensions.`,
    );
  }

  const resolved = pipeline.resolve({
    src,
    alt,
    width: props.width,
    height: props.height,
    preload: preload ?? false,
    ...(quality !== undefined && { quality }),
    ...(sizes !== undefined && { sizes }),
    ...(className !== undefined && { className }),
  });

  // Width + height are number-typed at the source of truth (the
  // invariant guard above proved them positive). The port returns
  // them as `number | undefined` to cover the fill-only call path;
  // we re-source from props.* here to keep the types non-nullable.
  return (
    <NextImage
      src={resolved.src}
      alt={resolved.alt}
      width={props.width}
      height={props.height}
      preload={resolved.preload}
      {...(resolved.quality !== undefined && { quality: resolved.quality })}
      {...(resolved.sizes !== undefined && { sizes: resolved.sizes })}
      {...(resolved.className !== undefined && { className: resolved.className })}
    />
  );
}
