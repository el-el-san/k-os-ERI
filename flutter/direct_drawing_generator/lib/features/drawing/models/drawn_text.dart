import 'dart:ui';

class DrawnText {
  DrawnText({
    required this.text,
    required this.position,
    required this.color,
    required this.fontSize,
  });

  final String text;
  final Offset position;
  final Color color;
  final double fontSize;
}
