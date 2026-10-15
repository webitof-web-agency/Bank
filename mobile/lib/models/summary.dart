/// One product row on the Summary screen: balance + interest for the FY.
class ProductSummary {
  final String key;
  final String label;
  final String nature; // 'Cr' | 'Dr'
  final double balance;
  final double interest;

  const ProductSummary({
    required this.key,
    required this.label,
    required this.nature,
    required this.balance,
    required this.interest,
  });

  factory ProductSummary.fromJson(Map<String, dynamic> json) => ProductSummary(
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
  final List<ProductSummary> products;

  const AccountSummary({
    required this.fy,
    required this.lastTransactionDate,
    required this.products,
  });

  factory AccountSummary.fromJson(Map<String, dynamic> json) => AccountSummary(
    fy: (json['fy'] ?? '').toString(),
    lastTransactionDate: (json['lastTransactionDate'] ?? '').toString(),
    products: ((json['products'] as List?) ?? [])
        .map((e) => ProductSummary.fromJson(e as Map<String, dynamic>))
        .toList(),
  );
}
