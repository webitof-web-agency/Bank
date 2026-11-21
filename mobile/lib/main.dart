import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/back_bridge/back_bridge.dart';
import 'core/theme.dart';
import 'models/branding.dart';
import 'screens/auth_gate.dart';
import 'shell/member_web_shell.dart';
import 'state/branding_controller.dart';

/// `--dart-define=NATIVE_APP=true` runs the full Flutter app on a phone
/// (development only); the released phone app is the web view shell.
const bool _nativeApp = bool.fromEnvironment('NATIVE_APP');

final GlobalKey<NavigatorState> _navigatorKey = GlobalKey<NavigatorState>();

void main() {
  // The phone app is a locked web view of the browser copy at /member
  // (MemberWebShell), so every app change ships with the website. The
  // browser copy itself is the full app below.
  if (!kIsWeb && !_nativeApp) {
    runApp(const MemberShellApp());
    return;
  }
  registerBackBridge(_navigatorKey);
  runApp(const ProviderScope(child: JilaMemberApp()));
}

class MemberShellApp extends StatelessWidget {
  const MemberShellApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Thrift RPR',
      debugShowCheckedModeBanner: false,
      theme: buildAppTheme(const BrandColors()),
      home: const MemberWebShell(),
    );
  }
}

class JilaMemberApp extends ConsumerWidget {
  const JilaMemberApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final branding = ref.watch(brandingProvider);
    return MaterialApp(
      title: 'Thrift RPR',
      debugShowCheckedModeBanner: false,
      navigatorKey: _navigatorKey,
      theme: buildAppTheme(branding.colors),
      home: const AuthGate(),
    );
  }
}
