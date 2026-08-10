import { useEffect, useState } from 'react';
import { CalendarClock, Lock, Save } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../api/api';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';

const EMPTY = {
  currentYear: '',
  closingDate: '',
  lockTransactions: false,
  remarks: ''
};

export function FinancialYearClosingPage() {
  const { token, settings, refreshSettings } = useAuth();
  const [draft, setDraft] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const current = settings?.payload?.financialYearClosing || EMPTY;
    setDraft({
      currentYear: current.currentYear || '',
      closingDate: current.closingDate || '',
      lockTransactions: Boolean(current.lockTransactions),
      remarks: current.remarks || ''
    });
  }, [settings]);

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await api.settings.save(token, {
        ...(settings || {}),
        payload: {
          ...(settings?.payload || {}),
          financialYearClosing: draft
        }
      });
      if (refreshSettings) await refreshSettings();
      toast.success('Financial year closing details saved');
    } catch (error) {
      toast.error(error.message || 'Unable to save financial year closing');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Financial Year Closing</h1>
        <p className="mt-1 text-sm text-slate-500">Year-end close ka UI placeholder aur metadata save flow.</p>
      </div>

      <Card className="max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-[13px] font-semibold text-slate-700">Current Financial Year</label>
              <Input value={draft.currentYear} onChange={(event) => setDraft((current) => ({ ...current, currentYear: event.target.value }))} placeholder="2025-26" />
            </div>
            <div>
              <label className="mb-2 block text-[13px] font-semibold text-slate-700">Closing Date</label>
              <Input type="date" value={draft.closingDate} onChange={(event) => setDraft((current) => ({ ...current, closingDate: event.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <label className="mb-2 block text-[13px] font-semibold text-slate-700">Remarks</label>
              <Input value={draft.remarks} onChange={(event) => setDraft((current) => ({ ...current, remarks: event.target.value }))} placeholder="Optional notes" />
            </div>
            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] font-medium text-slate-700 md:col-span-2">
              <input type="checkbox" checked={draft.lockTransactions} onChange={(event) => setDraft((current) => ({ ...current, lockTransactions: event.target.checked }))} className="h-4 w-4 rounded border-slate-300 accent-[var(--primary)]" />
              Lock transactions after closing
            </label>
          </div>

          <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-[13px] text-amber-700">
            This page stores closing metadata in settings payload. Full accounting close workflow can be wired later.
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={saving} className="gap-2">
              <Save size={16} />
              {saving ? 'Saving...' : 'Save Closing Settings'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

export default FinancialYearClosingPage;
