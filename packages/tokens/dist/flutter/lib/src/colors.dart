// GENERATED FILE — DO NOT EDIT.
// Source: packages/tokens/tokens/**/*.tokens.json
// Producer: packages/tokens/src/platforms/flutter-theme-extension.mjs
// ADR-0020 Decision E (Flutter ThemeExtension target).

import 'package:flutter/material.dart';

@immutable
class QuiltyColorsExtension extends ThemeExtension<QuiltyColorsExtension> {
  const QuiltyColorsExtension({
    required this.bgSurface,
    required this.bgElevated,
    required this.bgOverlay,
    required this.fgDefault,
    required this.fgMuted,
    required this.fgSubtle,
    required this.fgInverse,
    required this.borderDefault,
    required this.borderStrong,
    required this.borderFocus,
    required this.accentPrimary,
    required this.accentPrimaryHover,
    required this.accentFg,
    required this.dangerFg,
    required this.successFg,
    required this.warningFg,
    required this.ring,
  });

  final Color bgSurface;
  final Color bgElevated;
  final Color bgOverlay;
  final Color fgDefault;
  final Color fgMuted;
  final Color fgSubtle;
  final Color fgInverse;
  final Color borderDefault;
  final Color borderStrong;
  final Color borderFocus;
  final Color accentPrimary;
  final Color accentPrimaryHover;
  final Color accentFg;
  final Color dangerFg;
  final Color successFg;
  final Color warningFg;
  final Color ring;

  factory QuiltyColorsExtension.light() => QuiltyColorsExtension(
    bgSurface: const Color(0xFFF8FAFC),
    bgElevated: const Color(0xFFFFFFFF),
    bgOverlay: const Color(0x660F172B),
    fgDefault: const Color(0xFF0F172B),
    fgMuted: const Color(0xFF45556C),
    fgSubtle: const Color(0xFF62748E),
    fgInverse: const Color(0xFFF8FAFC),
    borderDefault: const Color(0xFFE2E8F0),
    borderStrong: const Color(0xFFCAD5E2),
    borderFocus: const Color(0xFF3375E3),
    accentPrimary: const Color(0xFF1343C7),
    accentPrimaryHover: const Color(0xFF0D1376),
    accentFg: const Color(0xFFF8FAFC),
    dangerFg: const Color(0xFFB70002),
    successFg: const Color(0xFF006400),
    warningFg: const Color(0xFFA25100),
    ring: const Color(0xFF1343C7),
      );

  factory QuiltyColorsExtension.dark() => QuiltyColorsExtension(
    bgSurface: const Color(0xFF020618),
    bgElevated: const Color(0xFF0F172B),
    bgOverlay: const Color(0x660F172B),
    fgDefault: const Color(0xFFF8FAFC),
    fgMuted: const Color(0xFFCAD5E2),
    fgSubtle: const Color(0xFF90A1B9),
    fgInverse: const Color(0xFF0F172B),
    borderDefault: const Color(0xFF1D293D),
    borderStrong: const Color(0xFF314158),
    borderFocus: const Color(0xFF3375E3),
    accentPrimary: const Color(0xFF1343C7),
    accentPrimaryHover: const Color(0xFF0D1376),
    accentFg: const Color(0xFFF8FAFC),
    dangerFg: const Color(0xFFE23532),
    successFg: const Color(0xFF299236),
    warningFg: const Color(0xFFDE8900),
    ring: const Color(0xFFEFF6FF),
      );

  @override
  QuiltyColorsExtension copyWith({
    Color? bgSurface,
    Color? bgElevated,
    Color? bgOverlay,
    Color? fgDefault,
    Color? fgMuted,
    Color? fgSubtle,
    Color? fgInverse,
    Color? borderDefault,
    Color? borderStrong,
    Color? borderFocus,
    Color? accentPrimary,
    Color? accentPrimaryHover,
    Color? accentFg,
    Color? dangerFg,
    Color? successFg,
    Color? warningFg,
    Color? ring,
  }) {
    return QuiltyColorsExtension(
      bgSurface: bgSurface ?? this.bgSurface,
      bgElevated: bgElevated ?? this.bgElevated,
      bgOverlay: bgOverlay ?? this.bgOverlay,
      fgDefault: fgDefault ?? this.fgDefault,
      fgMuted: fgMuted ?? this.fgMuted,
      fgSubtle: fgSubtle ?? this.fgSubtle,
      fgInverse: fgInverse ?? this.fgInverse,
      borderDefault: borderDefault ?? this.borderDefault,
      borderStrong: borderStrong ?? this.borderStrong,
      borderFocus: borderFocus ?? this.borderFocus,
      accentPrimary: accentPrimary ?? this.accentPrimary,
      accentPrimaryHover: accentPrimaryHover ?? this.accentPrimaryHover,
      accentFg: accentFg ?? this.accentFg,
      dangerFg: dangerFg ?? this.dangerFg,
      successFg: successFg ?? this.successFg,
      warningFg: warningFg ?? this.warningFg,
      ring: ring ?? this.ring,
    );
  }

  @override
  QuiltyColorsExtension lerp(ThemeExtension<QuiltyColorsExtension>? other, double t) {
    if (other is! QuiltyColorsExtension) return this;
    return QuiltyColorsExtension(
      bgSurface: Color.lerp(bgSurface, other.bgSurface, t) ?? bgSurface,
      bgElevated: Color.lerp(bgElevated, other.bgElevated, t) ?? bgElevated,
      bgOverlay: Color.lerp(bgOverlay, other.bgOverlay, t) ?? bgOverlay,
      fgDefault: Color.lerp(fgDefault, other.fgDefault, t) ?? fgDefault,
      fgMuted: Color.lerp(fgMuted, other.fgMuted, t) ?? fgMuted,
      fgSubtle: Color.lerp(fgSubtle, other.fgSubtle, t) ?? fgSubtle,
      fgInverse: Color.lerp(fgInverse, other.fgInverse, t) ?? fgInverse,
      borderDefault: Color.lerp(borderDefault, other.borderDefault, t) ?? borderDefault,
      borderStrong: Color.lerp(borderStrong, other.borderStrong, t) ?? borderStrong,
      borderFocus: Color.lerp(borderFocus, other.borderFocus, t) ?? borderFocus,
      accentPrimary: Color.lerp(accentPrimary, other.accentPrimary, t) ?? accentPrimary,
      accentPrimaryHover: Color.lerp(accentPrimaryHover, other.accentPrimaryHover, t) ?? accentPrimaryHover,
      accentFg: Color.lerp(accentFg, other.accentFg, t) ?? accentFg,
      dangerFg: Color.lerp(dangerFg, other.dangerFg, t) ?? dangerFg,
      successFg: Color.lerp(successFg, other.successFg, t) ?? successFg,
      warningFg: Color.lerp(warningFg, other.warningFg, t) ?? warningFg,
      ring: Color.lerp(ring, other.ring, t) ?? ring,
    );
  }
}
