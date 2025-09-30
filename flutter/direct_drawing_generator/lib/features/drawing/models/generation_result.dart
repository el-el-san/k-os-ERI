import 'dart:typed_data';

/// AI画像生成の結果を表すクラス
class GenerationResult {
  GenerationResult({
    required this.imageUrl,
    required this.prompt,
    this.imageBytes,
    this.requestId,
    this.generatedAt,
  });

  /// 生成された画像のURL
  final String imageUrl;

  /// 生成に使用したプロンプト
  final String prompt;

  /// 生成された画像のバイトデータ（オプション）
  final Uint8List? imageBytes;

  /// リクエストID（トラッキング用）
  final String? requestId;

  /// 生成日時
  final DateTime? generatedAt;

  GenerationResult copyWith({
    String? imageUrl,
    String? prompt,
    Uint8List? imageBytes,
    String? requestId,
    DateTime? generatedAt,
  }) {
    return GenerationResult(
      imageUrl: imageUrl ?? this.imageUrl,
      prompt: prompt ?? this.prompt,
      imageBytes: imageBytes ?? this.imageBytes,
      requestId: requestId ?? this.requestId,
      generatedAt: generatedAt ?? this.generatedAt,
    );
  }
}