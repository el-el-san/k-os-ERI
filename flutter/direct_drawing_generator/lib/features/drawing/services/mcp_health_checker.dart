import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

/// MCPサーバーに対するヘルスチェック結果
class McpHealthCheckResult {
  McpHealthCheckResult({
    required this.success,
    required this.logs,
    required this.tools,
    this.error,
    this.sessionId,
  });

  final bool success;
  final List<String> logs;
  final List<McpToolSummary> tools;
  final String? error;
  final String? sessionId;
}

/// MCPのツール情報 (name + optional description)
class McpToolSummary {
  const McpToolSummary({
    required this.name,
    this.description,
  });

  final String name;
  final String? description;

  String display() {
    if (description == null || description!.trim().isEmpty) {
      return name;
    }
    return '$name — ${description!.trim()}';
  }
}

/// Model Context Protocol (MCP) エンドポイントに対するシンプルなヘルスチェッカー
/// JavaScript版 HttpMcpClient (k-os-ERI/static/js/mcp-client.js) の挙動を参考に、
/// initialize → notifications/initialized → tools/list系メソッドを順に試行します。
class McpHealthChecker {
  McpHealthChecker({
    required this.endpoint,
    this.authorization,
    this.clientName = 'direct-drawing-generator',
    this.clientVersion = '1.0.0',
    this.timeout = const Duration(seconds: 12),
  });

  final Uri endpoint;
  final String? authorization;
  final String clientName;
  final String clientVersion;
  final Duration timeout;

  final http.Client _client = http.Client();
  int _nextId = 1;
  String? _sessionId;

  Future<McpHealthCheckResult> run() async {
    final List<String> logs = <String>[];
    final List<McpToolSummary> tools = <McpToolSummary>[];

    try {
      logs.add('initializeを送信します');
      final Map<String, dynamic> initializeEnvelope =
          await _callWithInvalidSessionRetry('initialize', <String, dynamic>{
        'protocolVersion': '2025-03-26',
        'capabilities': <String, dynamic>{},
        'clientInfo': <String, dynamic>{
          'name': clientName,
          'version': clientVersion,
        },
      }, logs);

      final Map<String, dynamic>? initializeResult =
          initializeEnvelope['result'] as Map<String, dynamic>?;
      _captureSessionFromBody(initializeResult, logs);
      logs.add('initialize成功');

      await _notifyInitialized(logs);

      logs.add('ツール一覧取得を試行します');
      final _ListToolsOutcome toolsOutcome = await _listTools(logs);
      tools.addAll(toolsOutcome.tools);
      logs.add('取得したツール数: ${tools.length}');

      return McpHealthCheckResult(
        success: true,
        logs: logs,
        tools: tools,
        sessionId: _sessionId,
      );
    } on Object catch (error, StackTrace stackTrace) {
      logs.add('エラーが発生しました: $error');
      debugPrint('McpHealthChecker error (${endpoint.toString()}): $error\n$stackTrace');
      return McpHealthCheckResult(
        success: false,
        logs: logs,
        tools: tools,
        error: error.toString(),
        sessionId: _sessionId,
      );
    } finally {
      _client.close();
    }
  }

  Future<Map<String, dynamic>> _callWithInvalidSessionRetry(
    String method,
    Map<String, dynamic> params,
    List<String> logs,
  ) async {
    try {
      return await _call(method, params, logs);
    } on Object catch (error) {
      if (_looksLikeInvalidSessionError(error)) {
        logs.add('セッションが無効と判断。セッションIDをクリアして再試行します');
        _sessionId = null;
        return await _call(method, params, logs);
      }
      rethrow;
    }
  }

  Future<Map<String, dynamic>> _call(
    String method,
    Map<String, dynamic> params,
    List<String> logs,
  ) async {
    final int id = _nextId++;
    final Map<String, dynamic> payload = <String, dynamic>{
      'jsonrpc': '2.0',
      'id': id,
      'method': method,
      'params': params,
    };

    final Map<String, dynamic> envelope =
        await _send(payload, expectedId: id, logs: logs);
    final Map<String, dynamic>? result = envelope['result'] as Map<String, dynamic>?;
    _captureSessionFromBody(result, logs);
    return envelope;
  }

  Future<void> _notifyInitialized(List<String> logs) async {
    final Map<String, dynamic> payload = <String, dynamic>{
      'jsonrpc': '2.0',
      'method': 'notifications/initialized',
      'params': <String, dynamic>{},
    };

    final String body = jsonEncode(payload);
    try {
      final http.Response response = await _post(body).timeout(timeout);
      _captureSessionFromHeaders(response, logs);
      logs.add('notifications/initialized -> HTTP ${response.statusCode}');
    } on Object catch (error) {
      logs.add('notifications/initializedの送信に失敗: $error');
    }
  }

