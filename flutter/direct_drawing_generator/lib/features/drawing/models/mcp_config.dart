/// MCP (Model Context Protocol) サーバーの設定を表すクラス
class McpConfig {
  McpConfig({
    required this.name,
    required this.url,
    this.authorization,
    this.submitTool = 'nano_banana_edit_submit',
    this.statusTool = 'nano_banana_edit_status',
    this.resultTool = 'nano_banana_edit_result',
  });

  /// サーバー名
  final String name;

  /// サーバーURL
  final String url;

  /// 認証トークン（オプション）
  final String? authorization;

  /// 生成リクエスト送信用ツール名
  final String submitTool;

  /// 生成ステータス確認用ツール名
  final String statusTool;

  /// 生成結果取得用ツール名
  final String resultTool;

  /// Nano Banana用のデフォルト設定
  factory McpConfig.nanoBanana({
    required String url,
    String? authorization,
  }) {
    return McpConfig(
      name: 'Nano Banana',
      url: url,
      authorization: authorization,
      submitTool: 'nano_banana_edit_submit',
      statusTool: 'nano_banana_edit_status',
      resultTool: 'nano_banana_edit_result',
    );
  }

  /// Seedream用のデフォルト設定
  factory McpConfig.seedream({
    required String url,
    String? authorization,
  }) {
    return McpConfig(
      name: 'Seedream',
      url: url,
      authorization: authorization,
      submitTool: 'seedream_edit_submit',
      statusTool: 'seedream_edit_status',
      resultTool: 'seedream_edit_result',
    );
  }

  McpConfig copyWith({
    String? name,
    String? url,
    String? authorization,
    String? submitTool,
    String? statusTool,
    String? resultTool,
  }) {
    return McpConfig(
      name: name ?? this.name,
      url: url ?? this.url,
      authorization: authorization ?? this.authorization,
      submitTool: submitTool ?? this.submitTool,
      statusTool: statusTool ?? this.statusTool,
      resultTool: resultTool ?? this.resultTool,
    );
  }
}