import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/theme.dart';
import '../models/account.dart';
import '../state/branding_controller.dart';
import '../state/providers.dart';
import '../widgets/async_view.dart';
import '../widgets/page_list_view.dart';
import '../widgets/society_logo.dart';
import 'change_password_screen.dart';

/// Profile: a header with initials, name, account tags and quick facts, then
/// Personal and Membership/Service sections (label above value, so long
/// values like the address wrap cleanly), and the society card.
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(profileProvider);
    final society = ref.watch(brandingProvider.select((b) => b.society));
    final version = ref.watch(appVersionLabelProvider).valueOrNull ?? '';

    return AsyncView(
      value: profile,
      onRefresh: () async => ref.refresh(profileProvider.future),
      data: (Profile p) {
        return PageListView(
          children: [
            _Header(profile: p),
            const SizedBox(height: 20),
            if (p.personal.isNotEmpty)
              _Section(title: 'Personal', fields: p.personal),
            if (p.membership.isNotEmpty) ...[
              const SizedBox(height: 20),
              _Section(
                title: p.isEmployee ? 'Service' : 'Membership',
                fields: p.membership,
              ),
            ],
            const SizedBox(height: 20),
            Card(
              child: ListTile(
                leading: Icon(
                  Icons.lock_reset_outlined,
                  color: Theme.of(context).colorScheme.primary,
                ),
                title: const Text(
                  'Change password',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                ),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => const ChangePasswordScreen(),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 20),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    const SocietyLogo(size: 44),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            society.displayName,
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          if (society.regLine.isNotEmpty) ...[
                            const SizedBox(height: 2),
                            Text(
                              society.regLine,
                              style: const TextStyle(
                                fontSize: 11,
                                color: AppColors.textMuted,
                              ),
                            ),
                          ],
                          if (society.address.isNotEmpty) ...[
                            const SizedBox(height: 2),
                            Text(
                              society.address,
                              style: const TextStyle(
                                fontSize: 11,
                                color: AppColors.textMuted,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            if (version.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 20),
                child: Text(
                  'Thrift RPR · Version $version',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 12,
                    color: AppColors.textMuted.withValues(alpha: 0.7),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.profile});
  final Profile profile;

  @override
  Widget build(BuildContext context) {
    final p = profile;
    final primary = Theme.of(context).colorScheme.primary;
    final accent = Theme.of(context).colorScheme.secondary;
    final facts = <(String, String)>[
      if (p.sinceYear.isNotEmpty)
        (p.isEmployee ? 'Joined' : 'Member since', p.sinceYear),
      if (p.designation.isNotEmpty) ('Designation', p.designation),
      if (p.branch.isNotEmpty) ('Branch', p.branch),
    ];

    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(20, 22, 20, 20),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [primary, accent],
              ),
            ),
            child: Row(
              children: [
                Container(
                  width: 60,
                  height: 60,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.18),
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: Colors.white.withValues(alpha: 0.5),
                      width: 1.5,
                    ),
                  ),
                  child: Text(
                    p.initials,
                    style: const TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        p.name,
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          _Tag(p.isEmployee ? 'Employee' : 'Member'),
                          if (p.code.isNotEmpty) _Tag('Code ${p.code}'),
                          if (p.status.isNotEmpty) _Tag(p.status),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          if (facts.isNotEmpty)
            IntrinsicHeight(
              child: Row(
                children: [
                  for (var i = 0; i < facts.length; i++) ...[
                    if (i > 0)
                      const VerticalDivider(
                        width: 1,
                        thickness: 1,
                        color: AppColors.border,
                      ),
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 12,
                        ),
                        child: Column(
                          children: [
                            Text(
                              facts[i].$1,
                              style: const TextStyle(
                                fontSize: 11,
                                color: AppColors.textMuted,
                              ),
                            ),
                            const SizedBox(height: 3),
                            Text(
                              facts[i].$2,
                              textAlign: TextAlign.center,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _Tag extends StatelessWidget {
  const _Tag(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
    decoration: BoxDecoration(
      color: Colors.white.withValues(alpha: 0.2),
      borderRadius: BorderRadius.circular(999),
    ),
    child: Text(
      text,
      style: const TextStyle(
        fontSize: 11,
        fontWeight: FontWeight.w600,
        color: Colors.white,
      ),
    ),
  );
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.fields});
  final String title;
  final List<ProfileField> fields;

  static const _icons = <String, IconData>{
    'Mobile': Icons.phone_outlined,
    'Father / Husband': Icons.family_restroom_outlined,
    "Father's Name": Icons.family_restroom_outlined,
    'Date of Birth': Icons.cake_outlined,
    'Category': Icons.label_outline,
    'Address': Icons.home_outlined,
    'Member Code': Icons.badge_outlined,
    'Employee Code': Icons.badge_outlined,
    'PF Number': Icons.numbers,
    'Membership Date': Icons.event_available_outlined,
    'Appointment Date': Icons.event_available_outlined,
  };

  @override
  Widget build(BuildContext context) {
    final primary = Theme.of(context).colorScheme.primary;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 4, bottom: 8),
          child: Text(
            title.toUpperCase(),
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.8,
              color: AppColors.textMuted,
            ),
          ),
        ),
        Card(
          child: Column(
            children: [
              for (var i = 0; i < fields.length; i++) ...[
                if (i > 0)
                  const Divider(height: 1, indent: 56, color: AppColors.border),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        width: 28,
                        height: 28,
                        decoration: BoxDecoration(
                          color: primary.withValues(alpha: 0.08),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Icon(
                          _icons[fields[i].label] ?? Icons.info_outline,
                          size: 16,
                          color: primary,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              fields[i].label,
                              style: const TextStyle(
                                fontSize: 11,
                                color: AppColors.textMuted,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              fields[i].value,
                              style: const TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}
