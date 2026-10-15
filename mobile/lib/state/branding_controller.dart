import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/branding.dart';
import 'providers.dart';

/// Society details + theme colours. Starts from the copy saved on the last
/// launch (so the name and colours show at once, even offline), then fetches
/// the current ones from the server and saves them.
class BrandingController extends StateNotifier<Branding> {
  BrandingController(this._ref) : super(const Branding()) {
    _load();
  }

  final Ref _ref;
  static const _cacheKey = 'app_branding_v1';

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final cached = prefs.getString(_cacheKey);
    if (cached != null) {
      try {
        // The cached logo link's token has expired; keep everything else.
        final branding = Branding.fromJson(
          jsonDecode(cached) as Map<String, dynamic>,
        );
        if (mounted) state = branding;
      } catch (_) {
        /* stale cache shape: ignore */
      }
    }
    await refresh();
  }

  Future<void> refresh() async {
    try {
      final branding = await _ref.read(portalRepositoryProvider).appConfig();
      if (!mounted) return;
      state = branding;
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_cacheKey, jsonEncode(branding.toJson()));
    } catch (_) {
      // Offline or server down: keep the cached/default branding.
    }
  }
}

final brandingProvider = StateNotifierProvider<BrandingController, Branding>(
  (ref) => BrandingController(ref),
);
