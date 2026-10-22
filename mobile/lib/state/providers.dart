import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';

import '../data/api_client.dart';
import '../data/portal_repository.dart';
import '../models/financial_year.dart';
import '../models/statement.dart';
import '../models/summary.dart';
import 'auth_controller.dart';

/// Dio client; reads the current token from the auth controller on each call,
/// and signs the session out when the server refuses that token.
final apiClientProvider = Provider<ApiClient>((ref) => buildApiClient(ref));

ApiClient buildApiClient(Ref ref, {String? baseUrl}) => ApiClient(
  baseUrl: baseUrl,
  tokenProvider: () => ref.read(authControllerProvider).token,
  onUnauthorized: (token) =>
      ref.read(authControllerProvider.notifier).expireSession(token),
);

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
  ledgerKey,
) async {
  final startYear = await _resolveStartYear(ref);
  return ref.watch(portalRepositoryProvider).statement(ledgerKey, startYear);
});

/// One entry on the Transactions tab: a passbook line plus its account.
class Transaction {
  final String ledgerKey;
  final String ledgerLabel;
  final String nature;
  final StatementLine line;
  const Transaction({
    required this.ledgerKey,
    required this.ledgerLabel,
    required this.nature,
    required this.line,
  });
}

/// All accounts' entries for the selected FY in one list, newest first
/// (opening-balance rows and zero lines left out).
final transactionsProvider = FutureProvider<List<Transaction>>((ref) async {
  final summary = await ref.watch(summaryProvider.future);
  final statements = await Future.wait([
    for (final p in summary.ledgers) ref.watch(statementProvider(p.key).future),
  ]);
  final list = <Transaction>[
    for (var i = 0; i < statements.length; i++)
      for (final line in statements[i].lines)
        if (!line.isOpening && (line.credit != 0 || line.debit != 0))
          Transaction(
            ledgerKey: summary.ledgers[i].key,
            ledgerLabel: summary.ledgers[i].label,
            nature: summary.ledgers[i].nature,
            line: line,
          ),
  ];
  list.sort((a, b) {
    final byDate = b.line.date.compareTo(a.line.date);
    return byDate != 0 ? byDate : b.line.voucherNo.compareTo(a.line.voucherNo);
  });
  return list;
});

/// The installed app's version, e.g. "1.0.0 (1)".
final appVersionLabelProvider = FutureProvider<String>((ref) async {
  final info = await PackageInfo.fromPlatform();
  return info.buildNumber.isEmpty
      ? info.version
      : '${info.version} (${info.buildNumber})';
});
