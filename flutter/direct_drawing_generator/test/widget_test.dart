import 'dart:ui' as ui;

import 'package:direct_drawing_generator/app.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('renders drawing page', (WidgetTester tester) async {
    tester.view.physicalSize = const ui.Size(1280, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    await tester.pumpWidget(const DirectDrawingApp());
    await tester.pumpAndSettle();

    expect(find.text('Direct Drawing Generator'), findsOneWidget);
  });
}
