import 'package:flutter/material.dart';

import 'features/drawing/drawing_page.dart';

class DirectDrawingApp extends StatelessWidget {
  const DirectDrawingApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Direct Drawing Generator',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        colorScheme: const ColorScheme.dark(
          primary: Color(0xff4a9eff),
          secondary: Color(0xff00d4aa),
          surface: Color(0xff1b2430),
        ),
        scaffoldBackgroundColor: const Color(0xff0f141b),
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xff1b2430),
          foregroundColor: Colors.white,
          elevation: 4,
        ),
        snackBarTheme: const SnackBarThemeData(
          backgroundColor: Color(0xff1b2430),
          contentTextStyle: TextStyle(color: Colors.white),
        ),
        sliderTheme: SliderThemeData(
          trackHeight: 4,
          valueIndicatorColor: Colors.blueGrey.shade900,
        ),
      ),
      home: const DrawingPage(),
    );
  }
}
