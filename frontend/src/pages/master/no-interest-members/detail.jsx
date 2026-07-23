import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Edit2, Ban, AlertCircle, Calendar, UserRound, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../api/api';
import { useAuth } from '../../../context/AuthContext';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { NoInterestMemberForm } from './form';
import { buildNoInterestMemberPayload, createNoInterestMemberDraftFromRecord, getMemberLabel } from './noInterestMemberUtils';

function DetailRow({ label, value }) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-4 border-b border-slate-100 py-4 last:border-b-0">
      <div className="text-[13px] font-medium text-slate-500">{label}</div>
      <div className="text-[14px] font-medium text-slate-900">{value || '—'}</div>
    </div>
  );
}

export function NoInterestMemberDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token, hasPermission } = useAuth();
  const [record, setRecord] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState(null);

  const canManage = hasPermission('no-interest-members.write');

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    Promise.all([
      api.resources.get('/banking/masters/no-interest-members', id, token),
      api.resources.list('/banking/masters/members', token)
    ])
      .then(([recordRes, membersRes]) => {
        if (!mounted) return;
        setRecord(recordRes.data || null);
        setMembers(membersRes.data || []);
      })
      .catch((error) => {
        if (!mounted) return;
        toast.error(error.message || 'Unable to load record');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [id, token]);

  function openEditor() {
    if (!record) return;
    setDraft(createNoInterestMemberDraftFromRecord(record));
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setDraft(null);
  }

  async function saveRecord(event) {
    event.preventDefault();
    if (!record || !draft) return;

    setSaving(true);
    try {
      const payload = buildNoInterestMemberPayload(draft);
      const response = await api.resources.update('/banking/masters/no-interest-members', record.id, payload, token);
      setRecord(response.data || record);
      toast.success('Record updated');
      closeEditor();
    } catch (error) {
      toast.error(error.message || 'Unable to save record');
    } finally {
      setSaving(false);
    }
  }

  const memberLookup = useMemo(() => new Map(members.map((member) => [String(member.code || '').toUpperCase(), member])), [members]);
  const statusBadge = String(record?.status || 'Active').toLowerCase() === 'active'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-rose-200 bg-rose-50 text-rose-700';

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
      </div>
    );
  }

  if (!record) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
        Record not found
      </div>
    );
  }

  const recordCode = record.code || '—';
  const member = memberLookup.get(String(record.memberCode || '').trim().toUpperCase());

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-[13px] font-medium text-slate-500">
        <button type="button" onClick={() => navigate(-1)} className="flex items-center gap-1.5 transition-colors hover:text-slate-900">
          <ArrowLeft size={14} /> Back
        </button>
        <span className="text-slate-300">/</span>
        <span className="text-slate-900">No Interest Member Detail</span>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-6 bg-[#3b79f6] px-8 py-10 text-white md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-white/20 bg-white/15 shadow-xl">
              <Ban size={34} />
            </div>
            <div>
              <p className="mb-2 text-sm text-blue-50">{recordCode}</p>
              <h1 className="text-3xl font-bold tracking-tight">{record.reason || 'No Interest Member'}</h1>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium ${statusBadge}`}>
                  <CheckCircle2 size={14} />
                  {record.status || 'Active'}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[13px] font-medium">
                  <UserRound size={14} />
                  {getMemberLabel(member) || record.memberCode}
                </span>
              </div>
            </div>
          </div>

          {canManage ? (
            <Button variant="secondary" type="button" onClick={openEditor} className="gap-2 bg-white text-slate-900 hover:bg-slate-100">
              <Edit2 size={16} />
              Edit Record
            </Button>
          ) : null}
        </div>

        <div className="p-8">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-6 py-5">
                <h2 className="text-lg font-semibold text-slate-900">Record Info</h2>
                <p className="mt-1 text-sm text-slate-500">Member exclusion details.</p>
              </div>
              <div className="divide-y divide-slate-100 px-6">
                <DetailRow label="Record Code" value={recordCode} />
                <DetailRow label="Member" value={getMemberLabel(member) || record.memberCode} />
                <DetailRow label="Reason" value={record.reason} />
                <DetailRow label="From Date" value={record.fromDate} />
                <DetailRow label="To Date" value={record.toDate} />
                <DetailRow label="Status" value={record.status} />
              </div>
            </Card>

            <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-6 py-5">
                <h2 className="text-lg font-semibold text-slate-900">Status Summary</h2>
                <p className="mt-1 text-sm text-slate-500">Current exclusion period and member mapping.</p>
              </div>
              <div className="divide-y divide-slate-100 px-6">
                <DetailRow label="Record Status" value={record.status} />
                <DetailRow label="Member Code" value={record.memberCode} />
                <DetailRow label="Period" value={`${record.fromDate || '—'} to ${record.toDate || '—'}`} />
                <DetailRow label="Reason Tag" value={record.reason} />
              </div>
            </Card>
          </div>
        </div>
      </div>

      <Modal
        open={editorOpen}
        title="Edit Record"
        subtitle="Update member exclusion details."
        onClose={closeEditor}
        width="min(980px, 96vw)"
        footer={
          <div className="flex justify-end gap-3 w-full">
            <Button variant="secondary" type="button" onClick={closeEditor}>Cancel</Button>
            <Button type="submit" form="no-interest-member-form" disabled={saving} className="bg-[#3b79f6] hover:bg-blue-700 text-white shadow-sm rounded-lg px-6">
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        }
      >
        {draft ? (
          <NoInterestMemberForm
            value={draft}
            setValue={setDraft}
            onSubmit={saveRecord}
            members={members}
          />
        ) : null}
      </Modal>
    </div>
  );
}

export default NoInterestMemberDetailPage;

