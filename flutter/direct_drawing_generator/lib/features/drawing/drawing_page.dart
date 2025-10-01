import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:file_picker/file_picker.dart';
import 'package:http/http.dart' as http;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_colorpicker/flutter_colorpicker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import 'drawing_controller.dart';
import 'models/drawing_mode.dart';
import 'models/generation_state.dart';
import 'models/app_settings.dart';
import 'widgets/drawing_canvas.dart';

class DrawingPage extends StatefulWidget {
  const DrawingPage({super.key});

  @override
  State<DrawingPage> createState() => _DrawingPageState();
}

class _DrawingPageState extends State<DrawingPage> {
  late final DrawingController _controller;
  final TextEditingController _textController = TextEditingController();
  final TextEditingController _promptController = TextEditingController();
  final GlobalKey _repaintBoundaryKey = GlobalKey();
  bool _isSaving = false;

  static const List<Color> _presetPalette = <Color>[
    Color(0xffff4d5a),
    Color(0xff4a9eff),
    Color(0xff2dd4bf),
    Color(0xfffacc15),
    Color(0xffffffff),
    Color(0xffd946ef),
    Color(0xfff97316),
    Color(0xff111827),
  ];

  @override
  void initState() {
    super.initState();
    _controller = DrawingController();
    _controller.init();
  }

