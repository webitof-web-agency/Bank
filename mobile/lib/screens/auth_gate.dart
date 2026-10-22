import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../state/auth_controller.dart';
import '../core/config.dart';
import '../core/updater.dart';
import '../state/providers.dart';
import '../widgets/society_logo.dart';
import 'home_shell.dart';
import 'login_screen.dart';

/// Chooses the first screen from the restored auth state, and checks once
/// per launch whether a newer app version is published.
class AuthGate extends ConsumerStatefulWidget {
  const AuthGate({super.key});

  @override
  ConsumerState<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends ConsumerState<AuthGate> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        AppUpdater.checkOnce(context, ref.read(portalRepositoryProvider));
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    // Signed out (by hand or because the session expired): close any open
    // page (a passbook, Change password) so sign-in isn't hidden under it,
    // and say why when the server ended the session.
    ref.listen<AuthState>(authControllerProvider, (prev, next) {
      if (prev?.status != AuthStatus.authenticated ||
          next.status != AuthStatus.unauthenticated) {
        return;
      }
      Navigator.of(context).popUntil((route) => route.isFirst);
      final reason = next.error;
      if (reason != null) {
        ScaffoldMessenger.of(context)
          ..hideCurrentSnackBar()
          ..showSnackBar(SnackBar(content: Text(reason)));
      }
    });
    final status = ref.watch(authControllerProvider.select((s) => s.status));
    switch (status) {
      case AuthStatus.unknown:
        return const _Splash();
      case AuthStatus.authenticated:
        return const HomeShell();
      case AuthStatus.unauthenticated:
        return const LoginScreen();
    }
  }
}

class _Splash extends ConsumerWidget {
  const _Splash();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    const name = AppConfig.societyName; // built-in: shown before login
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SocietyLogo(size: 88),
              const SizedBox(height: 16),
              Text(
                name,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 24),
              const SizedBox(
                width: 24,
                height: 24,
                child: CircularProgressIndicator(strokeWidth: 2.5),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
