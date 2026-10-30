import 'dart:ui_web' as ui_web;

import 'package:flutter/material.dart';
import 'package:web/web.dart' as web;

/// The ledger page in an <iframe> (the browser copy of the app runs on the
/// website itself, so the page is on the same site). Zoom with the page's
/// own controls or the browser's; the page's Rotate button turns the sheet.
class LedgerFrame extends StatefulWidget {
  final String url;
  const LedgerFrame({super.key, required this.url});

  @override
  State<LedgerFrame> createState() => _LedgerFrameState();
}

class _LedgerFrameState extends State<LedgerFrame> {
  static int _next = 0;
  late String _viewType;

  @override
  void initState() {
    super.initState();
    _register();
  }

  @override
  void didUpdateWidget(covariant LedgerFrame oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.url != widget.url) setState(_register);
  }

  // One view type per URL: a new ticket gets a new frame.
  void _register() {
    _viewType = 'ledger-frame-${_next++}';
    final url = widget.url;
    ui_web.platformViewRegistry.registerViewFactory(_viewType, (int _) {
      return web.HTMLIFrameElement()
        ..src = url
        ..style.border = 'none'
        ..style.width = '100%'
        ..style.height = '100%'
        ..allow = 'fullscreen';
    });
  }

  @override
  Widget build(BuildContext context) => HtmlElementView(viewType: _viewType);
}
