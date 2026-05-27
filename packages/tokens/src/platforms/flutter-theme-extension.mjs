import StyleDictionary from 'style-dictionary';
import { converter, formatHex } from 'culori';

/**
 * Custom Style Dictionary format `dart/quilty-theme-extension` —
 * emits `ThemeExtension<T>` subclasses (one per token category) for
 * the Flutter consumer package.
 *
 * ADR-0020 Decision E motivates this over the built-in
 * `flutter/class.dart` formatter:
 *   - Built-in emits `static const Color foo = Color(0xAARRGGBB);`
 *     which can't participate in `Theme.copyWith` or `Theme.lerp`.
 *   - `ThemeExtension<T>` IS the canonical Flutter 3.7+ pattern for
 *     design-system tokens: per-component copyWith, lerp for theme
 *     transitions, `Theme.of(context).extension<T>()` access.
 *
 * Gamut-mapping policy (ADR-0020 Decision E continued):
 *   Primitives are authored as OKLCH (perceptually uniform); Flutter
 *   `Color(0xAARRGGBB)` requires sRGB hex. The `converter('rgb')` call
 *   applies CSS Color 4's `to sRGB` chroma-reduction implicitly via
 *   culori — channels that overflow sRGB get gamut-clamped with hue
 *   preserved (NOT naive clip, which produces hue shifts). When the
 *   web target ships the same primitive in native OKLCH, the web +
 *   Flutter outputs are intentionally different gamuts of the same
 *   perceptually-correct color.
 *
 * Reference resolution: semantic tokens reference primitives via
 * DTCG `{path}` syntax. Style Dictionary resolves these during the
 * platform-tokens phase (we use the default `transformGroup` `js`
 * which includes `color/hex`-style resolution), so by the time this
 * formatter runs every token's `.$value` is a final string. We
 * convert via culori at emit time to handle the OKLCH → sRGB
 * conversion uniformly (`color/hex` doesn't handle OKLCH).
 */

const toSrgb = converter('rgb');

const PUBLIC_HEADER = `// GENERATED FILE — DO NOT EDIT.
// Source: packages/tokens/tokens/**/*.tokens.json
// Producer: packages/tokens/src/platforms/flutter-theme-extension.mjs
// ADR-0020 Decision E (Flutter ThemeExtension target).
`;

const FORMAT_NAME = 'dart/quilty-theme-extension';

function oklchToArgb32(value) {
  // culori parses OKLCH / hex / named colors uniformly. The output
  // `toSrgb(...)` produces clamped {r,g,b,[alpha]} in [0,1]; if the
  // OKLCH value's chroma exceeds the sRGB gamut, culori applies the
  // CSS Color 4 chroma-reduction strategy under the hood.
  //
  // Alpha handling: Flutter Color uses 0xAARRGGBB (alpha-first 32-bit
  // integer). DTCG values like `oklch(L C H / 0.4)` carry an alpha
  // channel through culori (`rgb.alpha`); we preserve it. Values
  // without an explicit alpha component default to 0xFF (opaque).
  const rgb = toSrgb(value);
  if (!rgb) {
    throw new Error(`flutter-theme-extension: culori could not parse "${value}"`);
  }
  const alphaChannel = rgb.alpha;
  const alphaByte =
    typeof alphaChannel === 'number'
      ? Math.round(Math.max(0, Math.min(1, alphaChannel)) * 255)
      : 0xff;
  const hex = formatHex(rgb); // "#RRGGBB"
  const alphaHex = alphaByte.toString(16).padStart(2, '0').toUpperCase();
  return `0x${alphaHex}${hex.slice(1).toUpperCase()}`;
}

function dimensionToDouble(value) {
  // DTCG dimension tokens are strings like "1.5rem" / "2px" /
  // "-4px" (negative values may appear in inset/offset tokens).
  // Flutter ThemeExtension fields are typed `double` (logical
  // pixels). We normalise rem → 16px (Flutter's default screen-
  // density assumption) and strip the unit. The base-16 conversion
  // matches Material 3's ScreenScaler; consumers can multiply by
  // `MediaQuery.devicePixelRatio` at the widget layer if device-tier
  // scaling is needed.
  const m = String(value).match(/^(-?[0-9.]+)(rem|px)$/);
  if (!m) {
    throw new Error(`flutter-theme-extension: cannot normalise dimension "${value}"`);
  }
  const n = parseFloat(m[1]);
  return m[2] === 'rem' ? `${n * 16}` : `${n}`;
}

function buildFactoryAssigns(tokenList) {
  return tokenList
    .map(({ name, token }) => `    ${name}: const Color(${oklchToArgb32(token.$value)}),`)
    .join('\n');
}

