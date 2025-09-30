import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../models/mcp_config.dart';

/// MCP (Model Context Protocol) クライアント
/// JSON-RPC 2.0プロトコルを使用してMCPサーバーと通信します
class McpClient {
  McpClient(this.config);

  final McpConfig config;
  int _nextId = 1;

  /// MCPツールを呼び出す
  Future<Map<String, dynamic>> callTool({
    required String toolName,
    required Map<String, dynamic> arguments,
  }) async {
    final int id = _nextId++;

    final Map<String, dynamic> request = <String, dynamic>{
      'jsonrpc': '2.0',
      'id': id,
      'method': 'tools/call',
      'params': <String, dynamic>{
        'name': toolName,
        'arguments': arguments,
      },
    };

    debugPrint('MCP Request: $toolName');
    debugPrint('Arguments: ${jsonEncode(arguments)}');

    try {
      final http.Response response = await http.post(
        Uri.parse(config.url),
        headers: <String, String>{
          'Content-Type': 'application/json',
          if (config.authorization != null) 'Authorization': config.authorization!,
        },
        body: jsonEncode(request),
      );

      debugPrint('MCP Response Status: ${response.statusCode}');
      debugPrint('MCP Response Body: ${response.body}');

      if (response.statusCode != 200) {
        throw Exception('MCPリクエストが失敗しました: ${response.statusCode} ${response.body}');
      }

      final Map<String, dynamic> responseData = jsonDecode(response.body) as Map<String, dynamic>;

      if (responseData.containsKey('error')) {
        final Map<String, dynamic> error = responseData['error'] as Map<String, dynamic>;
        throw Exception('MCPエラー: ${error['message']}');
      }

      return responseData;
    } catch (e) {
      debugPrint('MCP Call Error: $e');
      rethrow;
    }
  }

  /// 画像生成リクエストを送信
  Future<String> submitGeneration({
    required String prompt,
    required List<String> imageUrls,
    int numImages = 1,
  }) async {
    final Map<String, dynamic> response = await callTool(
      toolName: config.submitTool,
      arguments: <String, dynamic>{
        'prompt': prompt,
        'image_urls': imageUrls,
        'num_images': numImages,
      },
    );

    // request_idを抽出
    final Map<String, dynamic>? result = response['result'] as Map<String, dynamic>?;
    if (result == null) {
      throw Exception('レスポンスにresultフィールドがありません');
    }

    // request_idを探す（複数のパターンに対応）
    String? requestId = result['request_id'] as String?;
    requestId ??= result['requestId'] as String?;
    requestId ??= result['id'] as String?;

    // contentフィールドの中にある可能性もある
    if (requestId == null) {
      final List<dynamic>? content = result['content'] as List<dynamic>?;
      if (content != null && content.isNotEmpty) {
        final Map<String, dynamic>? firstContent = content[0] as Map<String, dynamic>?;
        if (firstContent != null && firstContent['type'] == 'text') {
          final String? text = firstContent['text'] as String?;
          if (text != null) {
            // JSONテキストからrequest_idを抽出
            try {
              final Map<String, dynamic> parsedText = jsonDecode(text) as Map<String, dynamic>;
              requestId = parsedText['request_id'] as String?;
            } catch (_) {
              // JSONパースに失敗した場合は正規表現で探す
              final RegExp regex = RegExp(r'"request_id"\s*:\s*"([^"]+)"');
              final RegExpMatch? match = regex.firstMatch(text);
              if (match != null) {
                requestId = match.group(1);
              }
            }
          }
        }
      }
    }

    if (requestId == null || requestId.isEmpty) {
      throw Exception('request_idが取得できませんでした: ${jsonEncode(result)}');
    }

    return requestId;
  }

  /// 生成ステータスを確認
  Future<Map<String, dynamic>> checkStatus({required String requestId}) async {
    final Map<String, dynamic> response = await callTool(
      toolName: config.statusTool,
      arguments: <String, dynamic>{'request_id': requestId},
    );

    final Map<String, dynamic>? result = response['result'] as Map<String, dynamic>?;
    if (result == null) {
      throw Exception('ステータス確認のレスポンスが不正です');
    }

    return result;
  }

