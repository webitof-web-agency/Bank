import 'package:dio/dio.dart';

import '../core/config.dart';

/// Thin Dio wrapper. The auth token is supplied lazily via [tokenProvider] so
/// the client doesn't need rebuilding on login/logout. A 401 is surfaced as an
/// [ApiException] the auth layer can react to (force logout).
typedef TokenProvider = String? Function();

class ApiException implements Exception {
  final int? status;
  final String message;
  ApiException(this.message, {this.status});
  bool get isUnauthorized => status == 401;
  @override
  String toString() => message;
}

class ApiClient {
  ApiClient({required TokenProvider tokenProvider})
    : _dio = Dio(
        BaseOptions(
          baseUrl: AppConfig.apiBaseUrl,
          connectTimeout: const Duration(seconds: 15),
          receiveTimeout: const Duration(seconds: 20),
          headers: {'Content-Type': 'application/json'},
        ),
      ) {
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          final token = tokenProvider();
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
      ),
    );
  }

  final Dio _dio;

  Future<Map<String, dynamic>> get(
    String path, {
    Map<String, dynamic>? query,
  }) async {
    return _unwrap(() => _dio.get(path, queryParameters: query));
  }

  Future<Map<String, dynamic>> post(
    String path, {
    Map<String, dynamic>? body,
  }) async {
    return _unwrap(() => _dio.post(path, data: body));
  }

  Future<Map<String, dynamic>> _unwrap(
    Future<Response<dynamic>> Function() call,
  ) async {
    try {
      final res = await call();
      final data = res.data;
      if (data is Map<String, dynamic>) {
        if (data['success'] == false) {
          throw ApiException(
            (data['message'] ?? 'Request failed').toString(),
            status: res.statusCode,
          );
        }
        return data;
      }
      return {'success': true, 'data': data};
    } on DioException catch (e) {
      final status = e.response?.statusCode;
      final serverMsg = e.response?.data is Map
          ? (e.response!.data['message']?.toString())
          : null;
      throw ApiException(serverMsg ?? _friendly(e), status: status);
    }
  }

  String _friendly(DioException e) {
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.receiveTimeout:
      case DioExceptionType.sendTimeout:
        return 'The server took too long to respond.';
      case DioExceptionType.connectionError:
        return 'Could not reach the server. Check your connection.';
      default:
        return 'Something went wrong. Please try again.';
    }
  }
}
