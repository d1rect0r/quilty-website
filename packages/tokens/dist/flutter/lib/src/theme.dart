// GENERATED FILE — DO NOT EDIT.
// Source: packages/tokens/tokens/**/*.tokens.json
// Producer: packages/tokens/src/platforms/flutter-theme-extension.mjs
// ADR-0020 Decision E (Flutter ThemeExtension target).

import 'package:flutter/material.dart';

import 'colors.dart';
import 'radius.dart';
import 'spacing.dart';

/// Compose a Material 3 [ThemeData] with the full Quilty token surface
/// attached as extensions. Consumers retrieve tokens at the widget layer
/// via `Theme.of(context).extension<QuiltyColorsExtension>()`.
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
