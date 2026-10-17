/// One ledger row on the Summary screen: balance + interest for the FY.
class LedgerSummary {
  final String key;
  final String label;
  final String nature; // 'Cr' | 'Dr'
  final double balance;
  final double interest;

  const LedgerSummary({
    required this.key,
    required this.label,
    required this.nature,
    required this.balance,
    required this.interest,
  });

  factory LedgerSummary.fromJson(Map<String, dynamic> json) => LedgerSummary(
    key: (json['key'] ?? '').toString(),
    label: (json['label'] ?? '').toString(),
    nature: (json['nature'] ?? 'Cr').toString(),
    balance: (json['balance'] as num?)?.toDouble() ?? 0,
    interest: (json['interest'] as num?)?.toDouble() ?? 0,
  );
}

class AccountSummary {
  final String fy;
  final String lastTransactionDate;
  final List<LedgerSummary> ledgers;

  const AccountSummary({
    required this.fy,
    required this.lastTransactionDate,
    required this.ledgers,
  });

  factory AccountSummary.fromJson(Map<String, dynamic> json) => AccountSummary(
    fy: (json['fy'] ?? '').toString(),
    lastTransactionDate: (json['lastTransactionDate'] ?? '').toString(),
    ledgers:
        ((json['ledgers'] ?? json['products']) as List? ??
                []) // older backend: 'products'
            .map((e) => LedgerSummary.fromJson(e as Map<String, dynamic>))
            .toList(),
  );
}
