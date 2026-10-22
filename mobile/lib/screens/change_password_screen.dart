import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/theme.dart';
import '../state/providers.dart';

/// The signed-in member / employee sets a new password. An employee's login
/// is also their web login, so it needs the web's 8-character minimum.
class ChangePasswordScreen extends ConsumerStatefulWidget {
  const ChangePasswordScreen({super.key});

  @override
  ConsumerState<ChangePasswordScreen> createState() =>
      _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends ConsumerState<ChangePasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _confirm = TextEditingController();
  bool _obscure = true;
  bool _busy = false;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _confirm.dispose();
    super.dispose();
  }

  int get _minLength =>
      (ref.read(authControllerProvider).account?.isEmployee ?? false) ? 8 : 4;

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    FocusScope.of(context).unfocus();
    setState(() => _busy = true);
    final err = await ref
        .read(authControllerProvider.notifier)
        .changePassword(_current.text, _next.text.trim());
    if (!mounted) return;
    setState(() => _busy = false);
    final messenger = ScaffoldMessenger.of(context)..hideCurrentSnackBar();
    if (err != null) {
      messenger.showSnackBar(SnackBar(content: Text(err)));
      return;
    }
    messenger.showSnackBar(
      const SnackBar(content: Text('Password changed successfully')),
    );
    Navigator.of(context).pop();
  }

  Widget _field(
    TextEditingController controller,
    String label, {
    required String? Function(String?) validator,
    bool last = false,
  }) {
    return TextFormField(
      controller: controller,
      obscureText: _obscure,
      textInputAction: last ? TextInputAction.done : TextInputAction.next,
      decoration: InputDecoration(
        labelText: label,
        prefixIcon: const Icon(Icons.lock_outline),
      ),
      onFieldSubmitted: last ? (_) => _submit() : null,
      validator: validator,
    );
  }

  @override
  Widget build(BuildContext context) {
    final min = _minLength;
    return Scaffold(
      appBar: AppBar(title: const Text('Change password')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
          // A form this short stays narrow on a desktop browser.
          child: Align(
            alignment: Alignment.topCenter,
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: Form(
                key: _formKey,
                child: Card(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 20, 20, 20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        _field(
                          _current,
                          'Current password',
                          validator: (v) => (v == null || v.isEmpty)
                              ? 'Enter your current password'
                              : null,
                        ),
                        const SizedBox(height: 16),
                        _field(
                          _next,
                          'New password',
                          validator: (v) {
                            final value = (v ?? '').trim();
                            if (value.length < min) {
                              return 'At least $min characters';
                            }
                            if (value == _current.text) {
                              return 'Must differ from the current password';
                            }
                            return null;
                          },
                        ),
                        const SizedBox(height: 16),
                        _field(
                          _confirm,
                          'Confirm new password',
                          last: true,
                          validator: (v) =>
                              (v ?? '').trim() != _next.text.trim()
                              ? 'Passwords do not match'
                              : null,
                        ),
                        const SizedBox(height: 4),
                        Align(
                          alignment: Alignment.centerLeft,
                          child: TextButton.icon(
                            onPressed: () =>
                                setState(() => _obscure = !_obscure),
                            icon: Icon(
                              _obscure
                                  ? Icons.visibility_outlined
                                  : Icons.visibility_off_outlined,
                              size: 18,
                            ),
                            label: Text(
                              _obscure ? 'Show passwords' : 'Hide passwords',
                            ),
                          ),
                        ),
                        const SizedBox(height: 4),
                        const Text(
                          'You will stay signed in here; other phones signed in '
                          'with the old password are logged out.',
                          style: TextStyle(
                            fontSize: 12,
                            color: AppColors.textMuted,
                          ),
                        ),
                        const SizedBox(height: 20),
                        FilledButton(
                          onPressed: _busy ? null : _submit,
                          child: _busy
                              ? const SizedBox(
                                  width: 22,
                                  height: 22,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.white,
                                  ),
                                )
                              : const Text('Update password'),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
