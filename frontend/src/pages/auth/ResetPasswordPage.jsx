import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { useAuth } from '../../context/AuthContext';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { resetPassword } = useAuth();
  const [form, setForm] = useState({
    identifier: params.get('identifier') || '',
    otp: '',
    password: '',
    confirmPassword: ''
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const identifier = params.get('identifier') || '';
    if (identifier) {
      setForm((current) => ({ ...current, identifier }));
    }
  }, [params]);

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await resetPassword(form.identifier, form.otp, form.password, form.confirmPassword);
      toast.success('Password updated successfully');
      navigate('/login');
    } catch (error) {
      toast.error(error.message || 'Unable to reset password');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Reset password" subtitle="Use the OTP sent to your registered email.">
      <form className="space-y-5" onSubmit={handleSubmit}>
        <div>
          <label className="mb-2 block text-sm font-medium text-[var(--text)]">Email or Username</label>
          <Input value={form.identifier} onChange={(event) => setForm((current) => ({ ...current, identifier: event.target.value }))} />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-[var(--text)]">OTP</label>
          <Input value={form.otp} onChange={(event) => setForm((current) => ({ ...current, otp: event.target.value }))} placeholder="6 digit OTP" />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-[var(--text)]">New Password</label>
          <Input type="password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-[var(--text)]">Confirm Password</label>
          <Input type="password" value={form.confirmPassword} onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))} />
        </div>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Resetting...' : 'Reset Password'}
        </Button>
        <div className="text-center text-sm text-[var(--text-muted)]">
          Need another OTP? <Link className="text-[var(--accent)] hover:underline" to="/forgot-password">Send again</Link>
        </div>
      </form>
    </AuthLayout>
  );
}
