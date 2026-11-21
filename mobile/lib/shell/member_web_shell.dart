import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

import '../core/config.dart';

/// The phone app: a full-screen web view of the browser copy of the member
/// app ([memberAppUrl]), locked to it. Sign-in, balances, passbooks, ledger,
/// profile and Change password all come from the website, so app changes
/// ship with a website deploy instead of a new APK.
class MemberWebShell extends StatefulWidget {
  const MemberWebShell({super.key});

  @override
  State<MemberWebShell> createState() => _MemberWebShellState();
}

class _MemberWebShellState extends State<MemberWebShell> {
  static final Uri _home = Uri.parse(memberAppUrl);
  static const Color _background = Color(0xFFF8FAFC); // the page's own

  late final WebViewController _controller;
  bool _loading = true;
  bool _offline = false;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(_background)
      // The page lays itself out for the phone; zooming it only gets in
      // the way (the ledger sheet has its own zoom).
      ..enableZoom(false)
      ..setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: (request) {
            final target = Uri.tryParse(request.url);
            final allowed = target != null && isMemberAppUrl(target, home: _home);
            return allowed ? NavigationDecision.navigate : NavigationDecision.prevent;
          },
          onPageStarted: (_) {
            if (mounted) setState(() => _loading = true);
          },
          onPageFinished: (_) {
            if (mounted) setState(() => _loading = false);
          },
          onWebResourceError: (error) {
            if (error.isForMainFrame != true || !mounted) return;
            setState(() {
              _offline = true;
              _loading = false;
            });
          },
        ),
      )
      ..loadRequest(_home);
    final platform = _controller.platform;
    if (platform is AndroidWebViewController) {
      // Android applies the phone's font size to web pages (textZoom). Flutter
      // web then reads its 9999px text-spacing probe as ~11000px and lays the
      // whole app out with giant letter / line spacing: only images showed.
      platform.setTextZoom(100);
      // Debug builds: the page can be inspected from desktop Chrome
      // (chrome://inspect). Never in release.
      if (kDebugMode) AndroidWebViewController.enableDebugging(true);
    }
  }

  void _retry() {
    setState(() {
      _offline = false;
      _loading = true;
    });
    _controller.loadRequest(_home);
  }

  /// Back closes the page's open screen or dialog (window.thriftrprBack, set
  /// by the browser copy); on its first screen it closes the app.
  Future<void> _handleBack() async {
    if (!_offline) {
      try {
        final closed = await _controller.runJavaScriptReturningResult(
          'window.thriftrprBack ? (window.thriftrprBack() ? 1 : 0) : 0',
        );
        if (closed.toString() == '1' || closed == true) return;
      } catch (_) {
        // Page not ready: fall through.
      }
      if (await _controller.canGoBack()) {
        await _controller.goBack();
        return;
      }
    }
    await SystemNavigator.pop();
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _handleBack();
      },
      child: Scaffold(
        backgroundColor: _background,
        body: SafeArea(
          child: _offline
              ? _OfflineView(onRetry: _retry)
              : Stack(
                  children: [
                    WebViewWidget(controller: _controller),
                    if (_loading) const Center(child: CircularProgressIndicator()),
                  ],
                ),
        ),
      ),
    );
  }
}

class _OfflineView extends StatelessWidget {
  final VoidCallback onRetry;
  const _OfflineView({required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.wifi_off_rounded, size: 56, color: Colors.black45),
            const SizedBox(height: 16),
            Text(
              'Could not open Thrift RPR',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            const Text(
              'Check the internet connection and try again.',
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('Try again'),
            ),
          ],
        ),
      ),
    );
  }
}
