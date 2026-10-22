// On a wide (desktop / tablet) screen a transaction's amount sits at the
// card's right edge, not in the middle of it.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jila_member_app/models/statement.dart';
import 'package:jila_member_app/screens/transactions_screen.dart';
import 'package:jila_member_app/state/providers.dart';

void main() {
  testWidgets('the amount is right-aligned in a wide transaction card', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1200, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          transactionsProvider.overrideWith(
            (ref) async => const [
              Transaction(
                ledgerKey: 'specialDeposit',
                ledgerLabel: 'Special Saving A/c',
                nature: 'Cr',
                line: StatementLine(
                  date: '2026-07-31',
                  voucherNo: '704',
                  particular: '',
                  credit: 500,
                  debit: 0,
                  balance: 19298,
                  nature: 'Cr',
                ),
              ),
            ],
          ),
        ],
        child: const MaterialApp(home: Scaffold(body: TransactionsScreen())),
      ),
    );
    await tester.pumpAndSettle();

    final amount = find.textContaining('500.00');
    final card = find.ancestor(of: amount, matching: find.byType(Card));
    final gap = tester.getRect(card).right - tester.getRect(amount).right;
    // The card's own padding, not half its width.
    expect(gap, lessThan(40));
  });
}
