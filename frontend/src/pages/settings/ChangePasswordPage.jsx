import { useState } from 'react';
import { KeyRound, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';

export function ChangePasswordPage() {
  const { changePassword } = useAuth();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });

  async function onSubmit(event) {
    event.preventDefault();
    if (form.newPassword !== form.confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    setSaving(true);
    try {
      await changePassword(form);
      toast.success('Password changed successfully');
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error) {
      toast.error(error.message || 'Unable to change password');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Change Password</h1>
        <p className="mt-1 text-sm text-slate-500">Current profile ke security form ko separate page par laaye hain.</p>
      </div>

      <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm max-w-2xl">
        <form className="space-y-5" onSubmit={onSubmit}>
          <div className="grid gap-5">
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Current Password</label>
              <Input type="password" value={form.currentPassword} onChange={(event) => setForm((current) => ({ ...current, currentPassword: event.target.value }))} />
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">New Password</label>
              <Input type="password" value={form.newPassword} onChange={(event) => setForm((current) => ({ ...current, newPassword: event.target.value }))} />
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-slate-700">Confirm Password</label>
              <Input type="password" value={form.confirmPassword} onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))} />
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={saving} className="gap-2">
              <KeyRound size={16} />
              {saving ? 'Updating...' : 'Update Password'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

export default ChangePasswordPage;
