import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../models/branding.dart';

/// Fixed colours shared with the web app (frontend/src/styles.css): slate
/// neutrals, plus green/red for credit/debit amounts. The brand colours
/// (primary/accent) come from Settings -> Branding at runtime, see
/// [buildAppTheme].
class AppColors {
  static const Color credit = Color(0xFF059669); // emerald-600
  static const Color debit = Color(0xFFE11D48); // rose-600
  static const Color textMain = Color(0xFF0F172A); // slate-900
  static const Color textMuted = Color(0xFF475569); // slate-600
  static const Color surfaceMuted = Color(0xFFF1F5F9); // slate-100
  static const Color background = Color(0xFFF8FAFC); // slate-50
  static const Color border = Color(0xFFE2E8F0); // slate-200
}

/// Mirrors the web theme: Inter body text, Space Grotesk headings, white
/// cards with a slate border, the configured primary colour on buttons and
/// highlights, and the same corner radii (card 1.75rem → 24, button 1rem,
/// input 0.75rem).
ThemeData buildAppTheme(BrandColors brand) {
  final scheme =
      ColorScheme.fromSeed(
        seedColor: brand.primary,
        brightness: Brightness.light,
      ).copyWith(
        primary: brand.primary,
        onPrimary: Colors.white,
        secondary: brand.accent,
        onSecondary: Colors.white,
        surface: Colors.white,
        onSurface: AppColors.textMain,
        onSurfaceVariant: AppColors.textMuted,
        outline: AppColors.border,
        outlineVariant: AppColors.border,
        error: AppColors.debit,
      );

  final body = GoogleFonts.interTextTheme().apply(
    bodyColor: AppColors.textMain,
    displayColor: AppColors.textMain,
  );
  TextStyle? heading(TextStyle? style) =>
      GoogleFonts.spaceGrotesk(textStyle: style, fontWeight: FontWeight.w600);
  final textTheme = body.copyWith(
    displaySmall: heading(body.displaySmall),
    headlineLarge: heading(body.headlineLarge),
    headlineMedium: heading(body.headlineMedium),
    headlineSmall: heading(body.headlineSmall),
    titleLarge: heading(body.titleLarge),
  );

  OutlineInputBorder inputBorder(Color color, [double width = 1]) =>
      OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: color, width: width),
      );

  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    textTheme: textTheme,
    scaffoldBackgroundColor: AppColors.background,
    dividerColor: AppColors.border,
    appBarTheme: AppBarTheme(
      backgroundColor: Colors.white,
      foregroundColor: AppColors.textMain,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0.5,
      shadowColor: AppColors.border,
      centerTitle: false,
      titleTextStyle: GoogleFonts.spaceGrotesk(
        fontSize: 16,
        fontWeight: FontWeight.w600,
        color: AppColors.textMain,
      ),
      shape: const Border(bottom: BorderSide(color: AppColors.border)),
    ),
    cardTheme: CardThemeData(
      elevation: 0,
      color: Colors.white,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(24),
        side: const BorderSide(color: AppColors.border),
      ),
      margin: EdgeInsets.zero,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      labelStyle: const TextStyle(color: AppColors.textMuted),
      prefixIconColor: AppColors.textMuted,
      suffixIconColor: AppColors.textMuted,
      border: inputBorder(AppColors.border),
      enabledBorder: inputBorder(AppColors.border),
      focusedBorder: inputBorder(brand.accent, 1.5),
      errorBorder: inputBorder(AppColors.debit),
      focusedErrorBorder: inputBorder(AppColors.debit, 1.5),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: brand.accent,
        foregroundColor: Colors.white,
        minimumSize: const Size.fromHeight(48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        textStyle: GoogleFonts.inter(fontSize: 15, fontWeight: FontWeight.w600),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(foregroundColor: brand.accent),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      indicatorColor: brand.primary.withValues(alpha: 0.12),
      iconTheme: WidgetStateProperty.resolveWith(
        (states) => IconThemeData(
          color: states.contains(WidgetState.selected)
              ? brand.primary
              : AppColors.textMuted,
        ),
      ),
      labelTextStyle: WidgetStateProperty.resolveWith(
        (states) => GoogleFonts.inter(
          fontSize: 12,
          fontWeight: states.contains(WidgetState.selected)
              ? FontWeight.w600
              : FontWeight.w500,
          color: states.contains(WidgetState.selected)
              ? brand.primary
              : AppColors.textMuted,
        ),
      ),
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(color: brand.primary),
    snackBarTheme: const SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: AppColors.textMain,
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
    ),
    popupMenuTheme: PopupMenuThemeData(
      color: Colors.white,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: const BorderSide(color: AppColors.border),
      ),
    ),
  );
}
