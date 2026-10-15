/// App-wide configuration. The API base URL can be overridden at build/run
/// time with `--dart-define=API_BASE_URL=https://...`.
///
/// Defaults to the live backend; for a local one run with e.g.
/// `--dart-define=API_BASE_URL=http://localhost:8001/api` (plus
/// `adb reverse tcp:8001 tcp:8001` on a USB-connected phone).
class AppConfig {
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://jskbf.webitof.com/api',
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
