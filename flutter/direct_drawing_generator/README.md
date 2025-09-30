# Direct Drawing Generator (Flutter)

Flutter implementation of the "Direct Drawing Generator" experience documented in `k-os-ERI/data/saas/direct-drawing-generator.yaml` and the broader refactoring notes in `Refactoring_and_Feature_Additions.md`. The app reproduces the real-time drawing canvas, reference gallery workflow, and creative tools in a mobile-friendly layout.

## Features

- Real-time freehand canvas with pressure-friendly pan gestures
- Brush, eraser, and text tools with adjustable sizes and shared color palette
- Reference image import (kept as a background layer) with quick removal
- Undo / redo, clear canvas, and export-to-PNG actions
- Save and share workflow using `Share.plus`, with files persisted to documents directory on mobile/desktop
- Responsive layout that mirrors the desktop-style side panel from the YAML design

## Getting Started

```
flutter pub get
flutter run
```

The project targets Flutter 3.22+ (Dart 3.3). Ensure `flutter_colorpicker`, `file_picker`, `path_provider`, `provider`, and `share_plus` are available in your environment.

## Project Structure

```
lib/
  app.dart                     # MaterialApp + theme setup
  main.dart                    # Entry point
  features/
    drawing/
      drawing_controller.dart  # State management for strokes, text, history
      drawing_page.dart        # UI layout & tool interactions
      models/                  # Stroke + text data classes and mode enum
      widgets/
        drawing_canvas.dart    # Custom painter + gesture layer
```

Assets placed in `assets/reference/` are bundled automatically (folder is pre-created with a `.gitkeep`).

## Testing

A smoke test is included under `test/widget_test.dart` to validate that the main scaffold renders. Run with:

```
flutter test
```

## CI / CD

`.github/workflows/flutter-android.yml` で GitHub Actions を定義しており、プッシュ／プルリクエスト時に Flutter の解析・テスト・Android 用 APK ビルドを自動実行します。生成された `app-release.apk` はワークフローのアーティファクトとして取得できます。

## Notes

- Export on web relies on the Web Share API exposed via `share_plus`; browsers without support will surface the underlying platform error.
- The controller disposes of decoded reference images to prevent leaking native textures.
- For production, consider persisting drawing sessions and adding richer history (multi-step clear undo, layer management) following the roadmap in the YAML document.
