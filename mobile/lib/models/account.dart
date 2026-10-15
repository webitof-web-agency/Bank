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

/// Full profile shown on the Profile screen. Fields differ a little between a
/// member and an employee; both are optional and simply hidden when empty.
class Profile {
  final String type;
  final String name;
  final String code;
  final String mobileNo;
  final Map<String, String> fields;

  const Profile({
    required this.type,
    required this.name,
    required this.code,
    required this.mobileNo,
    required this.fields,
  });

  bool get isEmployee => type == 'employee';

  factory Profile.fromJson(Map<String, dynamic> json) {
    String s(String k) => (json[k] ?? '').toString();
    final ordered = <String, String>{};
    void add(String label, String key, {bool date = false}) {
      final v = date ? formatDate(s(key)) : s(key);
      if (v.isNotEmpty) ordered[label] = v;
    }

    add('Membership No', 'membershipNo');
    add('PF Number', 'pfNo');
    add("Father / Husband", 'fatherOrHusbandName');
    add("Father's Name", 'fatherName');
    add('Designation', 'designation');
    add('Branch', s('branchName').isNotEmpty ? 'branchName' : 'branchCode');
    add('Category', 'category');
    add('Date of Birth', 'dateOfBirth', date: true);
    add('Membership Date', 'membershipDate', date: true);
    add('Appointment Date', 'appointmentDate', date: true);
    add('Address', 'address');
    add('Status', 'status');

    return Profile(
      type: s('type').isEmpty ? 'member' : s('type'),
      name: s('name'),
      code: s('code'),
      mobileNo: s('mobileNo'),
      fields: ordered,
    );
  }
}
