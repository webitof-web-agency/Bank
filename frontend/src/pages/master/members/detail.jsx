import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Edit2, Shield, User, CalendarDays, Home, Coins } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../api/api';
import { useAuth } from '../../../context/AuthContext';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { UserAvatar } from '../../../components/ui/UserAvatar';
import { DocumentSection } from '../../../components/master/DocumentSection';
import { MEMBER_DOCUMENT_DEFS } from '../../../components/master/documentUtils';
import { MemberForm } from './form';
import {
  buildMemberPayload,
  createMemberDraftFromRecord,
  formatBranchLabel,
  formatMemberPhone,
  formatMoney,
  getBranchMap,
  buildNextMemberCode,
  buildNextMembershipNo
} from './memberUtils';
import { uploadDocumentMap } from '../documentUpload';

function getMemberStatus(member) {
  if (!member) return 'Active';
  if (typeof member.status === 'string' && member.status.trim()) {
    return member.status;
  }
  return 'Active';
}

function DetailRow({ label, value }) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-4 border-b border-slate-100 py-4 last:border-b-0">
      <div className="text-[13px] font-medium text-slate-500">{label}</div>
      <div className="text-[14px] font-medium text-slate-900">{value || '—'}</div>
    </div>
  );
}

function SectionCard({ title, children }) {
  return (
    <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-6 py-4">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      </div>
      <div className="px-6">{children}</div>
    </Card>
  );
}

