import 'package:flutter/material.dart';

import '../core/config.dart';

/// The society's identity (Settings -> Society Details) and theme colours
/// (Settings -> Branding) served by `GET /api/app/config`, so the app shows
/// the same name, logo and colours as the web app.
class Society {
  final String name;
  final String shortName;
  final String regNo;
  final String place;
  final String address;
  final String email;
  final String phone;

  /// Absolute logo URL, or '' when the society has no logo.
  final String logoUrl;

  const Society({
    this.name = '',
    this.shortName = '',
    this.regNo = '',
    this.place = '',
    this.address = '',
    this.email = '',
    this.phone = '',
    this.logoUrl = '',
  });

  factory Society.fromJson(Map<String, dynamic> json) {
    String s(String key) => (json[key] ?? '').toString().trim();
    return Society(
      name: s('name'),
      shortName: s('shortName'),
      regNo: s('regNo'),
      place: s('place'),
      address: s('address'),
      email: s('email'),
      phone: s('phone'),
      logoUrl: absoluteApiUrl(s('logoUrl')),
    );
  }

  Map<String, dynamic> toJson() => {
    'name': name,
    'shortName': shortName,
    'regNo': regNo,
    'place': place,
    'address': address,
    'email': email,
    'phone': phone,
    'logoUrl': logoUrl,
  };

  /// The society as built into the app (core/config.dart), used before login.
  static const builtIn = Society(
    name: AppConfig.societyName,
    shortName: AppConfig.societyShortName,
    regNo: AppConfig.societyRegNo,
    address: AppConfig.societyAddress,
  );

  String get displayName => name.isNotEmpty ? name : AppConfig.societyName;
  String get regLine => regNo.isNotEmpty ? 'Reg. No. $regNo' : '';
}

class BrandColors {
  final Color primary;
  final Color accent;
  final Color dark;

  const BrandColors({
    // Settings -> Branding as set today; used until the user signs in.
    this.primary = const Color(0xFF3B82F6),
    this.accent = const Color(0xFF1D4ED8),
    this.dark = const Color(0xFF090D16),
  });

  factory BrandColors.fromJson(Map<String, dynamic> json) {
    const fallback = BrandColors();
    return BrandColors(
      primary: parseHexColor(json['primaryColor'], fallback.primary),
      accent: parseHexColor(json['accentColor'], fallback.accent),
      dark: parseHexColor(json['sidebarBg'], fallback.dark),
    );
  }

  Map<String, dynamic> toJson() => {
    'primaryColor': toHex(primary),
    'accentColor': toHex(accent),
    'sidebarBg': toHex(dark),
  };
}

class Branding {
  final Society society;
  final BrandColors colors;

  /// The website, whose ledger page the Ledger tab opens ('' if not set).
  final String webUrl;

  const Branding({
    this.society = Society.builtIn,
    this.colors = const BrandColors(),
    this.webUrl = '',
  });

  factory Branding.fromJson(Map<String, dynamic> json) => Branding(
    society: Society.fromJson(
      (json['society'] as Map?)?.cast<String, dynamic>() ?? {},
    ),
    colors: BrandColors.fromJson(
      (json['theme'] as Map?)?.cast<String, dynamic>() ?? {},
    ),
    webUrl: (json['webUrl'] ?? '').toString().trim(),
  );

  Map<String, dynamic> toJson() => {
    'society': society.toJson(),
    'theme': colors.toJson(),
    'webUrl': webUrl,
  };
}

/// "#3b82f6" / "#38f" -> Color; [fallback] for anything else.
Color parseHexColor(Object? value, Color fallback) {
  var hex = (value ?? '').toString().trim().replaceFirst('#', '');
  if (hex.length == 3) hex = hex.split('').map((c) => '$c$c').join();
  if (!RegExp(r'^[0-9a-fA-F]{6}$').hasMatch(hex)) return fallback;
  return Color(int.parse('FF$hex', radix: 16));
}

String toHex(Color color) =>
    '#${(color.toARGB32() & 0xFFFFFF).toRadixString(16).padLeft(6, '0')}';

/// The server returns file links as "/api/files/..."; resolve them against the
/// API host. Absolute URLs pass through.
String absoluteApiUrl(String path) {
  if (path.isEmpty ||
      path.startsWith('http://') ||
      path.startsWith('https://')) {
    return path;
  }
  final api = Uri.parse(AppConfig.apiBaseUrl);
  return api
      .replace(
        path: path.split('?').first,
        query: path.contains('?') ? path.split('?').last : null,
      )
      .toString();
}