  Future<_ListToolsOutcome> _listTools(List<String> logs) async {
    const List<String> candidateMethods = <String>[
      'tools/list',
      'listTools',
      'list_tools',
      'get_tools',
    ];

    Object? lastError;

    for (final String method in candidateMethods) {
      logs.add('$method を試行');
      try {
        final Map<String, dynamic> envelope =
            await _callWithInvalidSessionRetry(method, const <String, dynamic>{}, logs);
        final Map<String, dynamic>? result = envelope['result'] as Map<String, dynamic>?;
        final dynamic toolsPayload = _extractToolsPayload(result ?? envelope);
        final List<McpToolSummary> tools = _parseTools(toolsPayload);

        if (tools.isNotEmpty) {
          return _ListToolsOutcome(method: method, tools: tools);
        }

        // toolsが空であれば次のメソッドも試行
        lastError = Exception('ツール一覧が空でした (method=$method)');
      } on Object catch (error) {
        logs.add('$method が失敗: $error');
        lastError = error;
      }
    }

    throw lastError ?? Exception('ツール一覧の取得に失敗しました');
  }

  Future<Map<String, dynamic>> _send(
    Map<String, dynamic> payload, {
    required int expectedId,
    required List<String> logs,
  }) async {
    final String body = jsonEncode(payload);
    http.Response response = await _post(body).timeout(timeout);
    _captureSessionFromHeaders(response, logs);

    if (!_isSuccessStatus(response.statusCode)) {
      final String snippet = _truncate(response.body, 240);
      if (_looksLikeContentTypeError(response, snippet)) {
        logs.add('Content-Typeエラーを検知。charset付きで再試行します');
        response = await _post(body, forceCharset: true).timeout(timeout);
        _captureSessionFromHeaders(response, logs);
      } else {
        throw Exception(
          'HTTP ${response.statusCode} エラー: $snippet',
        );
      }
    }

    if (response.body.isEmpty) {
      throw Exception('レスポンスボディが空です');
    }

    Map<String, dynamic> envelope;
    try {
      envelope = jsonDecode(response.body) as Map<String, dynamic>;
    } on Object catch (error) {
      throw Exception('JSONパースに失敗しました: $error');
    }

    final dynamic responseIdRaw = envelope['id'];
    final int? responseId = _tryParseId(responseIdRaw);
    if (responseId != expectedId) {
      throw Exception('レスポンスIDが一致しません (expected=$expectedId actual=$responseIdRaw)');
    }

    if (envelope.containsKey('error')) {
      final Map<String, dynamic> error = envelope['error'] as Map<String, dynamic>;
      throw _JsonRpcException(
        code: (error['code'] as num?)?.toInt(),
        message: error['message']?.toString() ?? 'Unknown MCP error',
        data: error['data'],
      );
    }

    return envelope;
  }

  Future<http.Response> _post(
    String body, {
    bool forceCharset = false,
  }) {
    final Map<String, String> headers = _buildHeaders(forceCharset: forceCharset);
    return _client.post(
      endpoint,
      headers: headers,
      body: body,
    );
  }

  Map<String, String> _buildHeaders({bool forceCharset = false}) {
    final Map<String, String> headers = <String, String>{
      'User-Agent': '$clientName/$clientVersion (Flutter)',
      'Connection': 'close',
      'Content-Type': forceCharset ? 'application/json; charset=utf-8' : 'application/json',
    };

    if (forceCharset) {
      headers['Accept'] = 'application/json';
    }

    if (_sessionId != null && _sessionId!.isNotEmpty) {
      headers['mcp-session-id'] = _sessionId!;
    }

    if (authorization != null && authorization!.trim().isNotEmpty) {
      headers['Authorization'] = authorization!;
    }

    return headers;
  }

  void _captureSessionFromHeaders(http.Response response, List<String> logs) {
    const List<String> headerKeys = <String>[
      'mcp-session-id',
      'mcp-session',
      'x-mcp-session-id',
      'x-session-id',
    ];

    for (final String key in headerKeys) {
      final String? value = response.headers[key];
      if (value != null && value.trim().isNotEmpty) {
        if (_sessionId != value.trim()) {
          _sessionId = value.trim();
          logs.add('レスポンスヘッダーからセッションIDを更新: $_sessionId');
        }
        return;
      }
    }
  }

