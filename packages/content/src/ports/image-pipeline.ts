/**
 * ImagePipeline port — vendor-agnostic image resolver.
 *
 * Today the only adapter is `makeNextImagePipeline()` wrapping
 * `next/image`'s static-import + remote-pattern surface; an external
 * CDN adapter (Cloudflare Images / imgix / Imgix Solidus) lands at
 * the high-image-volume + LCP-regression trigger documented in the
 * ADR-0017 deferral table.
 *
 * No vendor names appear in this file (ADR-0014 Rule 5). The port is
 * function-shaped — `resolve(input)` returns the consumer-renderable
 * `ResolvedImage` directly; adapters do not expose a "client" handle.
 * This matches the React 19 + Next.js 16 image pattern where the
 * component receives a URL string + dimensions rather than a builder.
 *
 * `alt` is REQUIRED on `ImageInput` at the TYPE layer — compile-time
 * enforcement is stronger than a runtime check, and matches the WCAG
 * 1.1.1 non-text-content contract that EVERY image render lock in.
 */

/**
 * Caller-supplied image descriptor. The pipeline resolves this into
 * concrete URLs + dimensions for the renderer.
 */
export interface ImageInput {
  /** Source URL — absolute, root-relative, or content-relative. */
  readonly src: string;
  /**
   * WCAG 1.1.1 non-text-content: REQUIRED at the type layer so a
   * component built on the pipeline cannot ship without alt. Decorative
   * images pass an empty string (caller's explicit decision).
   */
  readonly alt: string;
  /** Intrinsic width in pixels. Adapters use this for srcset + sizes. */
  readonly width?: number;
  /** Intrinsic height in pixels. */
  readonly height?: number;
  /**
   * Hint to the renderer about above-the-fold placement. Maps to the
   * Next.js 16 `preload` prop on `<Image>`; `priority` is deprecated
   * upstream as of 16.x. Consumers passed `preload: true` for the LCP
   * candidate; the renderer translates to the underlying SDK shape.
   */
  readonly preload?: boolean;
  /**
   * Quality 1-100. Values used here MUST be in the `images.qualities`
   * allowlist in `next.config.ts` — Next.js 16 requires the allowlist
   * and rejects `/_next/image?q=<not-listed>` with HTTP 400. When
   * omitted, the adapter echoes `undefined` and the underlying SDK
   * applies its own internal default; consumers needing an explicit
   * value must pass it.
   */
  readonly quality?: number;
  /**
   * Sizes attribute — same string passed straight through to
   * `<img sizes>`. Adapters do NOT parse this; consumers know their
   * breakpoints.
   */
  readonly sizes?: string;
  /**
   * Caller-supplied class names applied to the rendered <img>. The
   * adapter passes through without parsing.
   */
  readonly className?: string;
}

/**
 * Resolved-image payload — the renderer-facing shape an OptimizedImage
 * component can drop into a JSX element.
 *
 * The adapter is responsible for translating `ImageInput.src` into a
 * fully-qualified URL the browser can load (e.g., next/image's
 * `_next/image?url=...&w=...` proxy URL). Consumers do NOT branch on
 * the URL shape.
 */
export interface ResolvedImage {
  readonly src: string;
  /** Optional explicit srcset for responsive rendering — populated by
   * URL-template adapters (Cloudflare Images, imgix). The next/image
   * adapter leaves this undefined because next/image's runtime
   * generates srcset from `deviceSizes` / `imageSizes` config. */
  readonly srcSet?: string;
  /** Final width in pixels. `undefined` when the input omitted it
   * AND the renderer is the `fill` variant — callers that go through
   * the sized variant MUST supply width + height upstream. */
  readonly width: number | undefined;
  /** Final height in pixels. */
  readonly height: number | undefined;
  /** Low-fidelity inline placeholder (LQIP / blurhash) — populated by
   * the Velite build-time transformer when it ships. */
  readonly placeholder?: string;
  /** Echoed from input — required so the renderer is alt-safe. */
  readonly alt: string;
  /** Echoed from input. */
  readonly preload: boolean;
  /** Echoed from input — applied as next/image's `quality` prop. */
  readonly quality: number | undefined;
  /** Echoed from input. */
  readonly sizes: string | undefined;
  /** Echoed from input. */
  readonly className: string | undefined;
}

/**
 * The single public surface every consumer holds. Consumers (block
 * components, ad-hoc page renders) call `pipeline.resolve(input)` and
 * spread the result onto a renderer.
 *
 * The pipeline is synchronous because every adapter today can resolve
 * without I/O (next/image's getImageProps is sync; the in-memory fake
 * returns its caller-supplied stub). If a future adapter needs async
 * (CDN signed URLs, S3 presigned), this signature changes to Promise
 * — a breaking change appropriate to the boundary shift.
 */
export interface ImagePipeline {
  readonly resolve: (input: ImageInput) => ResolvedImage;
}
