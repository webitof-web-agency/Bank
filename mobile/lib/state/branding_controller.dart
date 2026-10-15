import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/branding.dart';
import 'auth_controller.dart';
import 'providers.dart';

/// Society details + theme colours. Before sign-in everything comes from the
/// app itself (core/config.dart, bundled logo): nothing is read from the
/// server until the user logs in. Once signed in, the live Settings -> Society
/// Details / Branding are fetched; logging out goes back to the built-in ones.
class BrandingController extends StateNotifier<Branding> {
  BrandingController(this._ref) : super(const Branding()) {
    _ref.listen<AuthStatus>(authControllerProvider.select((s) => s.status), (
      _,
      status,
    ) {
      if (status == AuthStatus.authenticated) {
        refresh();
      } else if (status == AuthStatus.unauthenticated) {
        state = const Branding();
      }
    }, fireImmediately: true);
  }

  final Ref _ref;

  Future<void> refresh() async {
    try {
      final branding = await _ref.read(portalRepositoryProvider).appConfig();
      if (mounted) state = branding;
    } catch (_) {
      // Offline or server down: keep the built-in branding.
    }
  }
}

final brandingProvider = StateNotifierProvider<BrandingController, Branding>(
  (ref) => BrandingController(ref),
);
