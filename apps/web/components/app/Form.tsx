'use client';

/**
 * Form-wrapper primitives — D18 wrap-don't-edit posture, built
 * directly on Radix UI primitives (`@radix-ui/react-label`,
 * `@radix-ui/react-slot`) rather than shipping a shadcn `ui/` layer
 * in this commit.
 *
 * Architectural choice: the apps/web/components/ui/ directory is
 * reserved for `pnpm dlx shadcn add` outputs (canonical scaffolds
 * the project does NOT edit, per the guard-write hook). Building
 * the form-composition wrappers directly on Radix here keeps the
 * D117 forms-canonical promise (RHF + Zod + Radix primitives)
 * while deferring the full shadcn CLI workflow to a focused
 * boundary commit. When that workflow runs, these wrappers become
 * thin re-exports over the shadcn primitives without breaking
 * consumer call sites.
 *
 * Consumed by `/contact`'s ContactForm + future forms
 * (subprocessors-subscribe, waitlist, contact-sales).
 */

import * as LabelPrimitive from '@radix-ui/react-label';
import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Label — Radix root with the project's semantic text token.
 */
const Label = React.forwardRef<
  React.ComponentRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(
      'text-fg-default mb-1 block text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
      className,
    )}
    {...props}
  />
));
Label.displayName = 'AppLabel';

/**
 * Input — native input + project semantic tokens + 44×44 target-size
 * floor (WCAG 2.5.5).
 */
const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        'border-border-default focus-visible:border-border-strong focus-visible:ring-ring bg-bg-elevated text-fg-default block min-h-[44px] w-full rounded border px-3 py-2 outline-none focus-visible:ring-2',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'AppInput';

/**
 * Textarea — same token stack as Input + opinionated minimum height.
 */
const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'border-border-default focus-visible:border-border-strong focus-visible:ring-ring bg-bg-elevated text-fg-default block min-h-[120px] w-full rounded border px-3 py-2 outline-none focus-visible:ring-2',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'AppTextarea';

/**
 * FieldErrorRegion — persistent live region per field. Polite over
 * assertive (mid-correction typing isn't interrupted). Keyed inner
 * span forces AT re-announcement on populated→empty→populated
 * transitions per JAWS / NVDA 2024 ring buffers. WCAG 4.1.3.
 *
 * Consumers always render the region; pass `null` / `undefined` as
 * `message` when no error is active. The region reserves vertical
 * space (`min-h-[1.25rem]`) to avoid CLS as errors toggle.
 */
function FieldErrorRegion({
  id,
  message,
  fieldKey,
}: {
  readonly id: string;
  readonly message: string | undefined;
  readonly fieldKey: string;
}): React.JSX.Element {
  // `<output>` carries an implicit `role="status"` + the explicit
  // aria-live="polite" attribute. Using the semantic element instead
  // of `<p role="status">` satisfies jsx-a11y/prefer-tag-over-role.
  return (
    <output
      id={id}
      aria-live="polite"
      className="text-danger-fg mt-1 block min-h-[1.25rem] text-sm font-medium"
    >
      {message ? <span key={`${fieldKey}-err-${message}`}>{message}</span> : null}
    </output>
  );
}

export { FieldErrorRegion, Input, Label, Textarea };
