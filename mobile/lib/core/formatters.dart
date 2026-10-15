import 'package:intl/intl.dart';

final NumberFormat _inr = NumberFormat.currency(
  locale: 'en_IN',
  symbol: '₹',
  decimalDigits: 2,
);

/// Money with the Indian grouping and a Cr/Dr suffix, e.g. "₹1,70,278.00 CR".
String formatMoneyCrDr(num amount, {String? nature}) {
  final value = _inr.format(amount.abs());
  if (nature == null || nature.isEmpty) return value;
  return '$value ${nature.toUpperCase()}';
}

String formatMoney(num amount) => _inr.format(amount);

/// The API sends dates as ISO (YYYY-MM-DD) or timestamps; show them as
/// dd-MM-yyyy to match the portal.
String formatDate(String? iso) {
  if (iso == null || iso.isEmpty) return '';
  final parsed = DateTime.tryParse(iso);
  if (parsed == null) return iso;
  // Timestamps are UTC (a date saved as IST midnight reads 18:30 the day
  // before): show the India date whatever the phone's time zone.
  final date = parsed.isUtc
      ? parsed.add(const Duration(hours: 5, minutes: 30))
      : parsed;
  return DateFormat('dd-MM-yyyy').format(date);
}

/// Normalise a mobile number the way the backend does: strip +91/0091/leading
/// 0 and any non-digits down to the bare 10-digit number.
String normalizeMobile(String value) {
  var digits = value.replaceAll(RegExp(r'\D'), '');
  if (digits.length == 14 && digits.startsWith('0091')) {
    digits = digits.substring(4);
  } else if (digits.length == 12 && digits.startsWith('91')) {
    digits = digits.substring(2);
  } else if (digits.length == 11 && digits.startsWith('0')) {
    digits = digits.substring(1);
  }
  return digits;
}

bool isValidMobile(String value) =>
    RegExp(r'^[6-9]\d{9}$').hasMatch(normalizeMobile(value));
