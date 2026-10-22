import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/theme.dart';
import '../state/branding_controller.dart';
import '../state/providers.dart';
import '../widgets/fy_dropdown.dart';
import '../widgets/marquee_text.dart';
import '../widgets/page_list_view.dart';
import '../widgets/society_logo.dart';
import 'profile_screen.dart';
import 'transactions_screen.dart';
import 'summary_screen.dart';

class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  int _index = 0;

  static const _titles = ['Summary', 'Transactions', 'Profile'];

  // (icon, selected icon, label): the bottom bar on a phone, a side rail on
  // a wide (tablet / desktop browser) screen.
  static const _destinations = [
    (Icons.dashboard_outlined, Icons.dashboard, 'Summary'),
    (Icons.receipt_long_outlined, Icons.receipt_long, 'Transactions'),
    (Icons.person_outline, Icons.person, 'Profile'),
  ];

  @override
  Widget build(BuildContext context) {
    final account = ref.watch(authControllerProvider.select((s) => s.account));
    final showFy = _index != 2; // hide FY picker on Profile
    final society = ref.watch(brandingProvider.select((b) => b.society));
    final width = MediaQuery.sizeOf(context).width;
    final wide = width >= kWideLayoutWidth;
    final pages = IndexedStack(
      index: _index,
      children: const [SummaryScreen(), TransactionsScreen(), ProfileScreen()],
    );

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 12,
        title: Row(
          children: [
            const SocietyLogo(size: 36),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(_titles[_index], overflow: TextOverflow.ellipsis),
                  MarqueeText(
                    [
                      if (account != null) account.name,
                      if (society.shortName.isNotEmpty) society.shortName,
                    ].join('  ·  '),
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w400,
                      color: AppColors.textMuted,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          if (showFy) const FyDropdown(),
          if (_index == 2) // Profile tab only
            IconButton(
              tooltip: 'Log out',
              icon: const Icon(Icons.logout, color: AppColors.debit, size: 22),
              onPressed: _confirmLogout,
            ),
          if (_index == 2) const SizedBox(width: 4),
        ],
      ),
      body: wide
          ? Row(
              children: [
                NavigationRail(
                  selectedIndex: _index,
                  onDestinationSelected: (i) => setState(() => _index = i),
                  extended: width >= 1100,
                  labelType: width >= 1100
                      ? NavigationRailLabelType.none
                      : NavigationRailLabelType.all,
                  destinations: [
                    for (final d in _destinations)
                      NavigationRailDestination(
                        icon: Icon(d.$1),
                        selectedIcon: Icon(d.$2),
                        label: Text(d.$3),
                      ),
                  ],
                ),
                const VerticalDivider(
                  width: 1,
                  thickness: 1,
                  color: AppColors.border,
                ),
                Expanded(child: pages),
              ],
            )
          : pages,
      bottomNavigationBar: wide
          ? null
          : NavigationBar(
              selectedIndex: _index,
              onDestinationSelected: (i) => setState(() => _index = i),
              destinations: [
                for (final d in _destinations)
                  NavigationDestination(
                    icon: Icon(d.$1),
                    selectedIcon: Icon(d.$2),
                    label: d.$3,
                  ),
              ],
            ),
    );
  }

  Future<void> _confirmLogout() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => Dialog(
        insetPadding: const EdgeInsets.symmetric(horizontal: 32),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 24, 24, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  color: AppColors.debit.withValues(alpha: 0.1),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.logout, color: AppColors.debit),
              ),
              const SizedBox(height: 14),
              Text(
                'Log out?',
                style: Theme.of(
                  context,
                ).textTheme.titleLarge?.copyWith(fontSize: 18),
              ),
              const SizedBox(height: 6),
              const Text(
                'You will need your mobile number and password to sign in again.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 13, color: AppColors.textMuted),
              ),
              const SizedBox(height: 20),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.pop(context, false),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size(0, 44),
                        foregroundColor: AppColors.textMain,
                        side: const BorderSide(color: AppColors.border),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                      child: const Text('Cancel'),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: FilledButton(
                      onPressed: () => Navigator.pop(context, true),
                      style: FilledButton.styleFrom(
                        minimumSize: const Size(0, 44),
                        backgroundColor: AppColors.debit,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                      child: const Text('Log out'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
    if (ok == true) {
      await ref.read(authControllerProvider.notifier).logout();
    }
  }
}
