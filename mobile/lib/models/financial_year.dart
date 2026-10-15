/// One selectable financial year. The list is served by the backend (only the
/// years the account existed in); the app never lets the user type a year.
class FinancialYear {
  final String fy; // e.g. "2026-27"
  final int startYear; // 2026
  final bool current;

  const FinancialYear({
    required this.fy,
    required this.startYear,
    required this.current,
  });

  factory FinancialYear.fromJson(Map<String, dynamic> json) => FinancialYear(
    fy: (json['fy'] ?? '').toString(),
    startYear: int.tryParse('${json['startYear']}') ?? 0,
    current: json['current'] == true,
  );

  @override
  bool operator ==(Object other) =>
      other is FinancialYear && other.startYear == startYear;

  @override
  int get hashCode => startYear.hashCode;
}
