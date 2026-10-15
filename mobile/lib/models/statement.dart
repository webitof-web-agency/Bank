/// One line of a product passbook.
class StatementLine {
  final String date;
  final String voucherNo;
  final String particular;
  final double credit;
  final double debit;
  final double balance;
  final String nature;

  const StatementLine({
    required this.date,
    required this.voucherNo,
    required this.particular,
    required this.credit,
    required this.debit,
    required this.balance,
    required this.nature,
  });

  bool get isOpening => voucherNo.toLowerCase().contains('opening');

  factory StatementLine.fromJson(Map<String, dynamic> json) => StatementLine(
    date: (json['date'] ?? '').toString(),
    voucherNo: (json['voucherNo'] ?? '').toString(),
    particular: (json['particular'] ?? '').toString(),
    credit: (json['credit'] as num?)?.toDouble() ?? 0,
    debit: (json['debit'] as num?)?.toDouble() ?? 0,
    balance: (json['balance'] as num?)?.toDouble() ?? 0,
    nature: (json['nature'] ?? 'Cr').toString(),
  );
}

class Statement {
  final String fy;
  final String productKey;
  final String productLabel;
  final String nature;
  final List<StatementLine> lines;

  const Statement({
    required this.fy,
    required this.productKey,
    required this.productLabel,
    required this.nature,
    required this.lines,
  });

  factory Statement.fromJson(Map<String, dynamic> json) {
    final product = (json['product'] as Map<String, dynamic>?) ?? {};
    return Statement(
      fy: (json['fy'] ?? '').toString(),
      productKey: (product['key'] ?? '').toString(),
      productLabel: (product['label'] ?? '').toString(),
      nature: (product['nature'] ?? 'Cr').toString(),
      lines: ((json['lines'] as List?) ?? [])
          .map((e) => StatementLine.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}
