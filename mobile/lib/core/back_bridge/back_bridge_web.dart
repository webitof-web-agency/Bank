import 'dart:js_interop';

import 'package:flutter/widgets.dart';

@JS('thriftrprBack')
external set _thriftrprBack(JSFunction value);

/// window.thriftrprBack() closes the top page / dialog of [navigatorKey]
/// and returns true, or returns false on the first screen (the shell then
/// closes the app). Plain Navigator.push adds no browser history, so the web
/// view's own goBack() can't do this.
void registerBackBridge(GlobalKey<NavigatorState> navigatorKey) {
  _thriftrprBack = (() {
    final navigator = navigatorKey.currentState;
    if (navigator == null || !navigator.canPop()) return false;
    navigator.maybePop();
    return true;
  }).toJS;
}
