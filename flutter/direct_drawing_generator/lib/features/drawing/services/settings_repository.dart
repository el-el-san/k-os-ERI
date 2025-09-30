import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/app_settings.dart';

/// 端末にサーバー設定を永続化するリポジトリ
class SettingsRepository {
  SettingsRepository({SharedPreferences? instance})
      : _instance = instance;

  static const String _storageKey = 'direct_drawing_app_settings_v1';

  final SharedPreferences? _instance;

  Future<AppSettings> load() async {
    try {
      final SharedPreferences prefs = _instance ?? await SharedPreferences.getInstance();
      final String? raw = prefs.getString(_storageKey);
      if (raw == null || raw.isEmpty) {
        return AppSettings.defaults();
      }
      return AppSettings.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (e, stackTrace) {
      debugPrint('SettingsRepository.load failed: $e');
      debugPrint('$stackTrace');
      return AppSettings.defaults();
    }
  }

  Future<void> save(AppSettings settings) async {
    try {
      final SharedPreferences prefs = _instance ?? await SharedPreferences.getInstance();
      await prefs.setString(_storageKey, settings.toJsonString());
    } catch (e, stackTrace) {
      debugPrint('SettingsRepository.save failed: $e');
      debugPrint('$stackTrace');
    }
  }

  Future<void> clear() async {
    try {
      final SharedPreferences prefs = _instance ?? await SharedPreferences.getInstance();
      await prefs.remove(_storageKey);
    } catch (e, stackTrace) {
      debugPrint('SettingsRepository.clear failed: $e');
      debugPrint('$stackTrace');
    }
  }
}
