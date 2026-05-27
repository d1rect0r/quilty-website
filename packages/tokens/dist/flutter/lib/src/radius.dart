// GENERATED FILE — DO NOT EDIT.
// Source: packages/tokens/tokens/**/*.tokens.json
// Producer: packages/tokens/src/platforms/flutter-theme-extension.mjs
// ADR-0020 Decision E (Flutter ThemeExtension target).

import 'package:flutter/material.dart';

@immutable
class QuiltyRadiusExtension extends ThemeExtension<QuiltyRadiusExtension> {
  const QuiltyRadiusExtension({
    required this.sm,
    required this.md,
    required this.lg,
    required this.xl,
  });

  final double sm;
  final double md;
  final double lg;
  final double xl;

  factory QuiltyRadiusExtension.defaults() => const QuiltyRadiusExtension(
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
      );

  @override
  QuiltyRadiusExtension copyWith({
    double? sm,
    double? md,
    double? lg,
    double? xl,
  }) {
    return QuiltyRadiusExtension(
      sm: sm ?? this.sm,
      md: md ?? this.md,
      lg: lg ?? this.lg,
      xl: xl ?? this.xl,
    );
  }

  @override
  QuiltyRadiusExtension lerp(ThemeExtension<QuiltyRadiusExtension>? other, double t) {
    if (other is! QuiltyRadiusExtension) return this;
    return QuiltyRadiusExtension(
      sm: sm + (other.sm - sm) * t,
      md: md + (other.md - md) * t,
      lg: lg + (other.lg - lg) * t,
      xl: xl + (other.xl - xl) * t,
    );
  }
}
