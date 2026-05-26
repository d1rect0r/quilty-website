import { OptimizedImage } from './OptimizedImage';
import type { FeatureGridBlock, IconDescriptor } from '../schemas';
import type { ImagePipeline } from '../ports/image-pipeline';

export interface FeatureGridProps {
  block: FeatureGridBlock;
  instanceId: string;
  /**
   * Optional ImagePipeline. Required only when at least one item's
   * `icon.kind === 'image'`. Lucide-icon items render without it.
   * Kept optional so existing call sites compose without change.
   */
  imagePipeline?: ImagePipeline;
}

function FeatureIcon({
  icon,
  pipeline,
}: {
  icon: IconDescriptor;
  pipeline: ImagePipeline | undefined;
}): React.JSX.Element | null {
  if (icon.kind === 'image') {
    if (!pipeline) return null;
    // IconDescriptorSchema.image requires width + height (positive
    // integers); the schema parse already proved them present, so no
    // fallback is needed here.
    return (
      <OptimizedImage
        pipeline={pipeline}
        src={icon.src}
        alt={icon.alt}
        width={icon.width}
        height={icon.height}
      />
    );
  }
  // Lucide path — the renderer's icon-map lookup lives at the consumer
  // site (apps/web wires the Lucide React component bindings); here we
  // emit the icon name as a data attribute so the consumer renderer
  // can hydrate it. Kept name-only to keep the package free of a
  // lucide-react dependency.
  return <span aria-hidden="true" data-icon-name={icon.name} />;
}

export function FeatureGrid({ block, instanceId, imagePipeline }: FeatureGridProps) {
  // `heading` is required by the schema so a FeatureGrid appearing under a
  // page-level Hero h1 emits a proper h1 → h2 → h3 hierarchy (WCAG 1.3.1).
  const headingId = `${instanceId}-heading`;
  return (
    <section aria-labelledby={headingId} className="mx-auto max-w-6xl px-6 py-16">
      <h2 id={headingId} className="text-fg-default mb-10 text-center text-3xl font-semibold">
        {block.heading}
      </h2>
      <ul className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
        {/* Keys use the (instanceId, position) tuple. The block schema
            does not yet carry stable per-item IDs; the tuple is unique
            on the page and stable across content edits to other fields.
            When the schema gains a stable `id` field, switch to
            `key={item.id}`. */}
        {block.items.map((item, idx) => (
          <li
            key={`${instanceId}-item-${idx}`}
            className="border-border-default rounded-lg border p-6"
          >
            {item.icon ? (
              <div className="mb-3">
                <FeatureIcon icon={item.icon} pipeline={imagePipeline} />
              </div>
            ) : null}
            <h3 className="text-fg-default text-lg font-semibold">{item.heading}</h3>
            <p className="text-fg-muted mt-2 text-sm">{item.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
