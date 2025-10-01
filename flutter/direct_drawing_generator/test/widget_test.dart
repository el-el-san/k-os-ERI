import 'dart:ui' as ui;

import 'package:direct_drawing_generator/app.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() {
    // Mock SharedPreferences to ensure that the async operations complete
    // synchronously in a test environment.
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('renders drawing page', (WidgetTester tester) async {
    tester.view.physicalSize = const ui.Size(1280, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    await tester.pumpWidget(const DirectDrawingApp());

    // The first frame should show a loading indicator.
    expect(find.byType(CircularProgressIndicator), findsOneWidget);

    // Settle the UI. Because SharedPreferences is mocked, this will now
    // complete without timing out.
    await tester.pumpAndSettle();

    // The loading indicator should be gone, and the main UI visible.
    expect(find.byType(CircularProgressIndicator), findsNothing);
    expect(find.text('Direct Drawing Generator'), findsOneWidget);
  });
}
