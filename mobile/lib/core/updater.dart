import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter/foundation.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../data/portal_repository.dart';
import '../models/app_release.dart';
import 'theme.dart';

/// App self-update. On launch, at most once every 24 hours, the app asks the
/// backend for the latest release (Settings -> Mobile App); when it is newer
/// than the installed version a dialog offers it. A required (force) update
/// found by a check is remembered and shown on every launch until installed.
/// Debug builds check on every launch. Download saves the APK into the phone's Downloads folder
/// through Android's DownloadManager (progress in the notification bar) and
/// opens the installer when it finishes (MainActivity.kt).
class AppUpdater {
  static const _channel = MethodChannel('thrift_rpr/updater');
  static const _lastCheckKey = 'app_update_last_check';
  static const _forcedKey = 'app_update_forced_release';
  static const _interval = Duration(hours: 24);
  static bool _checked = false;

  /// Checks once per app start, and asks the server at most every 24 hours;
  /// silent on any error (offline, old backend).
  static Future<void> checkOnce(
    BuildContext context,
    PortalRepository repo,
  ) async {
    // In a browser the site is always the latest version, and there's no
    // APK to install.
    if (kIsWeb || _checked) return;
    _checked = true;
    try {
      final prefs = await SharedPreferences.getInstance();
      final info = await PackageInfo.fromPlatform();
      final build = int.tryParse(info.buildNumber) ?? 0;

      AppRelease? release;
      final last = DateTime.fromMillisecondsSinceEpoch(
        prefs.getInt(_lastCheckKey) ?? 0,
      );
      if (kDebugMode || DateTime.now().difference(last) >= _interval) {
        release = await repo.appVersion();
        await prefs.setInt(
          _lastCheckKey,
          DateTime.now().millisecondsSinceEpoch,
        );
        if (release.force && release.isNewerThan(info.version, build)) {
          await prefs.setString(_forcedKey, jsonEncode(release.toJson()));
        } else {
          await prefs.remove(_forcedKey);
        }
      } else {
        // Between checks only a remembered required update is shown.
        final saved = prefs.getString(_forcedKey);
        if (saved != null) {
          release = AppRelease.fromJson(
            jsonDecode(saved) as Map<String, dynamic>,
          );
        }
      }
      if (release == null || !release.isNewerThan(info.version, build)) {
        return;
      }
      if (!context.mounted) return;
      await _showDialog(context, release, info.version);
    } catch (_) {
      // No update check is better than a broken start.
    }
  }

  static Future<void> _showDialog(
    BuildContext context,
    AppRelease release,
    String current,
  ) {
    return showDialog<void>(
      context: context,
      barrierDismissible: !release.force,
      builder: (context) => PopScope(
        canPop: !release.force,
        child: _UpdateDialog(release: release, current: current),
      ),
    );
  }

  static Future<void> download(AppRelease release) async {
    final name =
        'thrift-rpr-${release.version}${release.buildNumber != null ? '+${release.buildNumber}' : ''}.apk';
    await _channel.invokeMethod('download', {
      'url': release.downloadUrl,
      'fileName': name,
    });
  }
}

class _UpdateDialog extends StatefulWidget {
  const _UpdateDialog({required this.release, required this.current});
  final AppRelease release;
  final String current;

  @override
  State<_UpdateDialog> createState() => _UpdateDialogState();
}

class _UpdateDialogState extends State<_UpdateDialog> {
  bool _started = false;
  String? _error;

  Future<void> _download() async {
    setState(() {
      _started = true;
      _error = null;
    });
    try {
      await AppUpdater.download(widget.release);
    } on PlatformException catch (e) {
      setState(() {
        _started = false;
        _error = e.message ?? 'Download could not start.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final r = widget.release;
    final primary = Theme.of(context).colorScheme.primary;
    return Dialog(
      insetPadding: const EdgeInsets.symmetric(horizontal: 28),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 24, 24, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 52,
              height: 52,
              decoration: BoxDecoration(
                color: primary.withValues(alpha: 0.1),
                shape: BoxShape.circle,
              ),
              child: Icon(Icons.system_update_outlined, color: primary),
            ),
            const SizedBox(height: 14),
            Text(
              'Update available',
              style: Theme.of(
                context,
              ).textTheme.titleLarge?.copyWith(fontSize: 18),
            ),
            const SizedBox(height: 6),
            Text(
              'Version ${r.version} is ready (you have ${widget.current}).',
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 13, color: AppColors.textMuted),
            ),
            if (r.notes.isNotEmpty) ...[
              const SizedBox(height: 14),
              Container(
                width: double.infinity,
                constraints: const BoxConstraints(maxHeight: 160),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.surfaceMuted,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: SingleChildScrollView(
                  child: Text(r.notes, style: const TextStyle(fontSize: 13)),
                ),
              ),
            ],
            if (_started) ...[
              const SizedBox(height: 14),
              const Text(
                'Downloading to your Downloads folder — see the notification. '
                'The installer opens when it finishes; allow "Install unknown '
                'apps" if Android asks.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 12, color: AppColors.textMuted),
              ),
            ],
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(
                _error!,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 12, color: AppColors.debit),
              ),
            ],
            const SizedBox(height: 20),
            Row(
              children: [
                if (!r.force) ...[
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.pop(context),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size(0, 44),
                        foregroundColor: AppColors.textMain,
                        side: const BorderSide(color: AppColors.border),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                      child: Text(
                        _started ? 'Close' : 'Later',
                        maxLines: 1,
                        softWrap: false,
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                ],
                Expanded(
                  child: FilledButton(
                    onPressed: _started ? null : _download,
                    style: FilledButton.styleFrom(
                      minimumSize: const Size(0, 44),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                    // One line always: a spinner + short label while the
                    // download runs, shrunk to fit the half-width button.
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      child: _started
                          ? const Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                SizedBox(
                                  width: 14,
                                  height: 14,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: AppColors.textMuted,
                                  ),
                                ),
                                SizedBox(width: 8),
                                Text(
                                  'Downloading',
                                  maxLines: 1,
                                  softWrap: false,
                                ),
                              ],
                            )
                          : const Text(
                              'Download',
                              maxLines: 1,
                              softWrap: false,
                            ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
