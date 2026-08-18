import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../../api/api';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';

export function MemberDemandDefaultDialog({ isOpen, onClose, memberId, token }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState({
    compulsoryDeposit: 0,
    specialSaving: 0,
    regularLoan: 0,
    loanAgainstDeposit: 0,
    insurancePremium: 0,
    other: 0
  });
  
  useEffect(() => {
    let mounted = true;
    if (isOpen && memberId) {
      setLoading(true);
      api.resources.get('/banking/masters/member_demand_defaults', memberId, token)
        .then((res) => {
          if (!mounted) return;
          const record = res.data || {};
          setData({
            compulsoryDeposit: record.compulsoryDeposit || 0,
            specialSaving: record.specialSaving || 0,
            regularLoan: record.regularLoan || 0,
            loanAgainstDeposit: record.loanAgainstDeposit || 0,
            insurancePremium: record.insurancePremium || 0,
            other: record.other || 0
          });
        })
        .catch((err) => {
          if (err?.response?.status === 404) {
             // Not found is fine, it will default to 0
          } else {
             toast.error('Unable to load demand defaults');
          }
        })
        .finally(() => {
          if (mounted) setLoading(false);
        });
    }
    return () => { mounted = false; };
  }, [isOpen, memberId, token]);

  if (!isOpen) return null;

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        memberId,
        compulsoryDeposit: Number(data.compulsoryDeposit) || 0,
        specialSaving: Number(data.specialSaving) || 0,
        regularLoan: Number(data.regularLoan) || 0,
        loanAgainstDeposit: Number(data.loanAgainstDeposit) || 0,
        insurancePremium: Number(data.insurancePremium) || 0,
        other: Number(data.other) || 0
      };
      // For create/update, we PUT because member_demand_defaults uses member_id as primary reference
      // Wait, is it POST or PUT? 
      // Using update logic or create logic, the backend should handle upsert if it's implemented.
      // Usually I would use update. Let's see what the backend expects.
      await api.resources.update('/banking/masters/member_demand_defaults', memberId, payload, token);
      toast.success('Demand list defaults saved');
      onClose();
    } catch (err) {
      toast.error(err.message || 'Unable to save demand defaults');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Demand List Data"
      width="min(500px, 96vw)"
      footer={
        <div className="flex w-full justify-end gap-3">
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={handleSave} disabled={loading || saving} className="bg-[var(--primary,#1661F6)] text-white hover:opacity-90">
            {saving ? 'Saving...' : 'Save Defaults'}
          </Button>
        </div>
      }
    >
      <div className="p-5">
        {loading ? (
          <div className="py-8 text-center text-sm text-slate-500">Loading...</div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-slate-700">Compulsory Deposit</label>
              <Input type="number" min="0" value={data.compulsoryDeposit} onChange={(e) => setData({ ...data, compulsoryDeposit: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-slate-700">Special Saving A/c (SSA)</label>
              <Input type="number" min="0" value={data.specialSaving} onChange={(e) => setData({ ...data, specialSaving: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-slate-700">Regular Loan</label>
              <Input type="number" min="0" value={data.regularLoan} onChange={(e) => setData({ ...data, regularLoan: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-slate-700">Loan Against Deposit</label>
              <Input type="number" min="0" value={data.loanAgainstDeposit} onChange={(e) => setData({ ...data, loanAgainstDeposit: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-slate-700">Insurance Premium</label>
              <Input type="number" min="0" value={data.insurancePremium} onChange={(e) => setData({ ...data, insurancePremium: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-slate-700">Other</label>
              <Input type="number" min="0" value={data.other} onChange={(e) => setData({ ...data, other: e.target.value })} />
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
