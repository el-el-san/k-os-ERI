import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:http/http.dart' as http;

import 'models/drawn_stroke.dart';
import 'models/drawn_text.dart';
import 'models/drawing_mode.dart';
import 'models/generation_result.dart';
import 'models/generation_state.dart';
import 'models/mcp_config.dart';
import 'services/image_upload_service.dart';
import 'services/mcp_client.dart';

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

  // AI画像生成関連
  GenerationState _generationState = GenerationState.idle;
  String? _generationError;
  final List<GenerationResult> _generationResults = <GenerationResult>[];
  final ImageUploadService _uploadService = ImageUploadService();
  McpConfig? _mcpConfig;

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

  // AI画像生成のゲッター
  GenerationState get generationState => _generationState;
  String? get generationError => _generationError;
  List<GenerationResult> get generationResults => List<GenerationResult>.unmodifiable(_generationResults);
  McpConfig? get mcpConfig => _mcpConfig;

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
    try {
      // 古い画像を破棄
      _referenceImage?.dispose();

      final ui.Codec codec = await ui.instantiateImageCodec(bytes);
      final ui.FrameInfo frameInfo = await codec.getNextFrame();
      _referenceImage = frameInfo.image;
      _referenceImageBytes = bytes;

      debugPrint('リファレンス画像を読み込みました: ${_referenceImage?.width} x ${_referenceImage?.height}');
      notifyListeners();
    } catch (e) {
      debugPrint('リファレンス画像の読み込みに失敗しました: $e');
      rethrow;
    }
  }

  void removeReferenceImage() {
    _referenceImage?.dispose();
    _referenceImage = null;
    _referenceImageBytes = null;
    notifyListeners();
  }

  /// MCP設定を設定
  void setMcpConfig(McpConfig config) {
    _mcpConfig = config;
    notifyListeners();
  }

  /// キャンバスを画像としてキャプチャ
  Future<Uint8List> captureCanvas(GlobalKey repaintKey) async {
    final RenderRepaintBoundary? boundary =
        repaintKey.currentContext?.findRenderObject() as RenderRepaintBoundary?;

    if (boundary == null) {
      throw Exception('キャンバスが見つかりません');
    }

    final ui.Image image = await boundary.toImage(pixelRatio: 3.0);
    final ByteData? byteData = await image.toByteData(format: ui.ImageByteFormat.png);

    if (byteData == null) {
      throw Exception('画像のキャプチャに失敗しました');
    }

    return byteData.buffer.asUint8List();
  }

  /// AI画像生成を実行（Nano Banana）
  Future<void> generateWithNanoBanana({
    required String prompt,
    required GlobalKey canvasKey,
    String? mcpUrl,
  }) async {
    await _generateImage(
      prompt: prompt,
      canvasKey: canvasKey,
      config: McpConfig.nanoBanana(
        url: mcpUrl ?? 'http://localhost:3001/mcp/i2i/fal/nano-banana/v1',
      ),
    );
  }

  /// AI画像生成を実行（Seedream）
  Future<void> generateWithSeedream({
    required String prompt,
    required GlobalKey canvasKey,
    String? mcpUrl,
  }) async {
    await _generateImage(
      prompt: prompt,
      canvasKey: canvasKey,
      config: McpConfig.seedream(
        url: mcpUrl ?? 'http://localhost:3001/mcp/i2i/fal/bytedance/seedream',
      ),
    );
  }

  /// AI画像生成の共通処理
  Future<void> _generateImage({
    required String prompt,
    required GlobalKey canvasKey,
    required McpConfig config,
  }) async {
    if (prompt.trim().isEmpty) {
      _generationError = 'プロンプトを入力してください';
      _generationState = GenerationState.error;
      notifyListeners();
      return;
    }

    try {
      // 状態をアップロード中に設定
      _generationState = GenerationState.uploading;
      _generationError = null;
      notifyListeners();

      // キャンバスをキャプチャ
      final Uint8List canvasBytes = await captureCanvas(canvasKey);

      // 画像をアップロード
      final String imageUrl = await _uploadService.uploadImage(canvasBytes);
      debugPrint('画像をアップロードしました: $imageUrl');

      // リファレンス画像も一緒にアップロード（存在する場合）
      final List<String> imageUrls = <String>[imageUrl];
      if (_referenceImageBytes != null) {
        final String refUrl = await _uploadService.uploadImage(_referenceImageBytes!);
        imageUrls.add(refUrl);
        debugPrint('リファレンス画像をアップロードしました: $refUrl');
      }

      // 状態を送信中に設定
      _generationState = GenerationState.submitting;
      notifyListeners();

      // MCPクライアントを作成
      final McpClient client = McpClient(config);

      // 生成リクエストを送信
      final String requestId = await client.submitGeneration(
        prompt: prompt,
        imageUrls: imageUrls,
      );
      debugPrint('生成リクエストを送信しました: $requestId');

      // 状態を生成中に設定
      _generationState = GenerationState.generating;
      notifyListeners();

      // 完了までポーリング
      final String resultUrl = await client.pollUntilComplete(requestId: requestId);
      debugPrint('生成が完了しました: $resultUrl');

      // 結果を保存
      final GenerationResult result = GenerationResult(
        imageUrl: resultUrl,
        prompt: prompt,
        requestId: requestId,
        generatedAt: DateTime.now(),
      );
      _generationResults.insert(0, result);

      // 生成結果をリファレンス画像として読み込む（オプション）
      // await _loadGeneratedImageAsReference(resultUrl);

      // 状態を完了に設定
      _generationState = GenerationState.completed;
      notifyListeners();
    } catch (e) {
      debugPrint('画像生成エラー: $e');
      _generationError = e.toString();
      _generationState = GenerationState.error;
      notifyListeners();
    }
  }

  /// 生成結果をリファレンス画像として読み込む
  Future<void> loadGenerationResultAsReference(GenerationResult result) async {
    if (result.imageBytes != null) {
      await loadReferenceImage(result.imageBytes!);
    } else {
      // URLから画像をダウンロード
      try {
        final http.Response response = await http.get(Uri.parse(result.imageUrl));
        if (response.statusCode == 200) {
          await loadReferenceImage(response.bodyBytes);
        } else {
          throw Exception('画像のダウンロードに失敗しました: ${response.statusCode}');
        }
      } catch (e) {
        debugPrint('画像のダウンロードエラー: $e');
        rethrow;
      }
    }
  }

  /// 生成状態をリセット
  void resetGenerationState() {
    _generationState = GenerationState.idle;
    _generationError = null;
    notifyListeners();
  }
}

class _CanvasAction {
  const _CanvasAction.stroke(this.stroke) : text = null;

  const _CanvasAction.text(this.text) : stroke = null;

  final DrawnStroke? stroke;
  final DrawnText? text;
}
