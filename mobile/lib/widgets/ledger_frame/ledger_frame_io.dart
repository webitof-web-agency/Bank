import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

/// The ledger page in a web view. Pinch to zoom; the page's own Rotate
/// button turns the sheet for an upright phone.
class LedgerFrame extends StatefulWidget {
  final String url;
  const LedgerFrame({super.key, required this.url});

  @override
  State<LedgerFrame> createState() => _LedgerFrameState();
}

class _LedgerFrameState extends State<LedgerFrame> {
  late final WebViewController _controller = WebViewController()
    ..setJavaScriptMode(JavaScriptMode.unrestricted)
    ..enableZoom(true)
    ..setNavigationDelegate(
      NavigationDelegate(
        onPageFinished: (_) {
          if (mounted) setState(() => _loading = false);
        },
      ),
    )
    ..loadRequest(Uri.parse(widget.url));
  bool _loading = true;

  @override
  void didUpdateWidget(covariant LedgerFrame oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.url != widget.url) {
      _loading = true;
      _controller.loadRequest(Uri.parse(widget.url));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        WebViewWidget(
          controller: _controller,
          // Pinch and scroll go to the page, not the app around it.
          gestureRecognizers: {
            Factory<EagerGestureRecognizer>(EagerGestureRecognizer.new),
          },
        ),
        if (_loading) const Center(child: CircularProgressIndicator()),
      ],
    );
  }
}
