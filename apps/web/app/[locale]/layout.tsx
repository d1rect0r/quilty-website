import { notFound } from 'next/navigation';

/**
 * Locale segment layout. Wraps every public + portal page in the locale-
 * specific provider context (next-intl wires here at the i18n milestone). For the English-only launch, EN is the
 * only supported locale — unknown locales trigger notFound() so we never
 * serve content under a fake locale prefix.
 */

const SUPPORTED_LOCALES = ['en'] as const;
type Locale = (typeof SUPPORTED_LOCALES)[number];

function isSupportedLocale(locale: string): locale is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(locale);
}

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((locale) => ({ locale }));
}

interface LocaleLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function LocaleLayout({ children, params }: LocaleLayoutProps) {
  const { locale } = await params;

  if (!isSupportedLocale(locale)) {
    notFound();
  }

  // next-intl provider wraps `children` here at the i18n milestone (D25). Until then the layout
  // is a transparent wrapper that asserts locale validity.
  return <>{children}</>;
}
