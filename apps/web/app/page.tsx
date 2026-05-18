import { redirect } from 'next/navigation';

/**
 * Root `/` is unlocalized — Next.js routes through here only when a request
 * hits the bare apex without a locale segment. We redirect to the default
 * locale segment. The redirect is also declared in `next.config.ts` for
 * static optimization, but this handler covers the dynamic path.
 *
 * Per D14 + S1: every public-facing page lives under `app/[locale]/`.
 * Per the next.config redirect: this redirect is temporary (302/307) until
 * we have locale-detection middleware; once next-intl middleware is wired
 * (D25), this file may go away entirely.
 */
export default function Root(): never {
  redirect('/en');
}
