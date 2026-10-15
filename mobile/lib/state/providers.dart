import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/api_client.dart';
import '../data/portal_repository.dart';
import '../models/financial_year.dart';
import '../models/statement.dart';
import '../models/summary.dart';
import 'auth_controller.dart';

/// Dio client; reads the current token from the auth controller on each call.
final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(tokenProvider: () => ref.read(authControllerProvider).token);
});

final portalRepositoryProvider = Provider<PortalRepository>((ref) {
  return PortalRepository(ref.watch(apiClientProvider));
});

final authControllerProvider = StateNotifierProvider<AuthController, AuthState>(
  (ref) {
    return AuthController(ref);
  },
);

/// FY list for the logged-in account (only the years they existed in).
final financialYearsProvider = FutureProvider<List<FinancialYear>>((ref) async {
  // Re-fetch when the account changes.
  ref.watch(authControllerProvider.select((s) => s.account?.code));
  return ref.watch(portalRepositoryProvider).financialYears();
});

/// The FY the user picked in the header. Null until the list loads; screens
/// fall back to the current FY via [_resolveStartYear].
final selectedFyProvider = StateProvider<FinancialYear?>((ref) {
  // A new login starts again on its own current FY.
  ref.watch(authControllerProvider.select((s) => s.account?.code));
  return null;
});

/// The default FY for an account (current, else first).
FinancialYear? defaultFy(List<FinancialYear> years) {
  if (years.isEmpty) return null;
  return years.firstWhere((y) => y.current, orElse: () => years.first);
}

Future<int> _resolveStartYear(Ref ref) async {
  final fy = ref.watch(selectedFyProvider);
  if (fy != null) return fy.startYear;
  final years = await ref.watch(financialYearsProvider.future);
  final fallback = defaultFy(years);
  return fallback?.startYear ?? 0;
}

final profileProvider = FutureProvider((ref) async {
  ref.watch(authControllerProvider.select((s) => s.account?.code));
  return ref.watch(portalRepositoryProvider).profile();
});

final summaryProvider = FutureProvider<AccountSummary>((ref) async {
  final startYear = await _resolveStartYear(ref);
  return ref.watch(portalRepositoryProvider).summary(startYear);
});

final statementProvider = FutureProvider.family<Statement, String>((
  ref,
  productKey,
) async {
  final startYear = await _resolveStartYear(ref);
  return ref.watch(portalRepositoryProvider).statement(productKey, startYear);
});

/// One entry on the Transactions tab: a passbook line plus its account.
class Transaction {
  final String productKey;
  final String productLabel;
  final String nature;
  final StatementLine line;
  const Transaction({
    required this.productKey,
    required this.productLabel,
    required this.nature,
    required this.line,
  });
}

/// All accounts' entries for the selected FY in one list, newest first
/// (opening-balance rows and zero lines left out).
final transactionsProvider = FutureProvider<List<Transaction>>((ref) async {
  final summary = await ref.watch(summaryProvider.future);
  final statements = await Future.wait([
    for (final p in summary.products)
      ref.watch(statementProvider(p.key).future),
  ]);
  final list = <Transaction>[
    for (var i = 0; i < statements.length; i++)
      for (final line in statements[i].lines)
        if (!line.isOpening && (line.credit != 0 || line.debit != 0))
          Transaction(
            productKey: summary.products[i].key,
            productLabel: summary.products[i].label,
            nature: summary.products[i].nature,
            line: line,
          ),
  ];
  list.sort((a, b) {
    final byDate = b.line.date.compareTo(a.line.date);
    return byDate != 0 ? byDate : b.line.voucherNo.compareTo(a.line.voucherNo);
  });
  return list;
});