function emitColorExtension({ className, lightTokens, darkTokens }) {
  // Light + dark factories are emitted in a SINGLE pass so the class
  // shape (field order, copyWith / lerp method bodies) is generated
  // once and consistent across both modes. Earlier iterations spliced
  // the dark factory in via a regex against the emitted light body,
  // which is fragile if any token value string contains a literal
  // `);` sequence — that approach is deliberately removed.
  const fields = lightTokens.map(({ name }) => `  final Color ${name};`).join('\n');
  const ctorArgs = lightTokens.map(({ name }) => `    required this.${name},`).join('\n');
  const copyWithArgs = lightTokens.map(({ name }) => `    Color? ${name},`).join('\n');
  const copyWithAssigns = lightTokens
    .map(({ name }) => `      ${name}: ${name} ?? this.${name},`)
    .join('\n');
  const lerpAssigns = lightTokens
    .map(({ name }) => `      ${name}: Color.lerp(${name}, other.${name}, t) ?? ${name},`)
    .join('\n');
  const lightFactoryAssigns = buildFactoryAssigns(lightTokens);
  const darkFactoryAssigns = darkTokens ? buildFactoryAssigns(darkTokens) : null;

  const darkFactory = darkFactoryAssigns
    ? `

  factory ${className}.dark() => ${className}(
${darkFactoryAssigns}
      );`
    : '';

  return `${PUBLIC_HEADER}
import 'package:flutter/material.dart';

@immutable
class ${className} extends ThemeExtension<${className}> {
  const ${className}({
${ctorArgs}
  });

${fields}

  factory ${className}.light() => ${className}(
${lightFactoryAssigns}
      );${darkFactory}

  @override
  ${className} copyWith({
${copyWithArgs}
  }) {
    return ${className}(
${copyWithAssigns}
    );
  }

  @override
  ${className} lerp(ThemeExtension<${className}>? other, double t) {
    if (other is! ${className}) return this;
    return ${className}(
${lerpAssigns}
    );
  }
}
`;
}

function emitScalarExtension(tokenList, className, dartType, valueConverter) {
  const fields = tokenList.map(({ name }) => `  final ${dartType} ${name};`).join('\n');
  const ctorArgs = tokenList.map(({ name }) => `    required this.${name},`).join('\n');
  const copyWithArgs = tokenList.map(({ name }) => `    ${dartType}? ${name},`).join('\n');
  const copyWithAssigns = tokenList
    .map(({ name }) => `      ${name}: ${name} ?? this.${name},`)
    .join('\n');
  const lerpAssigns = tokenList
    .map(({ name }) => `      ${name}: ${name} + (other.${name} - ${name}) * t,`)
    .join('\n');
  const factoryAssigns = tokenList
    .map(({ name, token }) => `    ${name}: ${valueConverter(token.$value)},`)
    .join('\n');

  return `${PUBLIC_HEADER}
import 'package:flutter/material.dart';

@immutable
class ${className} extends ThemeExtension<${className}> {
  const ${className}({
${ctorArgs}
  });

${fields}

  factory ${className}.defaults() => const ${className}(
${factoryAssigns}
      );

  @override
  ${className} copyWith({
${copyWithArgs}
  }) {
    return ${className}(
${copyWithAssigns}
    );
  }

  @override
  ${className} lerp(ThemeExtension<${className}>? other, double t) {
    if (other is! ${className}) return this;
    return ${className}(
${lerpAssigns}
    );
  }
}
`;
}

function dartFieldName(path) {
  // path is e.g. ['color','bg','surface'] → 'bgSurface' (Dart camelCase).
  // We strip the leading 'color' / 'spacing' / 'radius' segment since
  // those are encoded in the class name; the remaining path segments
  // join as camelCase identifiers (kebab segments handled).
  const tail = path.slice(1);
  if (tail.length === 0) {
    throw new Error(`dartFieldName: path too short ${path.join('.')}`);
  }
  const joined = tail.join('-');
  return joined
    .split('-')
    .map((seg, i) => (i === 0 ? seg : seg[0].toUpperCase() + seg.slice(1)))
    .join('');
}

function tokenByPath(dictionary) {
  const m = new Map();
  for (const t of dictionary.allTokens) {
    m.set(t.path.join('.'), t);
  }
  return m;
}