  /// 生成結果を取得
  Future<String> getResult({required String requestId}) async {
    final Map<String, dynamic> response = await callTool(
      toolName: config.resultTool,
      arguments: <String, dynamic>{'request_id': requestId},
    );

    final Map<String, dynamic>? result = response['result'] as Map<String, dynamic>?;
    if (result == null) {
      throw Exception('結果取得のレスポンスが不正です');
    }

    // URLを抽出（複数のパターンに対応）
    String? imageUrl = _extractUrl(result);

    if (imageUrl == null || imageUrl.isEmpty) {
      throw Exception('画像URLが取得できませんでした: ${jsonEncode(result)}');
    }

    return imageUrl;
  }

  /// レスポンスから画像URLを抽出する
  String? _extractUrl(Map<String, dynamic> data) {
    // 直接URLフィールドがある場合
    if (data.containsKey('url')) {
      return data['url'] as String?;
    }
    if (data.containsKey('image_url')) {
      return data['image_url'] as String?;
    }
    if (data.containsKey('result_url')) {
      return data['result_url'] as String?;
    }

    // contentフィールドの中を探す
    final List<dynamic>? content = data['content'] as List<dynamic>?;
    if (content != null && content.isNotEmpty) {
      for (final dynamic item in content) {
        if (item is Map<String, dynamic>) {
          if (item['type'] == 'text') {
            final String? text = item['text'] as String?;
            if (text != null) {
              // JSONとしてパースしてみる
              try {
                final Map<String, dynamic> parsed = jsonDecode(text) as Map<String, dynamic>;
                final String? url = _extractUrl(parsed);
                if (url != null) {
                  return url;
                }
              } catch (_) {
                // テキストから直接URLを抽出
                final RegExp urlRegex = RegExp(
                  r'https?://[^\s<>"{}|\\^`\[\]]+\.(?:png|jpg|jpeg|gif|webp)',
                  caseSensitive: false,
                );
                final RegExpMatch? match = urlRegex.firstMatch(text);
                if (match != null) {
                  return match.group(0);
                }
              }
            }
          } else if (item['type'] == 'image') {
            // 画像タイプの場合
            final String? url = item['url'] as String?;
            if (url != null) {
              return url;
            }
          }
        }
      }
    }

    // resultsの配列がある場合
    final List<dynamic>? results = data['results'] as List<dynamic>?;
    if (results != null && results.isNotEmpty) {
      final dynamic first = results[0];
      if (first is Map<String, dynamic>) {
        return _extractUrl(first);
      } else if (first is String && first.startsWith('http')) {
        return first;
      }
    }

    return null;
  }

  /// 生成完了までポーリング
  Future<String> pollUntilComplete({
    required String requestId,
    Duration pollInterval = const Duration(seconds: 5),
    int maxRetries = 20,
  }) async {
    for (int i = 0; i < maxRetries; i++) {
      await Future<void>.delayed(pollInterval);

      final Map<String, dynamic> status = await checkStatus(requestId: requestId);

      // ステータスを確認
      String? state = status['status'] as String?;
      state ??= status['state'] as String?;
      state = state?.toUpperCase();

      debugPrint('ポーリング ${i + 1}/$maxRetries: $state');

      if (state == 'DONE' || state == 'COMPLETED' || state == 'SUCCESS') {
        // 完了したら結果を取得
        return await getResult(requestId: requestId);
      } else if (state == 'ERROR' || state == 'FAILED') {
        final String errorMsg = status['error'] as String? ?? 'Unknown error';
        throw Exception('生成に失敗しました: $errorMsg');
      }

      // PENDING, PROCESSING, RUNNING などの場合は継続
    }

    throw Exception('生成がタイムアウトしました（最大 $maxRetries 回の再試行）');
  }
}