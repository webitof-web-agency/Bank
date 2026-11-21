// Lets the phone app's web view shell drive the phone's Back button inside
// the browser copy of the app: the copy registers window.thriftrprBack(),
// which closes the open page or dialog. No-op outside a browser.
export 'back_bridge_stub.dart'
    if (dart.library.js_interop) 'back_bridge_web.dart';
