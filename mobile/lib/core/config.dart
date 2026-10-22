import 'package:flutter/foundation.dart';

const String _liveApiBaseUrl = 'https://api.thriftrpr.in/api';

/// The API the app talks to:
/// - [defined] (`--dart-define=API_BASE_URL=...`) when set, always;
/// - in a browser opened from a local site (Vite on localhost), that site's
///   own `/api`, which Vite forwards to the local backend: a local copy of
///   the website never reaches the live one;
/// - otherwise the live backend.
String resolveApiBaseUrl({
  required String defined,
  required bool isWeb,
  required Uri page,
}) {
  if (defined.isNotEmpty) return defined;
  const localHosts = {'localhost', '127.0.0.1', '::1'};
  if (isWeb && localHosts.contains(page.host)) return '${page.origin}/api';
  return _liveApiBaseUrl;
}

/// App-wide configuration. See [resolveApiBaseUrl] for the API; for the
/// phone against a local backend run with e.g.
/// `--dart-define=API_BASE_URL=http://localhost:8001/api` (plus
/// `adb reverse tcp:8001 tcp:8001` on a USB-connected phone).
class AppConfig {
  static final String apiBaseUrl = resolveApiBaseUrl(
    defined: const String.fromEnvironment('API_BASE_URL'),
    isWeb: kIsWeb,
    page: Uri.base,
  );

  // Shown before sign-in (login + splash), so nothing is read from the
  // server until the user logs in. After login the live Society Details
  // (Settings) replace these on the profile and header.
  static const String societyName =
      'The Raipur Co-operative Employees Thrift Society Ltd.';
  static const String societyShortName = 'RCETSL';
  static const String societyRegNo = 'CG/RPR/CS/00417';
  static const String societyAddress =
      'JILA SAHKARI KENDRIYA BANK RAIPUR COMPOUND, G.E. Road Raipur (C.G.)';

  /// The society logo bundled with the app (not the uploaded one).
  static const String logoAsset = 'assets/logo.png';
}
