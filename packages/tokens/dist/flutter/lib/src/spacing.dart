// GENERATED FILE — DO NOT EDIT.
// Source: packages/tokens/tokens/**/*.tokens.json
// Producer: packages/tokens/src/platforms/flutter-theme-extension.mjs
// ADR-0020 Decision E (Flutter ThemeExtension target).

import 'package:flutter/material.dart';

@immutable
class QuiltySpacingExtension extends ThemeExtension<QuiltySpacingExtension> {
  const QuiltySpacingExtension({
    required this.pageX,
    required this.pageXLg,
    required this.sectionY,
    required this.ringWidth,
    required this.ringOffset,
  });

  final double pageX;
  final double pageXLg;
  final double sectionY;
  final double ringWidth;
  final double ringOffset;

  factory QuiltySpacingExtension.defaults() => const QuiltySpacingExtension(
    pageX: 24,
    pageXLg: 32,
    sectionY: 64,
    ringWidth: 2,
    ringOffset: 2,
      );

  @override
  QuiltySpacingExtension copyWith({
    double? pageX,
    double? pageXLg,
    double? sectionY,
    double? ringWidth,
    double? ringOffset,
  }) {
    return QuiltySpacingExtension(
      pageX: pageX ?? this.pageX,
      pageXLg: pageXLg ?? this.pageXLg,
      sectionY: sectionY ?? this.sectionY,
      ringWidth: ringWidth ?? this.ringWidth,
      ringOffset: ringOffset ?? this.ringOffset,
    );
  }

  @override
  QuiltySpacingExtension lerp(ThemeExtension<QuiltySpacingExtension>? other, double t) {
    if (other is! QuiltySpacingExtension) return this;
    return QuiltySpacingExtension(
      pageX: pageX + (other.pageX - pageX) * t,
      pageXLg: pageXLg + (other.pageXLg - pageXLg) * t,
      sectionY: sectionY + (other.sectionY - sectionY) * t,
      ringWidth: ringWidth + (other.ringWidth - ringWidth) * t,
      ringOffset: ringOffset + (other.ringOffset - ringOffset) * t,
    );
  }
}
