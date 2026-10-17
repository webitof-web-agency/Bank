import '../core/formatters.dart';

/// The logged-in account — a member or an employee.
class Account {
  final String type; // 'member' | 'employee'
  final String code;
  final String name;

  const Account({required this.type, required this.code, required this.name});

  bool get isEmployee => type == 'employee';

  factory Account.fromJson(Map<String, dynamic> json) => Account(
    type: (json['type'] ?? 'member').toString(),
    code: (json['code'] ?? '').toString(),
    name: (json['name'] ?? '').toString(),
  );
}

/// One labelled value on the Profile screen.
class ProfileField {
  final String label;
  final String value;
  const ProfileField(this.label, this.value);
}

/// Full profile shown on the Profile screen, already grouped into sections.
/// Fields differ a little between a member and an employee; empty ones are
/// left out.
class Profile {
  final String type;
  final String name;
  final String code;
  final String mobileNo;
  final String status;
  final String designation;
  final String branch;

  /// The year the account started (membership / appointment), e.g. "1984".
  final String sinceYear;
  final List<ProfileField> personal;
  final List<ProfileField> membership;

  const Profile({
    required this.type,
    required this.name,
    required this.code,
    required this.mobileNo,
    required this.status,
    required this.designation,
    required this.branch,
    required this.sinceYear,
    required this.personal,
    required this.membership,
  });

  bool get isEmployee => type == 'employee';

  /// "SHIVESH KUMAR MISHRA" -> "SM"; titles like SMT./SHRI are skipped.
  String get initials {
    final words = name
        .split(RegExp(r'[\s.]+'))
        .where((w) => w.isNotEmpty)
        .where(
          (w) => !const {
            'SMT',
            'SHRI',
            'MR',
            'MRS',
            'KU',
            'DR',
          }.contains(w.toUpperCase()),
        )
        .toList();
    if (words.isEmpty) return '?';
    final first = words.first[0];
    final last = words.length > 1 ? words.last[0] : '';
    return (first + last).toUpperCase();
  }

  factory Profile.fromJson(Map<String, dynamic> json) {
    String s(String k) => (json[k] ?? '').toString().trim();
    List<ProfileField> fields(List<(String, String, bool)> spec) => [
      for (final (label, key, isDate) in spec)
        if ((isDate ? formatDate(s(key)) : s(key)).isNotEmpty)
          ProfileField(label, isDate ? formatDate(s(key)) : s(key)),
    ];

    final since = s('membershipDate').isNotEmpty
        ? s('membershipDate')
        : s('appointmentDate');
    return Profile(
      type: s('type').isEmpty ? 'member' : s('type'),
      name: s('name'),
      code: s('code'),
      mobileNo: s('mobileNo'),
      status: s('status'),
      designation: s('designation'),
      branch: s('branchName').isNotEmpty ? s('branchName') : s('branchCode'),
      sinceYear: since.length >= 4 ? formatDate(since).split('-').last : '',
      personal: fields([
        ('Mobile', 'mobileNo', false),
        ('Father / Husband', 'fatherOrHusbandName', false),
        ("Father's Name", 'fatherName', false),
        ('Date of Birth', 'dateOfBirth', true),
        ('Category', 'category', false),
        ('Address', 'address', false),
      ]),
      membership: fields([
        (s('type') == 'employee' ? 'Employee Code' : 'Member Code', 'code', false),
        ('PF Number', 'pfNo', false),
        ('Membership Date', 'membershipDate', true),
        ('Appointment Date', 'appointmentDate', true),
      ]),
    );
  }
}
