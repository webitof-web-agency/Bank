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
}