function collectColorSemantic(byPath, isDark) {
  // The semantic light-set tokens live under `color.{bg,fg,border,accent,danger-fg,success-fg,warning-fg,ring}`.
  // The dark-set tokens live under `dark.color.{...}`.
  const prefix = isDark ? ['dark', 'color'] : ['color'];
  const out = [];
  const SEMANTIC_PATHS = [
    ['bg', 'surface'],
    ['bg', 'elevated'],
    ['bg', 'overlay'],
    ['fg', 'default'],
    ['fg', 'muted'],
    ['fg', 'subtle'],
    ['fg', 'inverse'],
    ['border', 'default'],
    ['border', 'strong'],
    ['border', 'focus'],
    ['accent', 'primary'],
    ['accent', 'primary-hover'],
    ['accent', 'fg'],
    ['danger-fg'],
    ['success-fg'],
    ['warning-fg'],
    ['ring'],
  ];
  for (const semPath of SEMANTIC_PATHS) {
    const fullPath = [...prefix, ...semPath].join('.');
    const token = byPath.get(fullPath);
    if (!token) {
      // Dark mode only carries overrides for a SUBSET of light-mode
      // semantic paths (the others inherit identical values from
      // light). For the Flutter target we always need a complete
      // set, so fall back to the light value for any dark token not
      // explicitly overridden in dark.tokens.json.
      if (isDark) {
        const lightFallback = byPath.get(['color', ...semPath].join('.'));
        if (!lightFallback) {
          throw new Error(`flutter formatter: missing dark + light token at ${semPath.join('.')}`);
        }
        out.push({
          name: dartFieldName(['color', ...semPath]),
          token: lightFallback,
        });
        continue;
      }
      throw new Error(`flutter formatter: missing semantic token at ${fullPath}`);
    }
    out.push({
      name: dartFieldName(['color', ...semPath]),
      token,
    });
  }
  return out;
}

function collectDimensionByPrefix(byPath, prefix, includes) {
  const out = [];
  for (const item of includes) {
    const fullPath = [prefix, item].join('.');
    const token = byPath.get(fullPath);
    if (!token) {
      throw new Error(`flutter formatter: missing dimension token at ${fullPath}`);
    }
    out.push({ name: dartFieldName([prefix, item]), token });
  }
  return out;
}

export function registerQuiltyFlutterFormat() {
  if (FORMAT_NAME in (StyleDictionary.hooks?.formats ?? {})) {
    return;
  }
  StyleDictionary.registerFormat({
    name: FORMAT_NAME,
    format: ({ dictionary, file }) => {
      const byPath = tokenByPath(dictionary);
      const target = file.destination;
      if (target === 'lib/src/colors.dart') {
        return emitColorExtension({
          className: 'QuiltyColorsExtension',
          lightTokens: collectColorSemantic(byPath, false),
          darkTokens: collectColorSemantic(byPath, true),
        });
      }
      if (target === 'lib/src/spacing.dart') {
        const items = collectDimensionByPrefix(byPath, 'spacing', [
          'page-x',
          'page-x-lg',
          'section-y',
          'ring-width',
          'ring-offset',
        ]);
        return emitScalarExtension(items, 'QuiltySpacingExtension', 'double', dimensionToDouble);
      }
      if (target === 'lib/src/radius.dart') {
        const items = collectDimensionByPrefix(byPath, 'radius', ['sm', 'md', 'lg', 'xl']);
        return emitScalarExtension(items, 'QuiltyRadiusExtension', 'double', dimensionToDouble);
      }
      if (target === 'lib/quilty_tokens.dart') {
        return `${PUBLIC_HEADER}
library quilty_tokens;

export 'src/colors.dart';
export 'src/spacing.dart';
export 'src/radius.dart';
export 'src/theme.dart';
`;
      }
      if (target === 'lib/src/theme.dart') {
        return `${PUBLIC_HEADER}
import 'package:flutter/material.dart';

import 'colors.dart';
import 'radius.dart';
import 'spacing.dart';

/// Compose a Material 3 [ThemeData] with the full Quilty token surface
/// attached as extensions. Consumers retrieve tokens at the widget layer
/// via \`Theme.of(context).extension<QuiltyColorsExtension>()\`.
ThemeData buildQuiltyThemeData({required Brightness brightness}) {
  final colors = brightness == Brightness.dark
      ? QuiltyColorsExtension.dark()
      : QuiltyColorsExtension.light();
  return ThemeData(
    brightness: brightness,
    useMaterial3: true,
    extensions: <ThemeExtension<dynamic>>[
      colors,
      QuiltySpacingExtension.defaults(),
      QuiltyRadiusExtension.defaults(),
    ],
  );
}
`;
      }
      throw new Error(`flutter formatter: unknown destination ${target}`);
    },
  });
}

export {
  FORMAT_NAME,
  oklchToArgb32,
  dimensionToDouble,
  dartFieldName,
  emitColorExtension,
  emitScalarExtension,
};
