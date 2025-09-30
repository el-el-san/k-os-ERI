import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../drawing_controller.dart';
import '../models/drawn_stroke.dart';
import '../models/drawn_text.dart';
import '../models/drawing_mode.dart';

class DrawingCanvas extends StatelessWidget {
  const DrawingCanvas({
    super.key,
    required this.controller,
    required this.repaintKey,
    this.onTextPlacement,
  });

  final DrawingController controller;
  final GlobalKey repaintKey;
  final ValueChanged<Offset>? onTextPlacement;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (BuildContext context, _) {
        return GestureDetector(
          behavior: HitTestBehavior.opaque,
          onPanStart: (DragStartDetails details) {
            if (controller.mode == DrawingMode.pen || controller.mode == DrawingMode.eraser) {
              controller.startStroke(details.localPosition);
            }
          },
          onPanUpdate: (DragUpdateDetails details) {
            controller.appendPoint(details.localPosition);
          },
          onPanEnd: (_) => controller.endStroke(),
          onPanCancel: controller.endStroke,
          onTapDown: (TapDownDetails details) {
            if (controller.mode == DrawingMode.text) {
              onTextPlacement?.call(details.localPosition);
            }
          },
          child: RepaintBoundary(
            key: repaintKey,
            child: CustomPaint(
              painter: _CanvasPainter(
                referenceImage: controller.referenceImage,
                strokes: controller.strokes,
                texts: controller.texts,
              ),
              size: Size.infinite,
            ),
          ),
        );
      },
    );
  }
}

class _CanvasPainter extends CustomPainter {
  _CanvasPainter({
    required this.referenceImage,
    required this.strokes,
    required this.texts,
  });

  final ui.Image? referenceImage;
  final List<DrawnStroke> strokes;
  final List<DrawnText> texts;

  @override
  void paint(Canvas canvas, Size size) {
    final Paint backgroundPaint = Paint()..color = const Color(0xff101010);
    canvas.drawRect(Offset.zero & size, backgroundPaint);

    if (referenceImage != null) {
      paintImage(
        canvas: canvas,
        image: referenceImage!,
        rect: Offset.zero & size,
        fit: BoxFit.contain,
        alignment: Alignment.center,
      );
    }

    for (final DrawnStroke stroke in strokes) {
      if (!stroke.isDrawable && stroke.blendMode != BlendMode.clear) {
        continue;
      }
      final Paint paint = Paint()
        ..color = stroke.color
        ..strokeWidth = stroke.strokeWidth
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round
        ..blendMode = stroke.blendMode
        ..isAntiAlias = true;

      if (stroke.points.length == 1) {
        canvas.drawPoints(ui.PointMode.points, stroke.points, paint);
        continue;
      }

      final Path path = Path();
      path.moveTo(stroke.points.first.dx, stroke.points.first.dy);
      for (final Offset point in stroke.points.skip(1)) {
        path.lineTo(point.dx, point.dy);
      }
      canvas.drawPath(path, paint);
    }

    for (final DrawnText entry in texts) {
      final TextPainter textPainter = TextPainter(
        text: TextSpan(
          text: entry.text,
          style: TextStyle(
            color: entry.color,
            fontSize: entry.fontSize,
            fontWeight: FontWeight.w600,
          ),
        ),
        textAlign: TextAlign.center,
        textDirection: TextDirection.ltr,
      )..layout(maxWidth: size.width - 16);

      final Offset anchor = entry.position - Offset(textPainter.width / 2, textPainter.height / 2);
      textPainter.paint(canvas, anchor);
    }
  }

  @override
  bool shouldRepaint(covariant _CanvasPainter oldDelegate) {
    return true;
  }
}