  @override
  void dispose() {
    _controller.dispose();
    _textController.dispose();
    _promptController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider<DrawingController>.value(
      value: _controller,
      child: Consumer<DrawingController>(
        builder: (BuildContext context, DrawingController controller, _) {
          if (!controller.isInitialized) {
            return const Scaffold(
              backgroundColor: Color(0xff0f141b),
              body: Center(
                child: CircularProgressIndicator(),
              ),
            );
          }
          return LayoutBuilder(
            builder: (BuildContext context, BoxConstraints constraints) {
              final bool isWide = constraints.maxWidth >= 960;
              return Scaffold(
                backgroundColor: const Color(0xff0f141b),
                appBar: AppBar(
                  title: const Text('Direct Drawing Generator'),
                  backgroundColor: const Color(0xff1b2430),
                  actions: <Widget>[
                    IconButton(
                      tooltip: 'Undo',
                      onPressed: controller.hasUndo ? controller.undo : null,
                      icon: const Icon(Icons.undo),
                    ),
                    IconButton(
                      tooltip: 'Redo',
                      onPressed: controller.hasRedo ? controller.redo : null,
                      icon: const Icon(Icons.redo),
                    ),
                    IconButton(
                      tooltip: 'Clear',
                      onPressed: controller.strokes.isEmpty && controller.texts.isEmpty
                          ? null
                          : controller.clear,
                      icon: const Icon(Icons.layers_clear),
                    ),
                    const SizedBox(width: 8),
                  ],
                ),
                body: SafeArea(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: isWide
                        ? Row(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: <Widget>[
                              SizedBox(
                                width: 320,
                                child: SingleChildScrollView(
                                  child: _buildControlPanel(context, controller),
                                ),
                              ),
                              const SizedBox(width: 16),
                              Expanded(child: _buildCanvasArea(context, controller)),
                            ],
                          )
                        : ListView(
                            children: <Widget>[
                              AspectRatio(
                                aspectRatio: 1.0,
                                child: _buildCanvasArea(context, controller),
                              ),
                              const SizedBox(height: 16),
                              _buildControlPanel(context, controller),
                            ],
                          ),
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }

  Widget _buildCanvasArea(BuildContext context, DrawingController controller) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xff151d24),
        borderRadius: BorderRadius.circular(16),
        boxShadow: const <BoxShadow>[
          BoxShadow(
            color: Colors.black38,
            offset: Offset(0, 18),
            blurRadius: 36,
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: <Widget>[
          _CanvasHeader(controller: controller),
          const Divider(height: 1, color: Color(0xff252f3b)),
          Expanded(
            child: Stack(
              children: <Widget>[
                Positioned.fill(
                  child: DrawingCanvas(
                    controller: controller,
                    repaintKey: _repaintBoundaryKey,
                    onTextPlacement: (Offset offset) {
                      _controller.placeText(
                        text: _textController.text,
                        at: offset,
                      );
                      if (_controller.mode == DrawingMode.text) {
                        FocusScope.of(context).unfocus();
                      }
                    },
                  ),
                ),
                if (_isSaving)
                  const Positioned.fill(
                    child: ColoredBox(
                      color: Color(0xaa000000),
                      child: Center(
                        child: CircularProgressIndicator(),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const Divider(height: 1, color: Color(0xff252f3b)),
          _buildSizeControls(context, controller),
        ],
      ),
    );
  }

  Widget _buildControlPanel(BuildContext context, DrawingController controller) {
    final ThemeData theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Text('Reference Assets', style: theme.textTheme.titleMedium?.copyWith(color: Colors.white70)),
        const SizedBox(height: 12),
        Row(
            children: <Widget>[
              Expanded(
                child: ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xff3b82f6),
                  ),
                  onPressed: _pickReferenceImage,
                  icon: const Icon(Icons.folder_open),
                  label: const Text('Import Reference'),
                ),
              ),
              const SizedBox(width: 8),
              IconButton(
                tooltip: 'Remove reference image',
                onPressed: controller.hasReferenceImage ? controller.removeReferenceImage : null,
                icon: const Icon(Icons.delete_forever),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (controller.referenceImageBytes != null)
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Image.memory(
                controller.referenceImageBytes!,
                fit: BoxFit.cover,
                height: 160,
                width: double.infinity,
                errorBuilder: (BuildContext context, Object error, StackTrace? stackTrace) {
                  debugPrint('❌ 画像表示エラー: $error');
                  return Container(
                    height: 160,
                    width: double.infinity,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: const Color(0xffff4d5a)),
                      color: const Color(0xff121821),
                    ),
                    alignment: Alignment.center,
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: <Widget>[
                        const Icon(Icons.error, color: Color(0xffff4d5a)),
                        const SizedBox(height: 8),
                        Text(
                          'Error: ${error.toString()}',
                          style: const TextStyle(color: Color(0xffff4d5a), fontSize: 11),
                          textAlign: TextAlign.center,
                        ),
                      ],
                    ),
                  );
                },
              ),
            )
          else
            Container(
              height: 160,
              width: double.infinity,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xff2b3645)),
                color: const Color(0xff121821),
              ),
              alignment: Alignment.center,
              child: const Text(
                'No reference image',
                style: TextStyle(color: Colors.white38),
              ),
            ),
          const SizedBox(height: 24),
          Text('Brush Colors', style: theme.textTheme.titleMedium?.copyWith(color: Colors.white70)),
          const SizedBox(height: 12),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: <Widget>[
              for (final Color color in _presetPalette)
                _ColorSwatch(
                  color: color,
                  isSelected: controller.penColor.value == color.value,
                  onSelected: () => controller.setPenColor(color),
                ),
              _ColorSwatch(
                color: controller.penColor,
                isSelected: false,
                onSelected: _openColorPicker,
                child: const Icon(Icons.palette, color: Colors.white, size: 18),
              ),
            ],
          ),
          const SizedBox(height: 24),
          Text('Tools', style: theme.textTheme.titleMedium?.copyWith(color: Colors.white70)),
          const SizedBox(height: 12),
          ToggleButtons(
            isSelected: <bool>[
              controller.isPenActive,
              controller.isEraserActive,
              controller.isTextActive,
            ],
            onPressed: (int index) {
              switch (index) {
                case 0:
                  controller.setMode(DrawingMode.pen);
                  break;
                case 1:
                  controller.setMode(DrawingMode.eraser);
                  break;
                case 2:
                  controller.setMode(DrawingMode.text);
                  break;
              }
            },
            borderRadius: BorderRadius.circular(12),
            selectedBorderColor: const Color(0xff4a9eff),
            fillColor: const Color(0xff223b57),
            color: Colors.white60,
            selectedColor: Colors.white,
            constraints: const BoxConstraints(minHeight: 48, minWidth: 88),
            children: const <Widget>[
              Row(mainAxisAlignment: MainAxisAlignment.center, children: <Widget>[Icon(Icons.edit), SizedBox(width: 6), Text('Draw')]),
              Row(mainAxisAlignment: MainAxisAlignment.center, children: <Widget>[Icon(Icons.auto_fix_high), SizedBox(width: 6), Text('Erase')]),
              Row(mainAxisAlignment: MainAxisAlignment.center, children: <Widget>[Icon(Icons.text_fields), SizedBox(width: 6), Text('Text')]),
            ],
          ),
          const SizedBox(height: 24),
          Text('Text Prompt', style: theme.textTheme.titleMedium?.copyWith(color: Colors.white70)),
          const SizedBox(height: 8),
          TextField(
            controller: _textController,
            maxLines: 2,
            style: const TextStyle(color: Colors.white),
            decoration: InputDecoration(
              hintText: 'Enter text to stamp on canvas',
              hintStyle: const TextStyle(color: Colors.white38),
              filled: true,
              fillColor: const Color(0xff18212b),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: Color(0xff253143)),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: Color(0xff3b82f6)),
              ),
            ),
          ),
          const SizedBox(height: 24),
          Text('AI Image Generation', style: theme.textTheme.titleMedium?.copyWith(color: Colors.white70)),
          const SizedBox(height: 12),
          _buildServerSettingsCard(controller),
          const SizedBox(height: 12),
          TextField(
            controller: _promptController,
            maxLines: 3,
            style: const TextStyle(color: Colors.white),
            decoration: InputDecoration(
              hintText: '編集したい内容（例: 色味を暖色に、肌をなめらかに、背景を夕景に など）',
              hintStyle: const TextStyle(color: Colors.white38),
              filled: true,
              fillColor: const Color(0xff18212b),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: Color(0xff253143)),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: Color(0xff3b82f6)),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: <Widget>[
              Expanded(
                child: ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xffa855f7),
                    minimumSize: const Size.fromHeight(48),
                  ),
                  onPressed: controller.generationState == GenerationState.idle || controller.generationState == GenerationState.completed || controller.generationState == GenerationState.error
                      ? () => _generateWithNanoBanana(controller)
                      : null,
                  icon: const Icon(Icons.auto_awesome),
                  label: const Text('Nano Banana'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xff4a9eff),
                    minimumSize: const Size.fromHeight(48),
                  ),
                  onPressed: controller.generationState == GenerationState.idle || controller.generationState == GenerationState.completed || controller.generationState == GenerationState.error
                      ? () => _generateWithSeedream(controller)
                      : null,
                  icon: const Icon(Icons.auto_fix_high),
                  label: const Text('Seedream'),
                ),
              ),
            ],
          ),
          if (controller.generationState != GenerationState.idle) ...<Widget>[
            const SizedBox(height: 12),
            _buildGenerationStatus(controller),
          ],
          if (controller.generationResults.isNotEmpty) ...<Widget>[
            const SizedBox(height: 16),
            Text('Generated Results', style: theme.textTheme.titleMedium?.copyWith(color: Colors.white70)),
            const SizedBox(height: 12),
            SizedBox(
              height: 120,
              child: ListView.builder(
                scrollDirection: Axis.horizontal,
                itemCount: controller.generationResults.length,
                itemBuilder: (BuildContext context, int index) {
                  final result = controller.generationResults[index];
                  return Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: GestureDetector(
                      onTap: () => _loadResultAsReference(result),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: Image.network(
                          result.imageUrl,
                          width: 120,
                          height: 120,
                          fit: BoxFit.cover,
                          errorBuilder: (BuildContext context, Object error, StackTrace? stackTrace) {
                            return Container(
                              width: 120,
                              height: 120,
                              color: const Color(0xff2b3645),
                              child: const Icon(Icons.error, color: Colors.white38),
                            );
                          },
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
          const SizedBox(height: 24),
          ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xff00d4aa),
              minimumSize: const Size.fromHeight(50),
            ),
            onPressed: _isSaving ? null : _exportDrawing,
            icon: const Icon(Icons.download),
            label: Text(_isSaving ? 'Preparing image...' : 'Save & Share'),
          ),
        ],
      );
  }

  Widget _buildServerSettingsCard(DrawingController controller) {
    final ThemeData theme = Theme.of(context);
    final AppSettings settings = controller.settings;
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: const Color(0xff18212b),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xff253143)),
      ),
      child: Theme(
        data: Theme.of(context).copyWith(
          dividerColor: Colors.transparent,
          splashColor: Colors.transparent,
          highlightColor: Colors.transparent,
        ),
        child: ExpansionTile(
          initiallyExpanded: false,
          tilePadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          collapsedIconColor: Colors.white54,
          iconColor: const Color(0xff4a9eff),
          title: Text(
            'サーバー接続設定',
            style: theme.textTheme.bodyMedium?.copyWith(color: Colors.white70, fontWeight: FontWeight.w600),
          ),
          subtitle: Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              settings.nanoBananaEndpoint,
              style: theme.textTheme.bodySmall?.copyWith(color: Colors.white38),
              overflow: TextOverflow.ellipsis,
              maxLines: 1,
            ),
          ),
          childrenPadding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
          children: <Widget>[
            _EndpointRow(label: 'Upload', value: settings.uploadEndpoint),
            _EndpointRow(label: 'Expose', value: settings.exposeEndpoint),
            _EndpointRow(label: 'Nano Banana', value: settings.nanoBananaEndpoint),
            _EndpointRow(label: 'Seedream', value: settings.seedreamEndpoint),
            if ((settings.uploadAuthorization ?? settings.mcpAuthorization) != null) ...<Widget>[
              const SizedBox(height: 8),
              if (settings.uploadAuthorization != null)
                _EndpointRow(label: 'Upload Auth', value: settings.uploadAuthorization!),
              if (settings.mcpAuthorization != null)
                _EndpointRow(label: 'MCP Auth', value: settings.mcpAuthorization!),
            ],
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: _openServerSettings,
                icon: const Icon(Icons.settings),
                label: const Text('サーバー設定を変更'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildGenerationStatus(DrawingController controller) {
    String statusText;
    Color statusColor;
    IconData statusIcon;

    switch (controller.generationState) {
      case GenerationState.uploading:
        statusText = 'アップロード中...';
        statusColor = const Color(0xff4a9eff);
        statusIcon = Icons.cloud_upload;
        break;
      case GenerationState.submitting:
        statusText = '生成リクエスト送信中...';
        statusColor = const Color(0xff4a9eff);
        statusIcon = Icons.send;
        break;
      case GenerationState.generating:
        statusText = 'AI画像生成中...';
        statusColor = const Color(0xffa855f7);
        statusIcon = Icons.auto_awesome;
        break;
      case GenerationState.completed:
        statusText = '生成完了！';
        statusColor = const Color(0xff00d4aa);
        statusIcon = Icons.check_circle;
        break;
      case GenerationState.error:
        statusText = 'エラー: ${controller.generationError ?? "不明なエラー"}';
        statusColor = const Color(0xffff4d5a);
        statusIcon = Icons.error;
        break;
      default:
        statusText = '';
        statusColor = Colors.white60;
        statusIcon = Icons.info;
    }

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xff18212b),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: statusColor.withOpacity(0.3)),
      ),
      child: Row(
        children: <Widget>[
          if (controller.generationState == GenerationState.uploading ||
              controller.generationState == GenerationState.submitting ||
              controller.generationState == GenerationState.generating)
            const SizedBox(
              width: 16,
              height: 16,
              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white70),
            )
          else
            Icon(statusIcon, color: statusColor, size: 20),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              statusText,
              style: TextStyle(color: statusColor, fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _openServerSettings() async {
    final AppSettings? updated = await showDialog<AppSettings>(
      context: context,
      builder: (BuildContext context) {
        return _ServerSettingsDialog(initial: _controller.settings);
      },
    );

    if (!mounted || updated == null) {
      return;
    }

    await _controller.updateSettings(updated);
    if (!mounted) {
      return;
    }
    _showSnackBar('サーバー設定を保存しました');
  }

  Future<void> _generateWithNanoBanana(DrawingController controller) async {
    final String prompt = _promptController.text.trim();
    if (prompt.isEmpty) {
      _showSnackBar('プロンプトを入力してください');
      return;
    }

    // MCP設定確認ダイアログを表示
    final bool? confirmed = await _showMcpInfoDialog(
      title: 'Nano Banana Edit',
      serverName: 'Nano Banana',
      defaultUrl: 'http://localhost:3001/mcp/i2i/fal/nano-banana/v1',
    );

    if (confirmed != true) {
      return;
    }

    try {
      await controller.generateWithNanoBanana(
        prompt: prompt,
        canvasKey: _repaintBoundaryKey,
      );
      _showSnackBar('画像生成が完了しました！');
    } catch (e) {
      _showSnackBar('画像生成に失敗しました: $e');
    }
  }

  Future<void> _generateWithSeedream(DrawingController controller) async {
    final String prompt = _promptController.text.trim();
    if (prompt.isEmpty) {
      _showSnackBar('プロンプトを入力してください');
      return;
    }

    // MCP設定確認ダイアログを表示
    final bool? confirmed = await _showMcpInfoDialog(
      title: 'Seedream Edit',
      serverName: 'Seedream',
      defaultUrl: 'http://localhost:3001/mcp/i2i/fal/bytedance/seedream',
    );

    if (confirmed != true) {
      return;
    }

    try {
      await controller.generateWithSeedream(
        prompt: prompt,
        canvasKey: _repaintBoundaryKey,
      );
      _showSnackBar('画像生成が完了しました！');
    } catch (e) {
      _showSnackBar('画像生成に失敗しました: $e');
    }
  }

  Future<bool?> _showMcpInfoDialog({
    required String title,
    required String serverName,
    required String defaultUrl,
  }) async {
    return showDialog<bool>(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xff1b2430),
          title: Row(
            children: <Widget>[
              const Icon(Icons.info_outline, color: Color(0xff4a9eff)),
              const SizedBox(width: 8),
              Text(title),
            ],
          ),
          content: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                const Text(
                  'AI画像生成機能について',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 12),
                const Text(
                  'この機能を使用するには、MCPサーバーが起動している必要があります。',
                  style: TextStyle(fontSize: 14),
                ),
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xff0f141b),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: const Color(0xff2b3645)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      const Text(
                        '必要な設定:',
                        style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Color(0xff4a9eff)),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'サーバー: $serverName',
                        style: const TextStyle(fontSize: 12, color: Colors.white70),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'URL: $defaultUrl',
                        style: const TextStyle(fontSize: 11, fontFamily: 'monospace', color: Colors.white60),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xff2d1f1f),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: const Color(0xff4a2626)),
                  ),
                  child: const Row(
                    children: <Widget>[
                      Icon(Icons.warning_amber, color: Color(0xfffacc15), size: 20),
                      SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'サーバーが起動していない場合、エラーが発生します。',
                          style: TextStyle(fontSize: 12, color: Color(0xfffacc15)),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                const Text(
                  'デバッグログはFlutter DevToolsで確認できます。',
                  style: TextStyle(fontSize: 12, color: Colors.white54),
                ),
              ],
            ),
          ),
          actions: <Widget>[
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('キャンセル'),
            ),
            FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xff4a9eff),
              ),
              onPressed: () => Navigator.of(context).pop(true),
              child: const Text('続行'),
            ),
          ],
        );
      },
    );
  }

  Future<void> _loadResultAsReference(dynamic result) async {
    try {
      await _controller.loadGenerationResultAsReference(result);
      _showSnackBar('生成結果をリファレンスとして読み込みました');
    } catch (e) {
      _showSnackBar('画像の読み込みに失敗しました: $e');
    }
  }

  Widget _buildSizeControls(BuildContext context, DrawingController controller) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18),
      decoration: const BoxDecoration(
        color: Color(0xff111a23),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          _SliderTile(
            label: 'Brush Size',
            value: controller.penSize,
            min: 1,
            max: 80,
            onChanged: controller.setPenSize,
          ),
          const SizedBox(height: 12),
          _SliderTile(
            label: 'Eraser Size',
            value: controller.eraserSize,
            min: 8,
            max: 200,
            onChanged: controller.setEraserSize,
          ),
          const SizedBox(height: 12),
          _SliderTile(
            label: 'Text Size',
            value: controller.textSize,
            min: 12,
            max: 160,
            onChanged: controller.setTextSize,
          ),
        ],
      ),
    );
  }

  Future<void> _pickReferenceImage() async {
    try {
      debugPrint('🖼️ ファイルピッカーを開始...');
      final FilePickerResult? result = await FilePicker.platform.pickFiles(type: FileType.image);

      if (result == null) {
        debugPrint('❌ ファイルピッカーがキャンセルされました');
        return;
      }

      if (result.files.isEmpty) {
        debugPrint('❌ 選択されたファイルがありません');
        return;
      }

      final PlatformFile pickedFile = result.files.first;

      Uint8List? bytes = pickedFile.bytes;
      if (bytes == null) {
        final String? path = pickedFile.path;
        if (path == null) {
          debugPrint('❌ ファイルのバイトデータとパスが取得できませんでした');
          _showSnackBar('画像データの読み込みに失敗しました');
          return;
        }

        // Android などでは bytes が省略されるため、パスから読み込む
        bytes = await File(path).readAsBytes();
      }

      final int byteLength = bytes.length;
      debugPrint('✅ 画像を選択しました: ${pickedFile.name}, サイズ: $byteLength bytes');

      await _controller.loadReferenceImage(bytes);
      debugPrint('✅ リファレンス画像を読み込みました');
      _showSnackBar('リファレンス画像を読み込みました');
    } catch (error, stackTrace) {
      debugPrint('❌ 画像インポートエラー: $error');
      if (kDebugMode) {
        debugPrint('スタックトレース: $stackTrace');
      }
      _showSnackBar('画像の読み込みに失敗しました: $error');
    }
  }

  Future<void> _openColorPicker() async {
    Color tempColor = _controller.penColor;
    final Color? picked = await showDialog<Color>(
      context: context,
      builder: (BuildContext context) {
        return AlertDialog(
          backgroundColor: const Color(0xff1b2430),
          title: const Text('Select Color'),
          content: SingleChildScrollView(
            child: BlockPicker(
              pickerColor: tempColor,
              availableColors: _presetPalette,
              onColorChanged: (Color value) {
                tempColor = value;
              },
            ),
          ),
          actions: <Widget>[
            TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(context, tempColor), child: const Text('Select')),
          ],
        );
      },
    );

    if (picked != null) {
      _controller.setPenColor(picked);
    }
  }

  Future<void> _exportDrawing() async {
    if (_isSaving) {
      return;
    }
    setState(() => _isSaving = true);
    try {
      final Uint8List bytes = await _capturePng();
      if (bytes.isEmpty) {
        _showSnackBar('Nothing to save yet');
        return;
      }
      if (kIsWeb) {
        await Share.shareXFiles(<XFile>[
          XFile.fromData(bytes, name: _buildFileName()),
        ]);
      } else {
        final File file = await _persistToFile(bytes);
        await Share.shareXFiles(<XFile>[XFile(file.path)]);
        _showSnackBar('Saved to ${file.path}');
      }
    } catch (error, stackTrace) {
      if (kDebugMode) {
        debugPrint('Failed to save drawing: $error\n$stackTrace');
      }
      _showSnackBar('Save failed. Please try again.');
    } finally {
      if (mounted) {
        setState(() => _isSaving = false);
      }
    }
  }

  Future<Uint8List> _capturePng() async {
    final RenderRepaintBoundary? boundary =
        _repaintBoundaryKey.currentContext?.findRenderObject() as RenderRepaintBoundary?;
    if (boundary == null) {
      return Uint8List(0);
    }
    final double dpr = MediaQuery.of(context).devicePixelRatio;
    final ui.Image image = await boundary.toImage(pixelRatio: dpr);
    final ByteData? byteData = await image.toByteData(format: ui.ImageByteFormat.png);
    return byteData?.buffer.asUint8List() ?? Uint8List(0);
  }

  Future<File> _persistToFile(Uint8List bytes) async {
    final Directory directory = await getApplicationDocumentsDirectory();
    final String path = '${directory.path}/${_buildFileName()}';
    final File file = File(path);
    await file.writeAsBytes(bytes, flush: true);
    return file;
  }

  String _buildFileName() {
    final DateTime now = DateTime.now();
    return 'direct_drawing_${now.millisecondsSinceEpoch}.png';
  }

  void _showSnackBar(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
      ),
    );
  }
}

