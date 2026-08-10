import { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, Users, Save, User, BadgeCheck } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../api/api';
import { useAuth } from '../../../context/AuthContext';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { CommitteeForm } from './form';

const EMPTY_FORM = {
  chairman: '',
  viceChairman1: '',
  viceChairman2: '',
  directors: [],
  payload: {}
};

function buildFormFromRecord(record = {}) {
  return {
    chairman: record.chairman || '',
    viceChairman1: record.viceChairman || '',
    viceChairman2: record.viceChairman2 || record.payload?.viceChairman2 || '',
    directors: Array.isArray(record.directors) ? record.directors : [],
    payload: record.payload || {}
  };
}

export function CommitteePage() {
  const { token, hasPermission } = useAuth();
  const [record, setRecord] = useState(null);
  const [draft, setDraft] = useState(EMPTY_FORM);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const canWrite = hasPermission('committee.write');

  useEffect(() => {
    let mounted = true;
    Promise.all([
      api.banking.getMaster('/masters/committee', token),
      api.resources.list('/banking/masters/members', token)
    ])
      .then(([committeeRes, membersRes]) => {
        if (!mounted) return;
        const nextRecord = committeeRes.data || null;
        setRecord(nextRecord);
        setDraft(buildFormFromRecord(nextRecord || {}));
        setMembers(membersRes.data || []);
      })
      .catch((error) => {
        if (!mounted) return;
        toast.error(error.message || 'Unable to load committee');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [token]);

  async function saveCommittee(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        chairman: draft.chairman.trim(),
        viceChairman: draft.viceChairman1.trim(),
        viceChairman2: draft.viceChairman2.trim(),
        directors: draft.directors
      };
      const response = await api.banking.updateMaster('/masters/committee', token, payload);
      const nextRecord = response.data || response;
      setRecord(nextRecord);
      setDraft(buildFormFromRecord(nextRecord || {}));
      toast.success('Committee updated');
    } catch (error) {
      toast.error(error.message || 'Unable to save committee');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Members of Managing Committee</h1>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-start gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary,#1661F6)] shrink-0">
              <ShieldCheck size={22} strokeWidth={1.5} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">Committee Setup</h3>
              <p className="text-[13px] text-slate-500">Update the leadership names used across the system.</p>
            </div>
          </div>

          <CommitteeForm value={draft} setValue={setDraft} onSubmit={saveCommittee} members={members} />

          <div className="flex justify-end pt-6">
            <Button
              type="submit"
              form="committee-form"
              disabled={!canWrite || saving}
              className="gap-2 bg-[var(--primary,#1661F6)] text-white hover:bg-[color-mix(in_srgb,var(--primary)_90%,black)] border-none"
            >
              <Save size={16} />
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </Card>

        <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-start gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary,#1661F6)] shrink-0">
              <BadgeCheck size={22} strokeWidth={1.5} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">Saved Data</h3>
              <p className="text-[13px] text-slate-500">A quick preview of the stored committee record.</p>
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Chairman</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{record?.chairman || '-'}</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Vice Chairman 1</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{record?.viceChairman || '-'}</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Vice Chairman 2</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{record?.payload?.viceChairman2 || '-'}</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-slate-500">
                <Users size={14} />
                <p className="text-[11px] font-semibold uppercase tracking-wider">Directors</p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {Array.isArray(record?.directors) && record.directors.length > 0 ? (
                  record.directors.map((name) => (
                    <span key={name} className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-[12px] font-medium text-slate-700">
                      <User size={12} className="mr-1.5" />
                      {name}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-slate-400">No directors configured</span>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-5 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary,#1661F6)]">
                  <Users size={22} strokeWidth={1.5} />
                </div>
                <div>
                  <p className="text-[13px] font-bold text-slate-900">Total Directors</p>
                  <p className="text-[11px] font-medium text-slate-500 mt-0.5">Active committee members</p>
                </div>
              </div>
              <div className="flex h-11 min-w-[44px] items-center justify-center rounded-[14px] bg-white border border-slate-200 shadow-sm px-3">
                <span className="text-lg font-bold text-[var(--primary,#1661F6)]">
                  {String(draft.directors?.length || record?.directors?.length || 0)}
                </span>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default CommitteePage;
