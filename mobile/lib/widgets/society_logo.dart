import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../state/branding_controller.dart';

/// The society logo from Settings -> Society Details; a bank icon in the
/// primary colour while it loads or when no logo is set.
class SocietyLogo extends ConsumerWidget {
  const SocietyLogo({super.key, this.size = 40});

  final double size;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final url = ref.watch(brandingProvider.select((b) => b.society.logoUrl));
    final primary = Theme.of(context).colorScheme.primary;
    final fallback = Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: primary.withValues(alpha: 0.12),
        shape: BoxShape.circle,
      ),
      child: Icon(Icons.account_balance, size: size * 0.5, color: primary),
    );
    if (url.isEmpty) return fallback;
    return SizedBox(
      width: size,
      height: size,
      child: Image.network(
        url,
        fit: BoxFit.contain,
        errorBuilder: (_, _, _) => fallback,
        loadingBuilder: (_, child, progress) =>
            progress == null ? child : fallback,
      ),
    );
  }
}
