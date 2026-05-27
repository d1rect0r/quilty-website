# quilty_tokens

> Quilty design tokens for the Flutter consumer (`quilty/` mobile app).
> **Generated** — do not hand-edit.

## Architecture

Tokens are authored as DTCG 2025.10 JSON at `packages/tokens/tokens/` in the
[`quilty-website` monorepo](https://github.com/quilty/quilty-website). Style
Dictionary v5 generates this Dart package via the custom formatter at
`packages/tokens/src/platforms/flutter-theme-extension.mjs`.

ADR-0020 in the producer repo documents the full architecture (3-tier
namespace, OKLCH → sRGB gamut-mapping policy for the Flutter target, multi-
consumer publish workflow).

## Activation status

This package is producer-only at M1.6 (the trigger watchlist entry
[TW-012](https://github.com/quilty/quilty-website/blob/main/docs/runbook/trigger-watchlist.md)
activates first publish at the M3 visual-identity lock). The Flutter
consumer at `~/AppBuilding/quilty/` will adopt this package at the M3
milestone via:

```yaml
dependencies:
  quilty_tokens: ^0.1.0
```

## Consumer usage (post-activation)

```dart
import 'package:flutter/material.dart';
import 'package:quilty_tokens/quilty_tokens.dart';

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      theme: buildQuiltyThemeData(brightness: Brightness.light),
      darkTheme: buildQuiltyThemeData(brightness: Brightness.dark),
      home: const HomeScreen(),
    );
  }
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<QuiltyColorsExtension>()!;
    final spacing = Theme.of(context).extension<QuiltySpacingExtension>()!;
    return Container(
      color: colors.bgSurface,
      padding: EdgeInsets.all(spacing.pageX),
      child: Text('Hello', style: TextStyle(color: colors.fgDefault)),
    );
  }
}
```
