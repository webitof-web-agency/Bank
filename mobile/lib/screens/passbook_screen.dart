import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/formatters.dart';
import '../core/theme.dart';
import '../models/statement.dart';
import '../state/providers.dart';
import '../widgets/async_view.dart';

/// A product passbook: one card per transaction (no horizontal scrolling, the
/// bug the legacy table had on phones), newest first, with a running balance.
class PassbookScreen extends ConsumerWidget {
  const PassbookScreen({
    super.key,
    required this.productKey,
    required this.productLabel,
  });

  final String productKey;
  final String productLabel;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final statement = ref.watch(statementProvider(productKey));

    return Scaffold(
      appBar: AppBar(title: Text(productLabel)),
      body: AsyncView(
        value: statement,
        onRefresh: () async =>
            ref.refresh(statementProvider(productKey).future),
        data: (data) {
          if (data.lines.isEmpty) {
            return const Center(child: Text('No transactions for this year.'));
          }
          final lines = data.lines.reversed.toList(); // newest first
          final closing = data.lines.last;
          return Column(
            children: [
              _ClosingHeader(line: closing, fy: data.fy),
              Expanded(
                child: ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: lines.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 8),
                  itemBuilder: (_, i) => _TxnCard(line: lines[i]),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _ClosingHeader extends StatelessWidget {
  const _ClosingHeader({required this.line, required this.fy});
  final StatementLine line;
  final String fy;

  @override
  Widget build(BuildContext context) {
    final isLoan = line.nature.toUpperCase() == 'DR';
    final accent = isLoan ? AppColors.debit : AppColors.credit;
    return Container(
      width: double.infinity,
      color: Colors.white,
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Closing balance · FY $fy',
                style: TextStyle(color: AppColors.textMuted, fontSize: 13),
              ),
              const SizedBox(height: 4),
              Text(
                formatMoneyCrDr(line.balance, nature: line.nature),
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: accent,
                ),
              ),
            ],
          ),
          Icon(isLoan ? Icons.trending_down : Icons.trending_up, color: accent),
        ],
      ),
    );
  }
}

class _TxnCard extends StatelessWidget {
  const _TxnCard({required this.line});
  final StatementLine line;

  @override
  Widget build(BuildContext context) {
    final hasCredit = line.credit != 0;
    final amount = hasCredit ? line.credit : line.debit;
    final amountColor = hasCredit ? AppColors.credit : AppColors.debit;
    final label = line.isOpening
        ? 'Opening Balance'
        : (line.particular.isNotEmpty
              ? line.particular
              : 'Voucher ${line.voucherNo}');

    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    [
                      if (line.date.isNotEmpty) formatDate(line.date),
                      if (!line.isOpening && line.voucherNo.isNotEmpty)
                        'Vch ${line.voucherNo}',
                    ].join('  ·  '),
                    style: TextStyle(fontSize: 12, color: AppColors.textMuted),
                  ),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                if (!line.isOpening && amount != 0)
                  Text(
                    '${hasCredit ? '+' : '−'} ${formatMoney(amount)}',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: amountColor,
                    ),
                  ),
                const SizedBox(height: 2),
                Text(
                  'Bal ${formatMoneyCrDr(line.balance, nature: line.nature)}',
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade700),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
