import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/theme.dart';
import '../state/providers.dart';

/// FY picker shown in the app bar, styled like the web top bar's FY pill
/// (slate border, calendar icon). Populated from the backend (never typed).
class FyDropdown extends ConsumerWidget {
  const FyDropdown({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final yearsAsync = ref.watch(financialYearsProvider);
    final selected = ref.watch(selectedFyProvider);
    final primary = Theme.of(context).colorScheme.primary;

    return yearsAsync.when(
      loading: () => const Padding(
        padding: EdgeInsets.symmetric(horizontal: 16),
        child: SizedBox(
          width: 18,
          height: 18,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      ),
      error: (_, _) => const SizedBox.shrink(),
      data: (years) {
        if (years.isEmpty) return const SizedBox.shrink();
        final current = selected ?? defaultFy(years);
        return Padding(
          padding: const EdgeInsets.only(right: 4),
          child: PopupMenuButton<int>(
            tooltip: 'Financial year',
            initialValue: current?.startYear,
            position: PopupMenuPosition.under,
            onSelected: (startYear) {
              ref.read(selectedFyProvider.notifier).state = years.firstWhere(
                (y) => y.startYear == startYear,
              );
            },
            itemBuilder: (_) => [
              for (final y in years)
                PopupMenuItem(
                  value: y.startYear,
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          'FY ${y.fy}',
                          style: TextStyle(
                            fontWeight: y.startYear == current?.startYear
                                ? FontWeight.w700
                                : FontWeight.w500,
                            color: y.startYear == current?.startYear
                                ? primary
                                : AppColors.textMain,
                          ),
                        ),
                      ),
                      if (y.current)
                        const Text(
                          'Current',
                          style: TextStyle(
                            fontSize: 11,
                            color: AppColors.textMuted,
                          ),
                        ),
                    ],
                  ),
                ),
            ],
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: AppColors.background,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: AppColors.border),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(
                    Icons.calendar_today_outlined,
                    size: 14,
                    color: AppColors.textMuted,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    current == null ? 'FY' : 'FY ${current.fy}',
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: AppColors.textMain,
                    ),
                  ),
                  const SizedBox(width: 2),
                  const Icon(
                    Icons.keyboard_arrow_down,
                    size: 18,
                    color: AppColors.textMuted,
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
