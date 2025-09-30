import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

/// 画像アップロードサービス
/// 画像をサーバーにアップロードし、公開URLを取得します
class ImageUploadService {
  ImageUploadService({
    this.uploadEndpoint = 'http://localhost:3001/upload',
    this.exposeEndpoint = 'http://localhost:3001/expose',
    this.authorization,
  });

  /// アップロードエンドポイント
  final String uploadEndpoint;

  /// 公開エンドポイント（フォールバック用）
  final String exposeEndpoint;

  /// 共通Authorizationヘッダー
  final String? authorization;

  /// 画像をアップロードして公開URLを取得
  Future<String> uploadImage(Uint8List imageBytes, {String? filename}) async {
    // まず/uploadを試す
    try {
      final String url = await _tryUpload(imageBytes, filename: filename);
      debugPrint('画像アップロード成功 (/upload): $url');
      return url;
    } catch (e) {
      debugPrint('アップロード失敗 (/upload): $e');
      // フォールバック: /exposeを試す
      try {
        final String url = await _tryExpose(imageBytes, filename: filename);
        debugPrint('画像公開成功 (/expose): $url');
        return url;
      } catch (e2) {
        debugPrint('公開失敗 (/expose): $e2');
        throw Exception('画像のアップロードに失敗しました: $e2');
      }
    }
  }

  /// /uploadエンドポイントを使用
  Future<String> _tryUpload(Uint8List imageBytes, {String? filename}) async {
    final http.MultipartRequest request = http.MultipartRequest(
      'POST',
      Uri.parse(uploadEndpoint),
    );

    if (authorization != null && authorization!.isNotEmpty) {
      request.headers['Authorization'] = authorization!;
    }

    request.files.add(
      http.MultipartFile.fromBytes(
        'file',
        imageBytes,
        filename: filename ?? 'drawing_${DateTime.now().millisecondsSinceEpoch}.png',
      ),
    );

    final http.StreamedResponse response = await request.send();

    if (response.statusCode != 200) {
      final String body = await response.stream.bytesToString();
      throw Exception('アップロード失敗: ${response.statusCode} $body');
    }

    final String responseBody = await response.stream.bytesToString();
    final Map<String, dynamic> data = jsonDecode(responseBody) as Map<String, dynamic>;

    // URLを抽出
    String? url = data['url'] as String?;
    url ??= data['public_url'] as String?;
    url ??= data['file_url'] as String?;

    if (url == null || url.isEmpty) {
      throw Exception('レスポンスにURLが含まれていません: $responseBody');
    }

    return url;
  }

  /// /exposeエンドポイントを使用（フォールバック）
  Future<String> _tryExpose(Uint8List imageBytes, {String? filename}) async {
    final String base64Data = base64Encode(imageBytes);

    final http.Response response = await http.post(
      Uri.parse(exposeEndpoint),
      headers: <String, String>{
        'Content-Type': 'application/json',
        if (authorization != null && authorization!.isNotEmpty) 'Authorization': authorization!,
      },
      body: jsonEncode(<String, dynamic>{
        'data': base64Data,
        'filename': filename ?? 'drawing_${DateTime.now().millisecondsSinceEpoch}.png',
        'mimetype': 'image/png',
      }),
    );

    if (response.statusCode != 200) {
      throw Exception('公開失敗: ${response.statusCode} ${response.body}');
    }

    final Map<String, dynamic> data = jsonDecode(response.body) as Map<String, dynamic>;

    // URLを抽出
    String? url = data['url'] as String?;
    url ??= data['public_url'] as String?;
    url ??= data['file_url'] as String?;

    if (url == null || url.isEmpty) {
      throw Exception('レスポンスにURLが含まれていません: ${response.body}');
    }

    return url;
  }

  /// 複数の画像をアップロード
  Future<List<String>> uploadMultiple(List<Uint8List> imageBytesList) async {
    final List<String> urls = <String>[];

    for (int i = 0; i < imageBytesList.length; i++) {
      final String url = await uploadImage(
        imageBytesList[i],
        filename: 'drawing_${DateTime.now().millisecondsSinceEpoch}_$i.png',
      );
      urls.add(url);
    }

    return urls;
  }
}
