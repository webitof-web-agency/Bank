import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/formatters.dart';
import '../core/theme.dart';
import '../state/providers.dart';
import '../widgets/async_view.dart';
import '../widgets/page_list_view.dart';

/// Every entry of the selected FY across all accounts, newest first and
/// grouped by date: what was deposited, deducted or repaid, and to which
/// account. (Summary shows the balances; a ledger's passbook opens from
/// there.)
class TransactionsScreen extends ConsumerWidget {
  const TransactionsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final txns = ref.watch(transactionsProvider);

    return AsyncView(
      value: txns,
      onRefresh: () async => ref.refresh(transactionsProvider.future),
      data: (list) {
        if (list.isEmpty) {
          return ListView(
            children: const [
              SizedBox(height: 120),
              Center(
                child: Text(
                  'No transactions in this year.',
                  style: TextStyle(color: AppColors.textMuted),
                ),
              ),
            ],
          );
        }
        final totalIn = list.fold<double>(0, (sum, t) => sum + t.line.credit);
        final totalOut = list.fold<double>(0, (sum, t) => sum + t.line.debit);

        final children = <Widget>[
          _Totals(count: list.length, totalIn: totalIn, totalOut: totalOut),
          const SizedBox(height: 8),
        ];
        String? lastDate;
        for (final t in list) {
          if (t.line.date != lastDate) {
            lastDate = t.line.date;
            children.add(
              Padding(
                padding: const EdgeInsets.fromLTRB(4, 14, 4, 6),
                child: Text(
                  formatDate(t.line.date),
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textMuted,
                  ),
                ),
              ),
            );
          }
          children.add(
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _TxnTile(txn: t),
            ),
          );
        }
        return PageListView(children: children);
      },
    );
  }
}

class _Totals extends StatelessWidget {
  const _Totals({
    required this.count,
    required this.totalIn,
    required this.totalOut,
  });

  final int count;
  final double totalIn;
  final double totalOut;

  @override
  Widget build(BuildContext context) {
    // Credited / Debited each get half the width (entries move to the
    // heading), and shrink to fit so crore-size totals stay on one line.
    Widget amount(String label, double value, Color color, IconData icon) =>
        Expanded(
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.06),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(icon, size: 14, color: color),
                    const SizedBox(width: 4),
                    Text(
                      label,
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.textMuted,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text(
                    formatMoney(value.roundToDouble()).replaceAll('.00', ''),
                    maxLines: 1,
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: color,
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '$count ${count == 1 ? 'entry' : 'entries'} this year',
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppColors.textMain,
              ),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                amount('Credited', totalIn, AppColors.credit, Icons.south_west),
                const SizedBox(width: 10),
                amount('Debited', totalOut, AppColors.debit, Icons.north_east),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _TxnTile extends StatelessWidget {
  const _TxnTile({required this.txn});
  final Transaction txn;

  @override
  Widget build(BuildContext context) {
    final line = txn.line;
    final isCredit = line.credit != 0;
    final amount = isCredit ? line.credit : line.debit;
    final color = isCredit ? AppColors.credit : AppColors.debit;
    final isLoan = txn.nature.toUpperCase() == 'DR';
    final detail = [
      if (line.particular.isNotEmpty) line.particular,
      if (line.voucherNo.isNotEmpty) 'Vch ${line.voucherNo}',
    ].join('  ·  ');

    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: (isLoan ? AppColors.debit : AppColors.credit).withValues(
                  alpha: 0.12,
                ),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(
                isLoan
                    ? Icons.account_balance_wallet_outlined
                    : Icons.savings_outlined,
                size: 20,
                color: isLoan ? AppColors.debit : AppColors.credit,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    txn.ledgerLabel,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  if (detail.isNotEmpty) ...[
                    const SizedBox(height: 3),
                    Text(
                      detail,
                      style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.textMuted,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 8),
            // Amounts shrink to fit instead of pushing the account name onto
            // a second line, and keep to the card's right edge however wide
            // it is (Align fills the slot; FittedBox alone hugs its left).
            Flexible(
              child: Align(
                alignment: Alignment.centerRight,
                child: FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerRight,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        '${isCredit ? '+' : '−'} ${formatMoney(amount)}',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: color,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        'Bal ${formatMoneyCrDr(line.balance, nature: line.nature)}',
                        style: const TextStyle(
                          fontSize: 11,
                          color: AppColors.textMuted,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