export function MemberDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token, hasPermission } = useAuth();
  const [member, setMember] = useState(null);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const [removedDocumentIds, setRemovedDocumentIds] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');

  const canManage = hasPermission('members.write');
  const branchLookup = useMemo(() => getBranchMap(branches), [branches]);
  const statusLabel = getMemberStatus(member);
  const memberBranch = branchLookup.get(String(member?.branchCode || '').trim().toUpperCase());
  const balances = member?.balances || {};

  useEffect(() => {
    let mounted = true;
    Promise.all([
      api.resources.get('/banking/masters/members', id, token),
      api.resources.list('/banking/masters/branches', token)
    ])
      .then(([memberRes, branchesRes]) => {
        if (!mounted) return;
        setMember(memberRes.data || null);
        setBranches(branchesRes.data || []);
      })
      .catch((error) => {
        if (!mounted) return;
        toast.error(error.message || 'Unable to load member');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [id, token]);

  function openEditor() {
    if (!member) return;
    navigate(`/app/master/members/${id}/edit`);
  }

  function handleDocumentRemove(key, document) {
    if (document?.fileId) {
      setRemovedDocumentIds((current) => (current.includes(document.fileId) ? current : [...current, document.fileId]));
    }
  }

  async function handleDeleteDocument(key, document) {
    if (!canManage || !document?.fileId || !member) return;
    const label = document.originalName || key;
    if (!window.confirm(`Delete ${label}?`)) return;

    try {
      await api.files.remove(token, document.fileId);
      const nextDocuments = { ...(member.documents || {}) };
      delete nextDocuments[key];
      const response = await api.resources.update('/banking/masters/members', member.id, { documents: nextDocuments }, token);
      setMember(response.data || { ...member, documents: nextDocuments });
      toast.success('Document removed');
    } catch (error) {
      toast.error(error.message || 'Unable to remove document');
    }
  }



  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
      </div>
    );
  }

  if (!member) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
        Member not found
      </div>
    );
  }

  const memberName = member.name || 'Member';
  const memberCode = member.code || buildNextMemberCode([]);
  const membershipNo = member.membershipNo || buildNextMembershipNo([]);
  const status = String(statusLabel || 'Active');
  const summaryLabel = [
    member.branchCode ? formatBranchLabel(memberBranch) || member.branchCode : '',
    member.category,
    membershipNo
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-[13px] font-medium text-slate-500">
        <button type="button" onClick={() => navigate(-1)} className="flex items-center gap-1.5 transition-colors hover:text-slate-900">
          <ArrowLeft size={14} /> Back
        </button>
        <span className="text-slate-300">/</span>
        <span className="text-slate-900">Member Profile</span>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-6 bg-[#3b79f6] px-8 py-10 text-white">
          <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
            <div className="relative">
              <UserAvatar
                name={memberName}
                url={member.photoUrl}
                className="h-28 w-28 border-4 border-white text-3xl shadow-xl"
                fallbackSize={40}
              />
              <button
                type="button"
                onClick={openEditor}
                className="absolute bottom-0 right-0 inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-lg transition hover:bg-slate-50"
                title="Edit member"
              >
                <Edit2 size={15} />
              </button>
            </div>

            <div>
              <h1 className="text-2xl font-bold tracking-tight">{memberName}</h1>
              <p className="mt-1 text-sm text-blue-50">{memberCode}</p>
              <div className="mt-4 flex flex-wrap items-center gap-3 justify-center sm:justify-start">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[13px] font-medium">
                  <Shield size={14} />
                  {membershipNo}
                </span>
                <span className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[13px] font-medium">
                  {status}
                </span>
                {summaryLabel.map((item) => (
                  <span key={item} className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[13px] font-medium">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex border-b border-slate-200 px-8 pt-4">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'documents', label: 'Documents' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative px-4 py-3 text-[14px] font-medium transition-colors ${
                activeTab === tab.id ? 'text-[#3b79f6]' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
              {activeTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#3b79f6]" />}
            </button>
          ))}
        </div>

        <div className="p-8 space-y-6">
          {activeTab === 'overview' ? (
            <>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">General Info</h2>
                  <p className="mt-1 text-sm text-slate-500">Member identity, membership, and balance details.</p>
                </div>
                {canManage ? (
                  <Button variant="secondary" type="button" onClick={openEditor} className="gap-2">
                    <Edit2 size={16} />
                    Edit Member
                  </Button>
                ) : null}
              </div>

              <div className="grid gap-6">
                <SectionCard title="Identity">
                  <div className="divide-y divide-slate-100">
                    <DetailRow label="Member Code" value={memberCode} />
                    <DetailRow label="Member Name" value={memberName} />
                    <DetailRow label="Father / Husband Name" value={member.fatherOrHusbandName} />
                    <DetailRow label="Branch" value={formatBranchLabel(memberBranch) || member.branchCode} />
                    <DetailRow label="Category" value={member.category} />
                    <DetailRow label="Caste" value={member.caste} />
                    <DetailRow label="Occupation / Designation" value={member.designation} />
                    <DetailRow label="Status" value={status} />
                  </div>
                </SectionCard>

                <SectionCard title="Membership">
                  <div className="grid gap-4 md:grid-cols-2">
                    {[
                      { icon: Shield, label: 'Membership No', value: membershipNo },
                      { icon: CalendarDays, label: 'Membership Date', value: member.membershipDate || '—' },
                      { icon: CalendarDays, label: 'Appointment Date', value: member.appointmentDate || '—' },
                      { icon: CalendarDays, label: 'Date of Birth', value: member.dateOfBirth || '—' },
                      { icon: Home, label: 'Service Name 1', value: member.serviceName1 || '—' },
                      { icon: Home, label: 'Service Name 2', value: member.serviceName2 || '—' }
                    ].map((item) => {
                      const Icon = item.icon;
                      return (
                        <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="flex items-center gap-2 text-slate-500">
                            <Icon size={14} />
                            <p className="text-[11px] font-semibold uppercase tracking-wider">{item.label}</p>
                          </div>
                          <p className="mt-2 text-sm font-semibold text-slate-900">{item.value}</p>
                        </div>
                      );
                    })}
                  </div>
                </SectionCard>

                <SectionCard title="Contact">
                  <div className="divide-y divide-slate-100">
                    <DetailRow label="Mobile No" value={formatMemberPhone(member.mobileNo || '') || '—'} />
                    <DetailRow label="Address" value={member.address || '—'} />
                    <DetailRow label="Nominee Name" value={member.nomineeName || '—'} />
                    <DetailRow label="Nominee Relation" value={member.nomineeRelation || '—'} />
                  </div>
                </SectionCard>

                <SectionCard title="Balances">
                  <div className="grid gap-4 md:grid-cols-3">
                    {[
                      { label: 'Opening Balance', value: formatMoney(member.openingBalance) },
                      { label: 'Deposit Balance', value: formatMoney(member.depositBalance ?? balances.compulsoryDeposit) },
                      { label: 'Loan Outstanding', value: formatMoney(member.loanOutstanding) },
                      { label: 'Share', value: formatMoney(balances.share) },
                      { label: 'Compulsory Deposit', value: formatMoney(balances.compulsoryDeposit ?? member.depositBalance) },
                      { label: 'Special Saving', value: formatMoney(balances.specialSaving) },
                      { label: 'Provident Fund', value: formatMoney(balances.providentFund) },
                      { label: 'Loan Against Deposit', value: formatMoney(balances.loanAgainstDeposit) },
                      { label: 'Insurance Premium', value: formatMoney(balances.insurancePremium) }
                    ].map((item) => (
                      <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center gap-2 text-slate-500">
                          <Coins size={14} />
                          <p className="text-[11px] font-semibold uppercase tracking-wider">{item.label}</p>
                        </div>
                        <p className="mt-2 text-sm font-semibold text-slate-900">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              </div>
            </>
          ) : (
            <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <DocumentSection
                title="Member Documents"
                description="Aadhaar, PAN, signature, nominee and income verification files."
                definitions={MEMBER_DOCUMENT_DEFS}
                documents={member.documents || {}}
                editable={false}
                onDeleteFile={canManage ? handleDeleteDocument : undefined}
              />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

export default MemberDetailPage;
