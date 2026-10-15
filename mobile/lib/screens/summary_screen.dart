import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/theme.dart';
import '../core/formatters.dart';
import '../state/providers.dart';
import '../widgets/async_view.dart';
import '../widgets/product_card.dart';
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
        return ListView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
          children: [
            if (data.lastTransactionDate.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: 12, left: 4),
                child: Text(
                  'Last transaction: ${formatDate(data.lastTransactionDate)}',
                  style: TextStyle(color: AppColors.textMuted, fontSize: 13),
                ),
              ),
            if (data.products.isEmpty)
              const Padding(
                padding: EdgeInsets.only(top: 64),
                child: Center(child: Text('No accounts for this year.')),
              ),
            for (final p in data.products)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: ProductCard(
                  product: p,
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => PassbookScreen(
                        productKey: p.key,
                        productLabel: p.label,
                      ),
                    ),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}
