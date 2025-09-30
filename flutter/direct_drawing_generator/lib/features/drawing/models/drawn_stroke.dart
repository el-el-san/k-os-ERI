import 'dart:ui';

class DrawnStroke {
  DrawnStroke({
    required this.points,
    required this.color,
    required this.strokeWidth,
    this.blendMode = BlendMode.srcOver,
  });

  final List<Offset> points;
  final Color color;
  final double strokeWidth;
  final BlendMode blendMode;

  bool get isDrawable => points.length > 1;
}
