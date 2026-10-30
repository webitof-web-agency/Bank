// The website's ledger page inside the app: a web view on Android / iOS, an
// <iframe> in the browser copy of the app.
export 'ledger_frame_io.dart'
    if (dart.library.js_interop) 'ledger_frame_web.dart';