class _EndpointRow extends StatelessWidget {
  const _EndpointRow({
    required this.label,
    required this.value,
  });

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final TextStyle labelStyle = Theme.of(context)
            .textTheme
            .bodySmall
            ?.copyWith(color: Colors.white54) ??
        const TextStyle(fontSize: 11, color: Colors.white54);
    final TextStyle valueStyle = Theme.of(context)
            .textTheme
            .bodySmall
            ?.copyWith(color: Colors.white70) ??
        const TextStyle(fontSize: 11, color: Colors.white70);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          SizedBox(
            width: 92,
            child: Text(label, style: labelStyle),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Tooltip(
              message: value,
              preferBelow: false,
              child: Text(
                value,
                style: valueStyle,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ServerSettingsDialog extends StatefulWidget {
  const _ServerSettingsDialog({
    required this.initial,
  });

  final AppSettings initial;

  @override
  State<_ServerSettingsDialog> createState() => _ServerSettingsDialogState();
}

class _ServerSettingsDialogState extends State<_ServerSettingsDialog> {
  late final TextEditingController _uploadController;
  late final TextEditingController _exposeController;
  late final TextEditingController _nanoBananaController;
  late final TextEditingController _seedreamController;
  late final TextEditingController _uploadAuthController;
  late final TextEditingController _mcpAuthController;

  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();
  bool _isTesting = false;

  @override
  void initState() {
    super.initState();
    _uploadController = TextEditingController(text: widget.initial.uploadEndpoint);
    _exposeController = TextEditingController(text: widget.initial.exposeEndpoint);
    _nanoBananaController = TextEditingController(text: widget.initial.nanoBananaEndpoint);
    _seedreamController = TextEditingController(text: widget.initial.seedreamEndpoint);
    _uploadAuthController = TextEditingController(text: widget.initial.uploadAuthorization ?? '');
    _mcpAuthController = TextEditingController(text: widget.initial.mcpAuthorization ?? '');
  }

  @override
  void dispose() {
    _uploadController.dispose();
    _exposeController.dispose();
    _nanoBananaController.dispose();
    _seedreamController.dispose();
    _uploadAuthController.dispose();
    _mcpAuthController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final double screenHeight = MediaQuery.of(context).size.height;

    return AlertDialog(
      backgroundColor: const Color(0xff1b2430),
      insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      title: const Row(
        children: <Widget>[
          Icon(Icons.settings, color: Color(0xff4a9eff)),
          SizedBox(width: 8),
          Text('サーバー設定'),
        ],
      ),
      content: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: screenHeight * 0.65,
          maxWidth: 600,
        ),
        child: SingleChildScrollView(
          child: Form(
            key: _formKey,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                // デフォルトに戻すボタンを上部に配置
                OutlinedButton.icon(
                  onPressed: _restoreDefaults,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.white70,
                    side: const BorderSide(color: Color(0xff3b82f6)),
                  ),
                  icon: const Icon(Icons.refresh, size: 18),
                  label: const Text('デフォルト値に戻す'),
                ),
                const SizedBox(height: 20),

                // アップロードAPIセクション
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xff0f141b),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: const Color(0xff2b3645)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Row(
                        children: <Widget>[
                          const Icon(Icons.cloud_upload, color: Color(0xff4a9eff), size: 18),
                          const SizedBox(width: 8),
                          const Text(
                            'アップロードAPI',
                            style: TextStyle(fontWeight: FontWeight.w600, color: Colors.white70, fontSize: 15),
                          ),
                          const SizedBox(width: 4),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: const Color(0xffff4d5a),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: const Text(
                              '必須',
                              style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        '画像アップロード・公開用のエンドポイント',
                        style: TextStyle(fontSize: 12, color: Colors.white54),
                      ),
                      const SizedBox(height: 12),
                      _buildUrlField(
                        controller: _uploadController,
                        label: 'Upload Endpoint',
                        hintText: '例: https://your-server/upload',
                      ),
                      const SizedBox(height: 12),
                      _buildUrlField(
                        controller: _exposeController,
                        label: 'Expose Endpoint',
                        hintText: '例: https://your-server/expose',
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                // MCPサーバーセクション
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xff0f141b),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: const Color(0xff2b3645)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Row(
                        children: <Widget>[
                          const Icon(Icons.auto_awesome, color: Color(0xffa855f7), size: 18),
                          const SizedBox(width: 8),
                          const Text(
                            'MCP サーバー',
                            style: TextStyle(fontWeight: FontWeight.w600, color: Colors.white70, fontSize: 15),
                          ),
                          const SizedBox(width: 4),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: const Color(0xffff4d5a),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: const Text(
                              '必須',
                              style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'AI画像生成用のMCP (Model Context Protocol) サーバー',
                        style: TextStyle(fontSize: 12, color: Colors.white54),
                      ),
                      const SizedBox(height: 12),
                      _buildUrlField(
                        controller: _nanoBananaController,
                        label: 'Nano Banana MCP URL',
                        hintText: '例: https://your-server/mcp/i2i/fal/nano-banana/v1',
                      ),
                      const SizedBox(height: 12),
                      _buildUrlField(
                        controller: _seedreamController,
                        label: 'Seedream MCP URL',
                        hintText: '例: https://your-server/mcp/i2i/fal/bytedance/seedream',
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),

                // 認証ヘッダーセクション
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xff0f141b),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: const Color(0xff2b3645)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Row(
                        children: <Widget>[
                          const Icon(Icons.lock, color: Color(0xfffacc15), size: 18),
                          const SizedBox(width: 8),
                          const Text(
                            '認証ヘッダー',
                            style: TextStyle(fontWeight: FontWeight.w600, color: Colors.white70, fontSize: 15),
                          ),
                          const SizedBox(width: 4),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: const Color(0xff2b3645),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: const Text(
                              '任意',
                              style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.white60),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'サーバーが認証を要求する場合のみ設定',
                        style: TextStyle(fontSize: 12, color: Colors.white54),
                      ),
                      const SizedBox(height: 12),
                      _buildTextField(
                        controller: _uploadAuthController,
                        label: 'Upload Authorization',
                        hintText: '例: Bearer xxxxx',
                      ),
                      const SizedBox(height: 12),
                      _buildTextField(
                        controller: _mcpAuthController,
                        label: 'MCP Authorization',
                        hintText: '例: Bearer yyyyy',
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
      actions: <Widget>[
        OutlinedButton.icon(
          onPressed: _isTesting ? null : _testConnection,
          icon: _isTesting
              ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.network_check),
          label: Text(_isTesting ? 'テスト中...' : '接続テスト'),
        ),
        const Spacer(),
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('キャンセル'),
        ),
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: const Color(0xff4a9eff)),
          onPressed: _handleSave,
          child: const Text('保存'),
        ),
      ],
    );
  }

  void _restoreDefaults() {
    final AppSettings defaults = AppSettings.defaults();
    _uploadController.text = defaults.uploadEndpoint;
    _exposeController.text = defaults.exposeEndpoint;
    _nanoBananaController.text = defaults.nanoBananaEndpoint;
    _seedreamController.text = defaults.seedreamEndpoint;
    _uploadAuthController.clear();
    _mcpAuthController.clear();
  }

  Future<void> _handleSave() async {
    final FormState? formState = _formKey.currentState;
    if (formState == null || !formState.validate()) {
      return;
    }

    Navigator.of(context).pop(_buildSettings());
  }

  Future<void> _testConnection() async {
    setState(() => _isTesting = true);
    final String url = _uploadController.text.trim();
    String? error;

    try {
      final response = await http.head(Uri.parse(url)).timeout(const Duration(seconds: 10));
      if (response.statusCode >= 200 && response.statusCode < 400) {
        // Success
      } else {
        error = 'サーバーから予期しない応答がありました (ステータスコード: ${response.statusCode})';
      }
    } catch (e) {
      error = e.toString();
    } finally {
      if (mounted) {
        setState(() => _isTesting = false);
        _showConnectionResultDialog(error == null, error);
      }
    }
  }

  Future<void> _showConnectionResultDialog(bool success, String? error) async {
    return showDialog<void>(
      context: context,
      builder: (BuildContext dialogContext) {
        return AlertDialog(
          backgroundColor: const Color(0xff1b2430),
          title: Row(
            children: <Widget>[
              Icon(
                success ? Icons.check_circle : Icons.error,
                color: success ? const Color(0xff00d4aa) : const Color(0xffff4d5a),
              ),
              const SizedBox(width: 12),
              const Text('接続テスト結果'),
            ],
          ),
          content: SingleChildScrollView(
            child: Text(
              success ? 'サーバーへの接続に成功しました。' : '接続に失敗しました。\n\nエラー: $error',
            ),
          ),
          actions: <Widget>[
            FilledButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: const Text('OK'),
            ),
          ],
        );
      },
    );
  }

  AppSettings _buildSettings() {
    String? uploadAuth = _uploadAuthController.text.trim();
    if (uploadAuth.isEmpty) {
      uploadAuth = null;
    }
    String? mcpAuth = _mcpAuthController.text.trim();
    if (mcpAuth.isEmpty) {
      mcpAuth = null;
    }

    return AppSettings(
      uploadEndpoint: _uploadController.text.trim(),
      exposeEndpoint: _exposeController.text.trim(),
      nanoBananaEndpoint: _nanoBananaController.text.trim(),
      seedreamEndpoint: _seedreamController.text.trim(),
      uploadAuthorization: uploadAuth,
      mcpAuthorization: mcpAuth,
    );
  }

  Widget _buildUrlField({
    required TextEditingController controller,
    required String label,
    required String hintText,
  }) {
    return _buildTextField(
      controller: controller,
      label: label,
      hintText: hintText,
      validator: _validateUrl,
      keyboardType: TextInputType.url,
    );
  }

  Widget _buildTextField({
    required TextEditingController controller,
    required String label,
    required String hintText,
    TextInputType? keyboardType,
    String? Function(String?)? validator,
  }) {
    return TextFormField(
      controller: controller,
      style: const TextStyle(color: Colors.white),
      keyboardType: keyboardType,
      autovalidateMode: AutovalidateMode.disabled,
      decoration: InputDecoration(
        labelText: label,
        hintText: hintText,
        labelStyle: const TextStyle(color: Colors.white70),
        hintStyle: const TextStyle(color: Colors.white38),
        filled: true,
        fillColor: const Color(0xff18212b),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xff253143)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xff4a9eff)),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xffff4d5a)),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xffff4d5a), width: 2),
        ),
      ),
      validator: validator,
    );
  }

  String? _validateUrl(String? value) {
    final String trimmed = value?.trim() ?? '';
    if (trimmed.isEmpty) {
      return 'URLを入力してください';
    }
    final Uri? uri = Uri.tryParse(trimmed);
    if (uri == null || !uri.hasScheme || uri.host.isEmpty) {
      return '有効なURLを入力してください';
    }
    return null;
  }
}

