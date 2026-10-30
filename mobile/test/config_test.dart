// Which API the app talks to. A browser build opened from a local site
// (Vite on localhost) must use that site's /api, which Vite forwards to the
// local backend, never the live one. Elsewhere: the live API, unless an
// API_BASE_URL was set at build time.
import 'package:flutter_test/flutter_test.dart';
import 'package:jila_member_app/core/config.dart';

void main() {
  const live = 'https://api.thriftrpr.in/api';

  test('a browser on localhost uses that site\'s /api', () {
    expect(
      resolveApiBaseUrl(
        defined: '',
        isWeb: true,
        page: Uri.parse('http://localhost:5173/member/index.html'),
      ),
      'http://localhost:5173/api',
    );
    expect(
      resolveApiBaseUrl(
        defined: '',
        isWeb: true,
        page: Uri.parse('http://127.0.0.1:4173/member/'),
      ),
      'http://127.0.0.1:4173/api',
    );
  });

  test('a browser on the real site uses the live API', () {
    expect(
      resolveApiBaseUrl(
        defined: '',
        isWeb: true,
        page: Uri.parse('https://thriftrpr.in/member/index.html'),
      ),
      live,
    );
  });

  test('the phone app uses the live API', () {
    expect(resolveApiBaseUrl(defined: '', isWeb: false, page: Uri()), live);
  });

  test('an API_BASE_URL set at build time always wins', () {
    expect(
      resolveApiBaseUrl(
        defined: 'http://localhost:8001/api',
        isWeb: true,
        page: Uri.parse('https://thriftrpr.in/member/'),
      ),
      'http://localhost:8001/api',
    );
    expect(
      resolveApiBaseUrl(
        defined: 'http://localhost:8001/api',
        isWeb: false,
        page: Uri(),
      ),
      'http://localhost:8001/api',
    );
  });

  test(
    'the ledger page: same site in a browser, the reported website on a phone',
    () {
      expect(
        ledgerPageUrl(
          ticket: 'a b',
          webUrl: '',
          isWeb: true,
          page: Uri.parse('http://localhost:5173/member/index.html'),
        ),
        'http://localhost:5173/ledger-view?ticket=a+b',
      );
      expect(
        ledgerPageUrl(
          ticket: 't',
          webUrl: 'https://bank.example.com/',
          isWeb: false,
          page: Uri.parse('file:///'),
        ),
        'https://bank.example.com/ledger-view?ticket=t',
      );
      expect(
        ledgerPageUrl(
          ticket: 't',
          webUrl: '',
          isWeb: false,
          page: Uri.parse('file:///'),
        ),
        '',
      );
    },
  );
}
