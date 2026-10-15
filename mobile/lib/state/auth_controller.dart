import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../data/portal_repository.dart';
import '../models/account.dart';
import 'providers.dart';

enum AuthStatus { unknown, authenticated, unauthenticated }

class AuthState {
  final AuthStatus status;
  final String? token;
  final Account? account;
  final bool busy;
  final String? error;

  const AuthState({
    this.status = AuthStatus.unknown,
    this.token,
    this.account,
    this.busy = false,
    this.error,
  });

  AuthState copyWith({
    AuthStatus? status,
    String? token,
    Account? account,
    bool? busy,
    String? error,
    bool clearError = false,
  }) => AuthState(
    status: status ?? this.status,
    token: token ?? this.token,
    account: account ?? this.account,
    busy: busy ?? this.busy,
    error: clearError ? null : (error ?? this.error),
  );
}

class AuthController extends StateNotifier<AuthState> {
  AuthController(this._ref) : super(const AuthState()) {
    _restore();
  }

  final Ref _ref;
  static const _storage = FlutterSecureStorage();
  static const _kToken = 'app_token';
  static const _kAccount = 'app_account';

  PortalRepository get _repo => _ref.read(portalRepositoryProvider);

  Future<void> _restore() async {
    try {
      final token = await _storage.read(key: _kToken);
      final accountRaw = await _storage.read(key: _kAccount);
      if (token != null && token.isNotEmpty && accountRaw != null) {
        final account = Account.fromJson(
          jsonDecode(accountRaw) as Map<String, dynamic>,
        );
        state = state.copyWith(
          status: AuthStatus.authenticated,
          token: token,
          account: account,
        );
        return;
      }
    } catch (_) {
      // Fall through to unauthenticated.
    }
    state = state.copyWith(status: AuthStatus.unauthenticated);
  }

  Future<bool> login(String mobile, String password) async {
    state = state.copyWith(busy: true, clearError: true);
    try {
      final result = await _repo.login(mobile, password);
      await _storage.write(key: _kToken, value: result.token);
      await _storage.write(
        key: _kAccount,
        value: jsonEncode({
          'type': result.account.type,
          'code': result.account.code,
          'name': result.account.name,
        }),
      );
      _ref.read(selectedFyProvider.notifier).state =
          null; // default to current FY
      state = AuthState(
        status: AuthStatus.authenticated,
        token: result.token,
        account: result.account,
      );
      return true;
    } catch (e) {
      state = state.copyWith(busy: false, error: e.toString());
      return false;
    }
  }

  Future<void> logout() async {
    await _storage.delete(key: _kToken);
    await _storage.delete(key: _kAccount);
    _ref.read(selectedFyProvider.notifier).state = null;
    state = const AuthState(status: AuthStatus.unauthenticated);
  }
}
