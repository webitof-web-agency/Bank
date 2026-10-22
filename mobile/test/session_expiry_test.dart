// When the server refuses the session's token (expired, password changed on
// another device, membership ended) the app signs out by itself and says
// why. A wrong password at sign-in, or a late answer to an older session,
// must not sign anyone out.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jila_member_app/state/auth_controller.dart';
import 'package:jila_member_app/state/providers.dart';

const _account = '{"type":"member","code":"1010","name":"Test Member"}';

void main() {
  late HttpServer server;

  // A stand-in for /api/app: every signed-in call is refused as expired,
  // and sign-in refuses the password.
  setUp(() async {
    server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    server.listen((req) async {
      final login = req.uri.path.endsWith('/auth/login');
      req.response
        ..statusCode = 401
        ..headers.contentType = ContentType.json
        ..write(
          jsonEncode({
            'success': false,
            'message': login
                ? 'Invalid mobile number or password'
                : 'Session expired',
          }),
        );
      await req.response.close();
    });
  });
  tearDown(() => server.close(force: true));

  Future<ProviderContainer> signedIn(String token) async {
    FlutterSecureStorage.setMockInitialValues({
      'app_token': token,
      'app_account': _account,
    });
    final container = ProviderContainer(
      overrides: [
        apiClientProvider.overrideWith(
          (ref) => buildApiClient(
            ref,
            baseUrl: 'http://127.0.0.1:${server.port}/api',
          ),
        ),
      ],
    );
    addTearDown(container.dispose);
    container.read(authControllerProvider); // starts restoring the session
    while (container.read(authControllerProvider).status ==
        AuthStatus.unknown) {
      await Future<void>.delayed(const Duration(milliseconds: 5));
    }
    return container;
  }

  test('a refused session token signs out, says why, and forgets it', () async {
    final container = await signedIn('expired-token');
    expect(
      container.read(authControllerProvider).status,
      AuthStatus.authenticated,
    );

    await expectLater(
      container.read(portalRepositoryProvider).profile(),
      throwsA(anything),
    );
    await Future<void>.delayed(const Duration(milliseconds: 20));

    final auth = container.read(authControllerProvider);
    expect(auth.status, AuthStatus.unauthenticated);
    expect(auth.token, isNull);
    expect(auth.error, contains('session has expired'));
    const storage = FlutterSecureStorage();
    expect(await storage.read(key: 'app_token'), isNull);
    expect(await storage.read(key: 'app_account'), isNull);
  });

  test('a wrong password at sign-in keeps the login message', () async {
    FlutterSecureStorage.setMockInitialValues({});
    final container = await signedIn('');
    // An empty stored token restores as signed out.
    expect(
      container.read(authControllerProvider).status,
      AuthStatus.unauthenticated,
    );

    final ok = await container
        .read(authControllerProvider.notifier)
        .login('9876543210', 'wrong');

    expect(ok, isFalse);
    final auth = container.read(authControllerProvider);
    expect(auth.status, AuthStatus.unauthenticated);
    expect(auth.error, 'Invalid mobile number or password');
  });

  test(
    'a refusal of an older token does not end the current session',
    () async {
      final container = await signedIn('current-token');

      await container
          .read(authControllerProvider.notifier)
          .expireSession('older-token');

      final auth = container.read(authControllerProvider);
      expect(auth.status, AuthStatus.authenticated);
      expect(auth.token, 'current-token');
    },
  );
}
