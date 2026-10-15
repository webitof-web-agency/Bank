import '../models/account.dart';
import '../models/branding.dart';
import '../models/financial_year.dart';
import '../models/statement.dart';
import '../models/summary.dart';
import 'api_client.dart';

class LoginResult {
  final String token;
  final Account account;
  const LoginResult({required this.token, required this.account});
}

/// All calls against the member/employee portal API (`/api/app`).
class PortalRepository {
  PortalRepository(this._api);
  final ApiClient _api;

  /// Society details + theme colours (public, before login).
  Future<Branding> appConfig() async {
    final res = await _api.get('/app/config');
    return Branding.fromJson((res['data'] as Map<String, dynamic>?) ?? {});
  }

  Future<LoginResult> login(String mobile, String password) async {
    final res = await _api.post(
      '/app/auth/login',
      body: {'mobile': mobile, 'password': password},
    );
    final data = (res['data'] as Map<String, dynamic>?) ?? {};
    return LoginResult(
      token: (data['token'] ?? '').toString(),
      account: Account.fromJson(
        (data['account'] as Map<String, dynamic>?) ?? {},
      ),
    );
  }

  Future<List<FinancialYear>> financialYears() async {
    final res = await _api.get('/app/me/financial-years');
    final list = (res['data'] as List?) ?? [];
    return list
        .map((e) => FinancialYear.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Profile> profile() async {
    final res = await _api.get('/app/me/profile');
    return Profile.fromJson((res['data'] as Map<String, dynamic>?) ?? {});
  }

  Future<AccountSummary> summary(int startYear) async {
    final res = await _api.get(
      '/app/me/summary',
      query: {'startYear': startYear},
    );
    return AccountSummary.fromJson(
      (res['data'] as Map<String, dynamic>?) ?? {},
    );
  }

  Future<Statement> statement(String productKey, int startYear) async {
    final res = await _api.get(
      '/app/me/statement/$productKey',
      query: {'startYear': startYear},
    );
    return Statement.fromJson((res['data'] as Map<String, dynamic>?) ?? {});
  }
}
