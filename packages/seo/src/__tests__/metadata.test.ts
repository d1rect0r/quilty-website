import { describe, expect, it } from 'vitest';
import { buildIconMetadata, buildOpenGraphMetadata } from '../metadata.js';

const BASE_OG_INPUT = {
  ogImage: 'https://my-quilty.com/og.png',
  ogImageAlt: 'Quilty placeholder share card.',
  ogImageType: 'image/png',
  siteName: 'Quilty',
  title: 'Quilty Test',
  description: 'Test description text.',
} as const;

describe('buildOpenGraphMetadata', () => {
  it('emits OG + Twitter card with 1200x630 image dimensions + alt + type', () => {
    const md = buildOpenGraphMetadata(BASE_OG_INPUT);
    expect(md.openGraph?.siteName).toBe('Quilty');
    expect(md.openGraph?.locale).toBe('en_US');
    const ogImages = md.openGraph?.images;
    expect(Array.isArray(ogImages)).toBe(true);
    if (Array.isArray(ogImages)) {
      const first = ogImages[0] as {
        url: string;
        width: number;
        height: number;
        alt: string;
        type: string;
      };
      expect(first.width).toBe(1200);
      expect(first.height).toBe(630);
      expect(first.alt).toBe('Quilty placeholder share card.');
      expect(first.type).toBe('image/png');
    }
    const twitter = md.twitter as Record<string, unknown> | undefined;
    expect(twitter?.['card']).toBe('summary_large_image');
  });

  it('passes alt through to the twitter.images descriptor (WCAG 1.1.1 social-share)', () => {
    const md = buildOpenGraphMetadata(BASE_OG_INPUT);
    const twitter = md.twitter as { images?: readonly { url: string; alt: string }[] };
    expect(twitter.images).toHaveLength(1);
    expect(twitter.images?.[0]?.url).toBe('https://my-quilty.com/og.png');
    expect(twitter.images?.[0]?.alt).toBe('Quilty placeholder share card.');
  });

  it('honors a non-default locale', () => {
    const md = buildOpenGraphMetadata({ ...BASE_OG_INPUT, locale: 'fr_FR' });
    expect(md.openGraph?.locale).toBe('fr_FR');
  });

  it('omits twitter.site when twitterSite is not provided', () => {
    const md = buildOpenGraphMetadata(BASE_OG_INPUT);
    const twitter = md.twitter as Record<string, unknown> | undefined;
    expect(twitter?.['site']).toBeUndefined();
  });

  it('includes twitter.site when twitterSite is provided', () => {
    const md = buildOpenGraphMetadata({ ...BASE_OG_INPUT, twitterSite: 'quilty' });
    const twitter = md.twitter as Record<string, unknown> | undefined;
    expect(twitter?.['site']).toBe('quilty');
  });

  it('mirrors title + description onto both OG and Twitter fragments', () => {
    const md = buildOpenGraphMetadata({
      ...BASE_OG_INPUT,
      title: 'Quilty Title',
      description: 'Quilty description text.',
    });
    expect(md.openGraph?.title).toBe('Quilty Title');
    expect(md.openGraph?.description).toBe('Quilty description text.');
    const twitter = md.twitter as Record<string, unknown> | undefined;
    expect(twitter?.['title']).toBe('Quilty Title');
    expect(twitter?.['description']).toBe('Quilty description text.');
  });

  it('emits openGraph.url when url is provided', () => {
    const md = buildOpenGraphMetadata({ ...BASE_OG_INPUT, url: 'https://my-quilty.com/page' });
    expect(md.openGraph?.url).toBe('https://my-quilty.com/page');
  });

  it('omits openGraph.url when url is not provided', () => {
    const md = buildOpenGraphMetadata(BASE_OG_INPUT);
    expect(md.openGraph?.url).toBeUndefined();
  });
});

describe('buildIconMetadata', () => {
  it('emits each icon as a typed object on the `icon` key', () => {
    const md = buildIconMetadata({
      icons: [
        { url: '/favicon.ico', type: 'image/x-icon', sizes: '16x16 32x32' },
        { url: '/icon.svg', type: 'image/svg+xml', sizes: 'any' },
      ],
    });
    const icons = md.icons as {
      icon: readonly { url: string; type: string; sizes?: string }[];
    };
    expect(icons.icon).toHaveLength(2);
    expect(icons.icon[0]?.url).toBe('/favicon.ico');
    expect(icons.icon[0]?.type).toBe('image/x-icon');
    expect(icons.icon[0]?.sizes).toBe('16x16 32x32');
    expect(icons.icon[1]?.url).toBe('/icon.svg');
    expect(icons.icon[1]?.type).toBe('image/svg+xml');
  });

  it('does not emit legacy `shortcut` rel — modern <link rel="icon"> only', () => {
    const md = buildIconMetadata({
      icons: [{ url: '/favicon.ico', type: 'image/x-icon' }],
    });
    const icons = md.icons as Record<string, unknown>;
    expect(icons['shortcut']).toBeUndefined();
  });

  it('emits apple-touch-icon when appleTouchIcon is supplied', () => {
    const md = buildIconMetadata({
      icons: [{ url: '/icon.svg', type: 'image/svg+xml' }],
      appleTouchIcon: '/apple-touch-icon.png',
    });
    const icons = md.icons as Record<string, unknown>;
    expect(icons['apple']).toBe('/apple-touch-icon.png');
  });

  it('omits apple-touch-icon when not supplied', () => {
    const md = buildIconMetadata({ icons: [{ url: '/icon.svg', type: 'image/svg+xml' }] });
    const icons = md.icons as Record<string, unknown>;
    expect(icons['apple']).toBeUndefined();
  });
});
