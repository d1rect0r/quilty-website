import { describe, expect, it } from 'vitest';
import { buildIconMetadata, buildOpenGraphMetadata } from '../metadata.js';

describe('buildOpenGraphMetadata', () => {
  it('emits OG + Twitter card with 1200x630 image dimensions', () => {
    const md = buildOpenGraphMetadata({
      ogImage: 'https://my-quilty.com/og.png',
      siteName: 'Quilty',
      title: 'Quilty — Test',
      description: 'Test description text.',
    });
    expect(md.openGraph?.siteName).toBe('Quilty');
    expect(md.openGraph?.locale).toBe('en_US');
    const ogImages = md.openGraph?.images;
    expect(Array.isArray(ogImages)).toBe(true);
    if (Array.isArray(ogImages)) {
      const first = ogImages[0] as { url: string; width: number; height: number };
      expect(first.width).toBe(1200);
      expect(first.height).toBe(630);
    }
    // Cast the discriminated Twitter union to a record for test inspection.
    const twitter = md.twitter as Record<string, unknown> | undefined;
    expect(twitter?.['card']).toBe('summary_large_image');
  });

  it('honors a non-default locale', () => {
    const md = buildOpenGraphMetadata({
      ogImage: 'https://my-quilty.com/og.png',
      siteName: 'Quilty',
      title: 'Quilty — Test',
      description: 'Test description text.',
      locale: 'fr_FR',
    });
    expect(md.openGraph?.locale).toBe('fr_FR');
  });

  it('omits twitter.site when twitterSite is not provided', () => {
    const md = buildOpenGraphMetadata({
      ogImage: 'https://my-quilty.com/og.png',
      siteName: 'Quilty',
      title: 'Quilty — Test',
      description: 'Test description text.',
    });
    const twitter = md.twitter as Record<string, unknown> | undefined;
    expect(twitter?.['site']).toBeUndefined();
  });

  it('includes twitter.site when twitterSite is provided', () => {
    const md = buildOpenGraphMetadata({
      ogImage: 'https://my-quilty.com/og.png',
      siteName: 'Quilty',
      title: 'Quilty — Test',
      description: 'Test description text.',
      twitterSite: 'quilty',
    });
    const twitter = md.twitter as Record<string, unknown> | undefined;
    expect(twitter?.['site']).toBe('quilty');
  });

  it('mirrors title + description onto both OG and Twitter fragments', () => {
    const md = buildOpenGraphMetadata({
      ogImage: 'https://my-quilty.com/og.png',
      siteName: 'Quilty',
      title: 'Quilty Title',
      description: 'Quilty description text.',
    });
    expect(md.openGraph?.title).toBe('Quilty Title');
    expect(md.openGraph?.description).toBe('Quilty description text.');
    const twitter = md.twitter as Record<string, unknown> | undefined;
    expect(twitter?.['title']).toBe('Quilty Title');
    expect(twitter?.['description']).toBe('Quilty description text.');
  });
});

describe('buildIconMetadata', () => {
  it('emits only the icons the caller supplied (no defaults)', () => {
    const md = buildIconMetadata({});
    expect(md.icons).toEqual({});
  });

  it('emits the favicon as icon + shortcut + apple keys when supplied', () => {
    const md = buildIconMetadata({
      favicon: '/favicon.ico',
      shortcutIcon: '/icon.png',
      appleTouchIcon: '/apple-touch-icon-180.png',
    });
    const icons = md.icons as Record<string, unknown>;
    expect(icons['icon']).toBe('/favicon.ico');
    expect(icons['shortcut']).toBe('/icon.png');
    expect(icons['apple']).toBe('/apple-touch-icon-180.png');
  });

  it('emits the mask-icon rel + color when provided', () => {
    const md = buildIconMetadata({
      maskIcon: { url: '/mask-icon.svg', color: '#0a0a0a' },
    });
    const icons = md.icons as { other?: Record<string, string>[] };
    expect(icons.other).toHaveLength(1);
    expect(icons.other?.[0]?.['rel']).toBe('mask-icon');
    expect(icons.other?.[0]?.['url']).toBe('/mask-icon.svg');
    expect(icons.other?.[0]?.['color']).toBe('#0a0a0a');
  });
});