  void _captureSessionFromBody(Map<String, dynamic>? body, List<String> logs) {
    if (body == null) {
      return;
    }

    final List<String> candidates = <String>['sessionId', 'session_id'];
    for (final String key in candidates) {
      final dynamic value = body[key];
      if (value is String && value.trim().isNotEmpty) {
        if (_sessionId != value.trim()) {
          _sessionId = value.trim();
          logs.add('レスポンスボディからセッションIDを更新: $_sessionId');
        }
        return;
      }
    }

    final Map<String, dynamic>? session = body['session'] as Map<String, dynamic>?;
    final String? nestedId = session?['id'] as String?;
    if (nestedId != null && nestedId.trim().isNotEmpty) {
      if (_sessionId != nestedId.trim()) {
        _sessionId = nestedId.trim();
        logs.add('session.id からセッションIDを更新: $_sessionId');
      }
      return;
    }

    final Map<String, dynamic>? serverInfo = body['serverInfo'] as Map<String, dynamic>?;
    final String? serverSession = serverInfo?['sessionId'] as String?;
    if (serverSession != null && serverSession.trim().isNotEmpty) {
      if (_sessionId != serverSession.trim()) {
        _sessionId = serverSession.trim();
        logs.add('serverInfo.sessionId からセッションIDを更新: $_sessionId');
      }
    }
  }

  bool _isSuccessStatus(int statusCode) => statusCode >= 200 && statusCode < 300;

  bool _looksLikeContentTypeError(http.Response response, String snippet) {
    final String lower = snippet.toLowerCase();
    return response.statusCode >= 400 &&
        response.statusCode < 500 &&
        (lower.contains('invalid content type') || lower.contains('unsupported content type'));
  }

  bool _looksLikeInvalidSessionError(Object error) {
    final String lower = error.toString().toLowerCase();
    return lower.contains('invalid') && lower.contains('session');
  }

  dynamic _extractToolsPayload(dynamic raw) {
    if (raw is Map<String, dynamic>) {
      if (raw.containsKey('tools')) {
        return raw['tools'];
      }
      if (raw.containsKey('result')) {
        return _extractToolsPayload(raw['result']);
      }
      if (raw.containsKey('items')) {
        return raw['items'];
      }
      if (raw.containsKey('data')) {
        return _extractToolsPayload(raw['data']);
      }
    }
    return raw;
  }

  List<McpToolSummary> _parseTools(dynamic payload) {
    final List<McpToolSummary> tools = <McpToolSummary>[];
    final Set<String> seen = <String>{};

    void addTool(String name, [String? description]) {
      if (name.trim().isEmpty) {
        return;
      }
      final String key = name.trim().toLowerCase();
      if (seen.add(key)) {
        tools.add(McpToolSummary(name: name.trim(), description: description));
      }
    }

    if (payload is List) {
      for (final dynamic item in payload) {
        if (item is Map<String, dynamic>) {
          final String? name = (item['name'] ?? item['id']) as String?;
          final String? description =
              (item['description'] ?? item['desc'] ?? item['detail']) as String?;
          if (name != null) {
            addTool(name, description);
          }
        } else if (item is String) {
          addTool(item);
        }
      }
    } else if (payload is Map<String, dynamic>) {
      payload.forEach((String key, dynamic value) {
        if (value is Map<String, dynamic>) {
          final String? name = (value['name'] as String?) ?? key;
          final String? description =
              (value['description'] ?? value['desc'] ?? value['detail']) as String?;
          if (name != null) {
            addTool(name, description);
          }
        } else if (value is String) {
          addTool(key, value);
        } else if (value is List) {
          for (final dynamic nested in value) {
            if (nested is Map<String, dynamic>) {
              final String? name =
                  (nested['name'] as String?) ?? (nested['id'] as String?) ?? key;
              final String? description =
                  (nested['description'] ?? nested['desc'] ?? nested['detail']) as String?;
              if (name != null) {
                addTool(name, description);
              }
            } else if (nested is String) {
              addTool(nested);
            }
          }
        }
      });
    }

    return tools;
  }

  int? _tryParseId(dynamic value) {
    if (value is int) {
      return value;
    }
    if (value is String) {
      return int.tryParse(value);
    }
    if (value is num) {
      return value.toInt();
    }
    return null;
  }

  String _truncate(String input, int maxLength) {
    if (input.length <= maxLength) {
      return input;
    }
    return '${input.substring(0, maxLength)}…';
  }
}

class _ListToolsOutcome {
  _ListToolsOutcome({required this.method, required this.tools});

  final String method;
  final List<McpToolSummary> tools;
}

class _JsonRpcException implements Exception {
  _JsonRpcException({this.code, required this.message, this.data});

  final int? code;
  final String message;
  final Object? data;

  @override
  String toString() {
    final StringBuffer buffer = StringBuffer('MCP Error');
    if (code != null) {
      buffer.write(' [$code]');
    }
    buffer.write(': $message');
    if (data != null) {
      try {
        buffer.write(' (data: ${jsonEncode(data)})');
      } catch (_) {
        buffer.write(' (data: $data)');
      }
    }
    return buffer.toString();
  }
}