class _CanvasHeader extends StatelessWidget {
  const _CanvasHeader({required this.controller});

  final DrawingController controller;

  @override
  Widget build(BuildContext context) {
    final Color activeColor = controller.mode == DrawingMode.pen
        ? const Color(0xff4a9eff)
        : controller.mode == DrawingMode.eraser
            ? const Color(0xfff97316)
            : controller.mode == DrawingMode.text
                ? const Color(0xff2dd4bf)
                : Colors.white60;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
      color: const Color(0xff111a23),
      child: Row(
        children: <Widget>[
          const Icon(Icons.brush, color: Colors.white70),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(
                'Canvas',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(color: Colors.white70),
              ),
              Text(
                _modeLabel(controller.mode),
                style: TextStyle(color: activeColor, fontSize: 12, fontWeight: FontWeight.bold),
              ),
            ],
          ),
          const Spacer(),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: const Color(0xff1d2633),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Row(
              children: <Widget>[
                const Icon(Icons.palette, size: 18, color: Colors.white60),
                const SizedBox(width: 8),
                Text(controller.penColor.value.toRadixString(16).padLeft(8, '0').toUpperCase()),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _modeLabel(DrawingMode mode) {
    switch (mode) {
      case DrawingMode.pen:
        return 'Drawing mode active';
      case DrawingMode.eraser:
        return 'Eraser mode active';
      case DrawingMode.text:
        return 'Text placement active';
      case DrawingMode.idle:
        return 'Select a tool to begin';
    }
  }
}

class _ColorSwatch extends StatelessWidget {
  const _ColorSwatch({
    required this.color,
    required this.isSelected,
    required this.onSelected,
    this.child,
  });

  final Color color;
  final bool isSelected;
  final VoidCallback onSelected;
  final Widget? child;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onSelected,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        width: 44,
        height: 44,
        decoration: BoxDecoration(
          color: child == null ? color : const Color(0xff1d2633),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isSelected ? const Color(0xff4a9eff) : const Color(0xff2b3645),
            width: isSelected ? 3 : 1,
          ),
        ),
        alignment: Alignment.center,
        child: child,
      ),
    );
  }
}

class _SliderTile extends StatelessWidget {
  const _SliderTile({
    required this.label,
    required this.value,
    required this.min,
    required this.max,
    required this.onChanged,
  });

  final String label;
  final double value;
  final double min;
  final double max;
  final ValueChanged<double> onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: <Widget>[
            Text(label, style: const TextStyle(color: Colors.white70)),
            Text('${value.toStringAsFixed(0)} px', style: const TextStyle(color: Colors.white54)),
          ],
        ),
        Slider(
          value: value,
          min: min,
          max: max,
          activeColor: const Color(0xff3b82f6),
          inactiveColor: const Color(0xff1f2937),
          onChanged: onChanged,
        ),
      ],
    );
  }
}
