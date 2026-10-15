import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/theme.dart';
import 'screens/auth_gate.dart';
import 'state/branding_controller.dart';

void main() {
  runApp(const ProviderScope(child: JilaMemberApp()));
}

class JilaMemberApp extends ConsumerWidget {
  const JilaMemberApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final branding = ref.watch(brandingProvider);
    return MaterialApp(
      title: 'Thrift RPR',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(branding.colors),
      home: const AuthGate(),
    );
  }
}
