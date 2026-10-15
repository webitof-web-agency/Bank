import 'package:flutter/material.dart';

import '../core/config.dart';

/// The society logo bundled with the app (assets/logo.png), so it shows at
/// once, offline and before login.
class SocietyLogo extends StatelessWidget {
  const SocietyLogo({super.key, this.size = 40});

  final double size;

  @override
  Widget build(BuildContext context) => Image.asset(
    AppConfig.logoAsset,
    width: size,
    height: size,
    fit: BoxFit.contain,
    filterQuality: FilterQuality.medium,
  );
}
