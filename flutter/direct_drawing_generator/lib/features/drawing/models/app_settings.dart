import 'dart:convert';

/// アプリ全体で利用するサーバー設定
class AppSettings {
  AppSettings({
    required this.uploadEndpoint,
    required this.exposeEndpoint,
    required this.nanoBananaEndpoint,
    required this.seedreamEndpoint,
    this.uploadAuthorization,
    this.mcpAuthorization,
  });

  factory AppSettings.defaults() {
    return AppSettings(
      uploadEndpoint: 'http://localhost:3001/upload',
      exposeEndpoint: 'http://localhost:3001/expose',
      nanoBananaEndpoint: 'http://localhost:3001/mcp/i2i/fal/nano-banana/v1',
      seedreamEndpoint: 'http://localhost:3001/mcp/i2i/fal/bytedance/seedream',
    );
  }

  factory AppSettings.fromJson(Map<String, dynamic> json) {
    final AppSettings defaults = AppSettings.defaults();
    return AppSettings(
      uploadEndpoint: (json['uploadEndpoint'] as String?)?.trim().isNotEmpty == true
          ? (json['uploadEndpoint'] as String).trim()
          : defaults.uploadEndpoint,
      exposeEndpoint: (json['exposeEndpoint'] as String?)?.trim().isNotEmpty == true
          ? (json['exposeEndpoint'] as String).trim()
          : defaults.exposeEndpoint,
      nanoBananaEndpoint: (json['nanoBananaEndpoint'] as String?)?.trim().isNotEmpty == true
          ? (json['nanoBananaEndpoint'] as String).trim()
          : defaults.nanoBananaEndpoint,
      seedreamEndpoint: (json['seedreamEndpoint'] as String?)?.trim().isNotEmpty == true
          ? (json['seedreamEndpoint'] as String).trim()
          : defaults.seedreamEndpoint,
      uploadAuthorization: (json['uploadAuthorization'] as String?)?.trim().isNotEmpty == true
          ? (json['uploadAuthorization'] as String).trim()
          : null,
      mcpAuthorization: (json['mcpAuthorization'] as String?)?.trim().isNotEmpty == true
          ? (json['mcpAuthorization'] as String).trim()
          : null,
    );
  }

  factory AppSettings.fromJsonString(String data) {
    return AppSettings.fromJson(jsonDecode(data) as Map<String, dynamic>);
  }

  final String uploadEndpoint;
  final String exposeEndpoint;
  final String nanoBananaEndpoint;
  final String seedreamEndpoint;
  final String? uploadAuthorization;
  final String? mcpAuthorization;

  AppSettings copyWith({
    String? uploadEndpoint,
    String? exposeEndpoint,
    String? nanoBananaEndpoint,
    String? seedreamEndpoint,
    String? uploadAuthorization,
    String? mcpAuthorization,
  }) {
    return AppSettings(
      uploadEndpoint: uploadEndpoint ?? this.uploadEndpoint,
      exposeEndpoint: exposeEndpoint ?? this.exposeEndpoint,
      nanoBananaEndpoint: nanoBananaEndpoint ?? this.nanoBananaEndpoint,
      seedreamEndpoint: seedreamEndpoint ?? this.seedreamEndpoint,
      uploadAuthorization: uploadAuthorization ?? this.uploadAuthorization,
      mcpAuthorization: mcpAuthorization ?? this.mcpAuthorization,
    );
  }

  Map<String, dynamic> toJson() {
    return <String, dynamic>{
      'uploadEndpoint': uploadEndpoint,
      'exposeEndpoint': exposeEndpoint,
      'nanoBananaEndpoint': nanoBananaEndpoint,
      'seedreamEndpoint': seedreamEndpoint,
      if (uploadAuthorization != null) 'uploadAuthorization': uploadAuthorization,
      if (mcpAuthorization != null) 'mcpAuthorization': mcpAuthorization,
    };
  }

  String toJsonString() => jsonEncode(toJson());
}
