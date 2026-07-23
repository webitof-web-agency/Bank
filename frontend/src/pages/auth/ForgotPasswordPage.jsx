import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { useAuth } from '../../context/AuthContext';

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const { forgotPassword } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await forgotPassword(identifier);
      toast.success('OTP sent to registered email');
      navigate(`/reset-password?identifier=${encodeURIComponent(identifier)}`);
    } catch (error) {
      toast.error(error.message || 'Unable to send OTP');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Forgot password" subtitle="Enter your email or username and we will send an OTP.">
      <form className="space-y-5" onSubmit={handleSubmit}>
        <div>
          <label className="mb-2 block text-sm font-medium text-[var(--text)]">Email or Username</label>
          <Input value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="admin@bank.local" />
        </div>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Sending OTP...' : 'Send OTP'}
        </Button>
        <div className="text-center text-sm text-[var(--text-muted)]">
          Remembered it? <Link className="text-[var(--accent)] hover:underline" to="/login">Back to login</Link>
        </div>
      </form>
    </AuthLayout>
  );
}
