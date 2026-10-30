import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/config.dart';
import '../core/theme.dart';
import '../state/branding_controller.dart';
import '../state/providers.dart';
import '../widgets/ledger_frame/ledger_frame.dart';

/// Ledger tab: the same ledger the website prints (member or employee), for
/// the FY picked in the header, opened from the website with a short-lived
/// ticket. Zoom by pinching or with the page's buttons; Rotate turns it to
/// landscape on an upright phone.
class LedgerScreen extends ConsumerWidget {
  const LedgerScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ticketAsync = ref.watch(ledgerTicketProvider);
    final webUrl = ref.watch(brandingProvider.select((b) => b.webUrl));

    return ticketAsync.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (error, _) => _Message(
        text: 'The ledger could not be opened.\n$error',
        onRetry: () => ref.invalidate(ledgerTicketProvider),
      ),
      data: (ticket) {
        final url = ledgerPageUrl(
          ticket: ticket,
          webUrl: webUrl,
          isWeb: kIsWeb,
          page: Uri.base,
        );
        if (url.isEmpty) {
          return _Message(
            text:
                'The ledger page is not available yet. Please try again later.',
            onRetry: () => ref.invalidate(ledgerTicketProvider),
          );
        }
        return LedgerFrame(key: ValueKey(url), url: url);
      },
    );
  }
}

class _Message extends StatelessWidget {
  final String text;
  final VoidCallback onRetry;
  const _Message({required this.text, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              text,
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.textMuted),
            ),
            const SizedBox(height: 12),
            OutlinedButton(onPressed: onRetry, child: const Text('Try again')),
          ],
        ),
      ),
    );
  }
}
