/**
 * Tests for the Flutter ThemeExtension formatter. We don't have a
 * Dart toolchain in this Node monorepo, so the assertions are
 * regex/string-level — they check the generated Dart code matches
 * the expected ThemeExtension<T> skeleton + correct hex conversions.
 *
 * The contract tests in `byte-identical.test.ts` cover the Tailwind
 * v4 web output. This file covers the Flutter output's vendor-
 * specific concerns: OKLCH → sRGB ARGB32 conversion, alpha-channel
 * preservation, Dart syntax shape, dark + light factory parity.
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import StyleDictionary from 'style-dictionary';
import {
  registerQuiltyFlutterFormat,
  oklchToArgb32,
  dimensionToDouble,
  dartFieldName,
  FORMAT_NAME,
} from '../src/platforms/flutter-theme-extension.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_GLOBS = [
  resolve(__dirname, '../tokens/primitives/**/*.tokens.json'),
  resolve(__dirname, '../tokens/semantic/**/*.tokens.json'),
];

async function buildAll(): Promise<Record<string, string>> {
  registerQuiltyFlutterFormat();
  const sd = new StyleDictionary({
    log: { verbosity: 'silent' },
    source: SOURCE_GLOBS,
    platforms: {
      flutter: {
        transforms: ['name/kebab'],
        buildPath: 'dist/flutter/',
        files: [
          { destination: 'lib/quilty_tokens.dart', format: FORMAT_NAME },
          { destination: 'lib/src/colors.dart', format: FORMAT_NAME },
          { destination: 'lib/src/spacing.dart', format: FORMAT_NAME },
          { destination: 'lib/src/radius.dart', format: FORMAT_NAME },
          { destination: 'lib/src/theme.dart', format: FORMAT_NAME },
        ],
      },
    },
  });
  const out = await sd.formatPlatform('flutter');
  const map: Record<string, string> = {};
  for (const file of out) {
    // Style Dictionary v5 returns `destination` prefixed with the
    // platform's `buildPath` (e.g. `dist/flutter/lib/src/colors.dart`).
    // Strip the prefix so test assertions can key on the bare form
    // that the format function itself sees.
    const dest = file.destination ?? '';
    const bare = dest.replace(/^dist\/flutter\//, '');
    map[bare] = typeof file.output === 'string' ? file.output : '';
  }
  return map;
}

describe('flutter-theme-extension helpers', () => {
  it('oklchToArgb32 converts OKLCH to 0xAARRGGBB with default opaque alpha', () => {
    // oklch(0% 0 0) = pure black; should map to 0xFF000000.
    expect(oklchToArgb32('oklch(0% 0 0)')).toBe('0xFF000000');
  });

  it('oklchToArgb32 preserves alpha channel from `oklch(L C H / a)` syntax', () => {
    // 0.4 alpha → byte 102 → hex 0x66.
    const argb = oklchToArgb32('oklch(20.8% 0.042 265.75 / 0.4)');
    expect(argb).toMatch(/^0x66[0-9A-F]{6}$/);
  });

  it('oklchToArgb32 accepts CSS color keywords + hex literals', () => {
    expect(oklchToArgb32('white')).toBe('0xFFFFFFFF');
    expect(oklchToArgb32('#0d1378')).toBe('0xFF0D1378');
  });

  it('oklchToArgb32 throws a legible error on unparseable input', () => {
    expect(() => oklchToArgb32('not-a-color')).toThrow(/could not parse/);
  });

  it('dimensionToDouble converts rem to Flutter logical pixels (base 16)', () => {
    expect(dimensionToDouble('1.5rem')).toBe('24');
    expect(dimensionToDouble('2rem')).toBe('32');
  });

  it('dimensionToDouble passes px values through verbatim', () => {
    expect(dimensionToDouble('2px')).toBe('2');
  });

  it('dimensionToDouble accepts negative dimensions (inset/offset tokens)', () => {
    expect(dimensionToDouble('-4px')).toBe('-4');
    expect(dimensionToDouble('-0.5rem')).toBe('-8');
  });

  it('dimensionToDouble throws on unknown units', () => {
    expect(() => dimensionToDouble('100em')).toThrow(/cannot normalise dimension/);
  });

  it('dartFieldName camelCases the kebab-segmented tail of a DTCG path', () => {
    expect(dartFieldName(['color', 'bg', 'surface'])).toBe('bgSurface');
    expect(dartFieldName(['color', 'accent', 'primary-hover'])).toBe('accentPrimaryHover');
    expect(dartFieldName(['spacing', 'page-x'])).toBe('pageX');
  });
});

describe('dart/quilty-theme-extension format', () => {
  it('emits a barrel library at lib/quilty_tokens.dart with src exports', async () => {
    const files = await buildAll();
    const barrel = files['lib/quilty_tokens.dart'] ?? '';
    expect(barrel).toContain('library quilty_tokens');
    expect(barrel).toContain("export 'src/colors.dart';");
    expect(barrel).toContain("export 'src/spacing.dart';");
    expect(barrel).toContain("export 'src/radius.dart';");
    expect(barrel).toContain("export 'src/theme.dart';");
  });

  it('emits a QuiltyColorsExtension class with light + dark factory constructors', async () => {
    const files = await buildAll();
    const colors = files['lib/src/colors.dart'] ?? '';
    expect(colors).toContain(
      'class QuiltyColorsExtension extends ThemeExtension<QuiltyColorsExtension>',
    );
    expect(colors).toContain('factory QuiltyColorsExtension.light()');
    expect(colors).toContain('factory QuiltyColorsExtension.dark()');
  });

  it('emits copyWith + lerp methods on the colors extension', async () => {
    const files = await buildAll();
    const colors = files['lib/src/colors.dart'] ?? '';
    expect(colors).toContain('QuiltyColorsExtension copyWith({');
    expect(colors).toContain(
      'QuiltyColorsExtension lerp(ThemeExtension<QuiltyColorsExtension>? other, double t)',
    );
    expect(colors).toContain('Color.lerp(bgSurface, other.bgSurface, t)');
  });

  it('emits the bg-overlay token with the literal 0x66 alpha byte (= 0.4 opacity)', async () => {
    const files = await buildAll();
    const colors = files['lib/src/colors.dart'] ?? '';
    expect(colors).toContain('bgOverlay: const Color(0x660F172B)');
  });

  it('emits the same value for tokens that inherit through light->dark cascade fallback', async () => {
    // accent.primary is NOT overridden in dark.tokens.json — it
    // should appear identical in both light and dark factories.
    const files = await buildAll();
    const colors = files['lib/src/colors.dart'] ?? '';
    // Snippet match: both factories should reference the same OKLCH
    // resolution for accentPrimary.
    const lightMatch = colors.match(
      /factory QuiltyColorsExtension\.light\(\)[\s\S]*?accentPrimary: const Color\((0x[0-9A-F]+)\)/,
    );
    const darkMatch = colors.match(
      /factory QuiltyColorsExtension\.dark\(\)[\s\S]*?accentPrimary: const Color\((0x[0-9A-F]+)\)/,
    );
    expect(lightMatch?.[1]).toBe(darkMatch?.[1]);
  });

  it('emits QuiltySpacingExtension with double fields + ring-width/offset', async () => {
    const files = await buildAll();
    const spacing = files['lib/src/spacing.dart'] ?? '';
    expect(spacing).toContain(
      'class QuiltySpacingExtension extends ThemeExtension<QuiltySpacingExtension>',
    );
    expect(spacing).toContain('final double pageX;');
    expect(spacing).toContain('final double sectionY;');
    expect(spacing).toContain('final double ringWidth;');
    expect(spacing).toContain('ringWidth: 2,');
  });

  it('emits QuiltyRadiusExtension with 4 size variants', async () => {
    const files = await buildAll();
    const radius = files['lib/src/radius.dart'] ?? '';
    expect(radius).toContain(
      'class QuiltyRadiusExtension extends ThemeExtension<QuiltyRadiusExtension>',
    );
    for (const variant of ['sm', 'md', 'lg', 'xl']) {
      expect(radius).toContain(`final double ${variant};`);
    }
  });

  it('emits a buildQuiltyThemeData composer in theme.dart', async () => {
    const files = await buildAll();
    const theme = files['lib/src/theme.dart'] ?? '';
    expect(theme).toContain('ThemeData buildQuiltyThemeData({required Brightness brightness})');
    expect(theme).toContain('QuiltyColorsExtension.dark()');
    expect(theme).toContain('QuiltyColorsExtension.light()');
    expect(theme).toContain('QuiltySpacingExtension.defaults()');
    expect(theme).toContain('QuiltyRadiusExtension.defaults()');
  });
});
