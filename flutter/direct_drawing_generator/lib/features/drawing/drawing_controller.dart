import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import 'models/drawn_stroke.dart';
import 'models/drawn_text.dart';
import 'models/drawing_mode.dart';

class DrawingController extends ChangeNotifier {
  DrawingController();

  final List<DrawnStroke> _strokes = <DrawnStroke>[];
  final List<DrawnText> _texts = <DrawnText>[];
  final List<_CanvasAction> _history = <_CanvasAction>[];
  final List<_CanvasAction> _redoHistory = <_CanvasAction>[];

  DrawnStroke? _activeStroke;
  DrawingMode _mode = DrawingMode.pen;
  Color _penColor = const Color(0xffff4d5a);
  double _penSize = 6;
  double _eraserSize = 42;
  double _textSize = 28;
  ui.Image? _referenceImage;
  Uint8List? _referenceImageBytes;

  DrawingMode get mode => _mode;
  Color get penColor => _penColor;
  double get penSize => _penSize;
  double get eraserSize => _eraserSize;
  double get textSize => _textSize;
  ui.Image? get referenceImage => _referenceImage;
  Uint8List? get referenceImageBytes => _referenceImageBytes;
  List<DrawnStroke> get strokes => List<DrawnStroke>.unmodifiable(_strokes);
  List<DrawnText> get texts => List<DrawnText>.unmodifiable(_texts);
  bool get hasReferenceImage => _referenceImage != null;
  bool get hasUndo => _history.isNotEmpty;
  bool get hasRedo => _redoHistory.isNotEmpty;

  bool get isPenActive => _mode == DrawingMode.pen;
  bool get isEraserActive => _mode == DrawingMode.eraser;
  bool get isTextActive => _mode == DrawingMode.text;

  void setMode(DrawingMode mode) {
    if (_mode == mode) {
      _mode = DrawingMode.idle;
    } else {
      _mode = mode;
    }
    notifyListeners();
  }

  void setPenColor(Color color) {
    _penColor = color;
    notifyListeners();
  }

  void setPenSize(double size) {
    _penSize = size.clamp(1, 120);
    notifyListeners();
  }

  void setEraserSize(double size) {
    _eraserSize = size.clamp(8, 240);
    notifyListeners();
  }

  void setTextSize(double size) {
    _textSize = size.clamp(8, 200);
    notifyListeners();
  }

  void startStroke(Offset position) {
    if (!isPenActive && !isEraserActive) {
      return;
    }
    _redoHistory.clear();
    final DrawnStroke stroke = DrawnStroke(
      points: <Offset>[position],
      color: isEraserActive ? Colors.transparent : _penColor,
      strokeWidth: isEraserActive ? _eraserSize : _penSize,
      blendMode: isEraserActive ? BlendMode.clear : BlendMode.srcOver,
    );
    _strokes.add(stroke);
    _activeStroke = stroke;
    notifyListeners();
  }

  void appendPoint(Offset position) {
    if (_activeStroke == null) {
      return;
    }
    _activeStroke!.points.add(position);
    notifyListeners();
  }

  void endStroke() {
    if (_activeStroke == null) {
      return;
    }
    if (!_activeStroke!.isDrawable) {
      _strokes.remove(_activeStroke);
    } else {
      _history.add(_CanvasAction.stroke(_activeStroke!));
    }
    _activeStroke = null;
    notifyListeners();
  }

  void placeText({required String text, required Offset at}) {
    final String trimmed = text.trim();
    if (trimmed.isEmpty) {
      return;
    }
    final DrawnText entry = DrawnText(
      text: trimmed,
      position: at,
      color: _penColor,
      fontSize: _textSize,
    );
    _texts.add(entry);
    _redoHistory.clear();
    _history.add(_CanvasAction.text(entry));
    notifyListeners();
  }

  void undo() {
    if (_history.isEmpty) {
      return;
    }
    final _CanvasAction action = _history.removeLast();
    if (action.stroke != null) {
      _strokes.remove(action.stroke);
    } else if (action.text != null) {
      _texts.remove(action.text);
    }
    _redoHistory.add(action);
    notifyListeners();
  }

  void redo() {
    if (_redoHistory.isEmpty) {
      return;
    }
    final _CanvasAction action = _redoHistory.removeLast();
    if (action.stroke != null) {
      _strokes.add(action.stroke!);
    } else if (action.text != null) {
      _texts.add(action.text!);
    }
    _history.add(action);
    notifyListeners();
  }

  void clear() {
    _strokes.clear();
    _texts.clear();
    _history.clear();
    _redoHistory.clear();
    _activeStroke = null;
    notifyListeners();
  }

  Future<void> loadReferenceImage(Uint8List bytes) async {
    final ui.Codec codec = await ui.instantiateImageCodec(bytes);
    final ui.FrameInfo frameInfo = await codec.getNextFrame();
    _referenceImage = frameInfo.image;
    _referenceImageBytes = bytes;
    notifyListeners();
  }

  void removeReferenceImage() {
    _referenceImage?.dispose();
    _referenceImage = null;
    _referenceImageBytes = null;
    notifyListeners();
  }
}

class _CanvasAction {
  const _CanvasAction.stroke(this.stroke) : text = null;

  const _CanvasAction.text(this.text) : stroke = null;

  final DrawnStroke? stroke;
  final DrawnText? text;
}
