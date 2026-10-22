import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/theme.dart';
import '../core/formatters.dart';
import '../state/providers.dart';
import '../widgets/async_view.dart';
import '../widgets/ledger_card.dart';
import '../widgets/page_list_view.dart';
import 'passbook_screen.dart';

class SummaryScreen extends ConsumerWidget {
  const SummaryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summary = ref.watch(summaryProvider);

    return AsyncView(
      value: summary,
      onRefresh: () async => ref.refresh(summaryProvider.future),
      data: (data) {
        return PageListView(
          children: [
            if (data.lastTransactionDate.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: 12, left: 4),
                child: Text(
                  'Last transaction: ${formatDate(data.lastTransactionDate)}',
                  style: TextStyle(color: AppColors.textMuted, fontSize: 13),
                ),
              ),
            if (data.ledgers.isEmpty)
              const Padding(
                padding: EdgeInsets.only(top: 64),
                child: Center(child: Text('No accounts for this year.')),
              ),
            // One column on a phone, two side by side on a wider screen.
            LayoutBuilder(
              builder: (context, box) {
                final columns = box.maxWidth >= 600 ? 2 : 1;
                final width = (box.maxWidth - 12 * (columns - 1)) / columns;
                return Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: [
                    for (final p in data.ledgers)
                      SizedBox(
                        width: width,
                        child: LedgerCard(
                          ledger: p,
                          onTap: () => Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => PassbookScreen(
                                ledgerKey: p.key,
                                ledgerLabel: p.label,
                              ),
                            ),
                          ),
                        ),
                      ),
                  ],
                );
              },
            ),
          ],
        );
      },
    );
  }
}
