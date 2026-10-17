/// The latest app release published in Settings -> Mobile App
/// (`GET /api/app/version`).
class AppRelease {
  final String version;
  final int? buildNumber;
  final String downloadUrl;
  final String notes;

  /// Required update: the dialog can't be dismissed.
  final bool force;

  const AppRelease({
    required this.version,
    required this.buildNumber,
    required this.downloadUrl,
    required this.notes,
    required this.force,
  });

  factory AppRelease.fromJson(Map<String, dynamic> json) => AppRelease(
    version: (json['version'] ?? '').toString().trim(),
    buildNumber: json['buildNumber'] is num
        ? (json['buildNumber'] as num).toInt()
        : int.tryParse('${json['buildNumber'] ?? ''}'),
    downloadUrl: (json['downloadUrl'] ?? '').toString().trim(),
    notes: (json['notes'] ?? '').toString().trim(),
    force: json['force'] == true,
  );

  Map<String, dynamic> toJson() => {
    'version': version,
    'buildNumber': buildNumber,
    'downloadUrl': downloadUrl,
    'notes': notes,
    'force': force,
  };

  /// True when this release is newer than the installed [version] / [build]:
  /// compares 1.2.3 part by part, then the build number when both are set.
  bool isNewerThan(String version, int build) {
    // Only an https download is offered (the phone refuses others too).
    if (this.version.isEmpty || !Uri.tryParse(downloadUrl).isHttpsLink) return false;
    List<int> parts(String v) =>
        v.split('.').map((p) => int.tryParse(p.trim()) ?? 0).toList();
    final a = parts(this.version), b = parts(version);
    for (var i = 0; i < 3; i++) {
      final x = i < a.length ? a[i] : 0, y = i < b.length ? b[i] : 0;
      if (x != y) return x > y;
    }
    return buildNumber != null && buildNumber! > build;
  }
}

extension on Uri? {
  bool get isHttpsLink => this != null && this!.scheme == 'https' && this!.host.isNotEmpty;
}
