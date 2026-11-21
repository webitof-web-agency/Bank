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

/// The website's ledger page for [ticket]: in the web copy (served by the
/// website itself) on this same site; in the phone app on [webUrl], the
/// website address the server reports. '' when there is none.
String ledgerPageUrl({
  required String ticket,
  required String webUrl,
  required bool isWeb,
  required Uri page,
}) {
  final base = isWeb ? page.origin : webUrl.replaceAll(RegExp(r'/+$'), '');
  if (base.isEmpty || ticket.isEmpty) return '';
  return '$base/ledger-view?ticket=${Uri.encodeQueryComponent(ticket)}';
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

/// The phone app is a locked web view of the browser copy of the app at
/// [memberAppUrl] (frontend/public/member), so app changes ship with the
/// website and need no new APK. `--dart-define=MEMBER_APP_URL=...` points it
/// elsewhere (e.g. a local site through `adb reverse`).
const String memberAppUrl = String.fromEnvironment(
  'MEMBER_APP_URL',
  defaultValue: 'https://thriftrpr.in/member/',
);

/// Whether the shell may open [target]: only the member app and the ledger
/// page it embeds, on the member app's own site. Every other page (the staff
/// website, other sites, tel:/mailto:) stays out of the app.
bool isMemberAppUrl(Uri target, {required Uri home}) {
  if (target.toString() == 'about:blank') return true;
  if (target.scheme != home.scheme || target.authority != home.authority) {
    return false;
  }
  final base = home.path.endsWith('/') ? home.path : '${home.path}/';
  final path = target.path.isEmpty ? '/' : target.path;
  return path == base.substring(0, base.length - 1) ||
      path.startsWith(base) ||
      path == '/ledger-view' ||
      path.startsWith('/ledger-view/');
}
