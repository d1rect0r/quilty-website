import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * `cn` — the canonical class-name composer used across the codebase.
 *
 * Combines `clsx` (conditional joining + truthy filter) with `tailwind-merge`
 * (resolves conflicting Tailwind utility classes, e.g., last-one-wins for
 * `px-4 px-6` → `px-6`). This is the shadcn convention; lives in `lib/utils.ts`
 * so every component imports from one place.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
