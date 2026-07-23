import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Edit2, Building2, MapPin, Phone, GitBranch, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../api/api';
import { useAuth } from '../../../context/AuthContext';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { BranchForm } from './form';
import { buildBranchPayload, createBranchDraftFromRecord } from './branchUtils';

function DetailRow({ label, value }) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-4 border-b border-slate-100 py-4 last:border-b-0">
      <div className="text-[13px] font-medium text-slate-500">{label}</div>
      <div className="text-[14px] font-medium text-slate-900">{value || '—'}</div>
    </div>
  );
}

export function BranchDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token, hasPermission } = useAuth();
  const [branch, setBranch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState(null);

  const canManage = hasPermission('branches.write');

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    api.resources.get('/banking/masters/branches', id, token)
      .then((response) => {
        if (!mounted) return;
        setBranch(response.data || null);
      })
      .catch((error) => {
        if (!mounted) return;
        toast.error(error.message || 'Unable to load branch');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [id, token]);

  function openEditor() {
    if (!branch) return;
    setDraft(createBranchDraftFromRecord(branch));
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setDraft(null);
  }

  async function saveBranch(event) {
    event.preventDefault();
    if (!branch || !draft) return;

    setSaving(true);
    try {
      const payload = buildBranchPayload(draft);
      const response = await api.resources.update('/banking/masters/branches', branch.id, payload, token);
      setBranch(response.data || branch);
      toast.success('Branch updated');
      closeEditor();
    } catch (error) {
      toast.error(error.message || 'Unable to save branch');
    } finally {
      setSaving(false);
    }
  }

  const statusBadge = useMemo(() => (
    branch?.isActive !== false
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : 'border-rose-200 bg-rose-50 text-rose-700'
  ), [branch?.isActive]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
      </div>
    );
  }

  if (!branch) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
        Branch not found
      </div>
    );
  }

  const branchCode = branch.code || '—';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-[13px] font-medium text-slate-500">
        <button type="button" onClick={() => navigate(-1)} className="flex items-center gap-1.5 transition-colors hover:text-slate-900">
          <ArrowLeft size={14} /> Back
        </button>
        <span className="text-slate-300">/</span>
        <span className="text-slate-900">Branch Detail</span>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-6 bg-[#3b79f6] px-8 py-10 text-white md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-white/20 bg-white/15 shadow-xl">
              <GitBranch size={34} />
            </div>
            <div>
              <p className="mb-2 text-sm text-blue-50">{branchCode}</p>
              <h1 className="text-3xl font-bold tracking-tight">{branch.label || 'Branch'}</h1>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium ${statusBadge}`}>
                  <CheckCircle2 size={14} />
                  {branch.isActive !== false ? 'Active' : 'Inactive'}
                </span>
                {branch.place ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[13px] font-medium">
                    <MapPin size={14} />
                    {branch.place}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {canManage ? (
            <Button variant="secondary" type="button" onClick={openEditor} className="gap-2 bg-white text-slate-900 hover:bg-slate-100">
              <Edit2 size={16} />
              Edit Branch
            </Button>
          ) : null}
        </div>

        <div className="p-8">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-6 py-5">
                <h2 className="text-lg font-semibold text-slate-900">Branch Info</h2>
                <p className="mt-1 text-sm text-slate-500">Core branch identity and status.</p>
              </div>
              <div className="divide-y divide-slate-100 px-6">
                <DetailRow label="Branch Code" value={branchCode} />
                <DetailRow label="Branch Name" value={branch.label} />
                <DetailRow label="Place" value={branch.place} />
                <DetailRow label="District" value={branch.district} />
                <DetailRow label="Phone" value={branch.phone} />
                <DetailRow label="Status" value={branch.isActive !== false ? 'Active' : 'Inactive'} />
              </div>
            </Card>

            <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-6 py-5">
                <h2 className="text-lg font-semibold text-slate-900">Address</h2>
                <p className="mt-1 text-sm text-slate-500">Registered branch address information.</p>
              </div>
              <div className="divide-y divide-slate-100 px-6">
                <DetailRow label="Address" value={branch.address} />
                <DetailRow label="Location" value={branch.place} />
                <DetailRow label="Contact" value={branch.phone} />
                <DetailRow label="Branch Status" value={branch.isActive !== false ? 'Operational' : 'Closed'} />
              </div>
            </Card>
          </div>
        </div>
      </div>

      <Modal
        open={editorOpen}
        title="Edit Branch"
        subtitle="Update branch identity and location details."
        onClose={closeEditor}
        width="min(980px, 96vw)"
        footer={
          <div className="flex justify-end gap-3 w-full">
            <Button variant="secondary" type="button" onClick={closeEditor}>Cancel</Button>
            <Button type="submit" form="branch-form" disabled={saving} className="bg-[#3b79f6] hover:bg-blue-700 text-white shadow-sm rounded-lg px-6">
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        }
      >
        {draft ? (
          <BranchForm
            value={draft}
            setValue={setDraft}
            onSubmit={saveBranch}
          />
        ) : null}
      </Modal>
    </div>
  );
}

export default BranchDetailPage;

