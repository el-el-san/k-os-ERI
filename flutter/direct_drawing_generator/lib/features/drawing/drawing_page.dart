import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_colorpicker/flutter_colorpicker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import 'package:share_plus/share_plus.dart';

import 'drawing_controller.dart';
import 'models/drawing_mode.dart';
import 'widgets/drawing_canvas.dart';

class DrawingPage extends StatefulWidget {
  const DrawingPage({super.key});

  @override
  State<DrawingPage> createState() => _DrawingPageState();
}

class _DrawingPageState extends State<DrawingPage> {
  late final DrawingController _controller;
  final TextEditingController _textController = TextEditingController();
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
  }

  @override
  void dispose() {
    _controller.dispose();
    _textController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider<DrawingController>.value(
      value: _controller,
      child: Consumer<DrawingController>(
        builder: (BuildContext context, DrawingController controller, _) {
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
                                child: _buildControlPanel(context, controller),
                              ),
                              const SizedBox(width: 16),
                              Expanded(child: _buildCanvasArea(context, controller)),
                            ],
                          )
                        : Column(
                            children: <Widget>[
                              Expanded(child: _buildCanvasArea(context, controller)),
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
    return SingleChildScrollView(
      child: Column(
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
      ),
    );
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
      final FilePickerResult? result = await FilePicker.platform.pickFiles(type: FileType.image);
      if (result == null || result.files.isEmpty || result.files.first.bytes == null) {
        return;
      }
      await _controller.loadReferenceImage(result.files.first.bytes!);
    } catch (error, stackTrace) {
      if (kDebugMode) {
        debugPrint('Failed to import image: $error\n$stackTrace');
      }
      _showSnackBar('Could not import image');
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
