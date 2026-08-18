import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Edit2, Shield, User, CalendarDays, Home, Coins, Wallet, PiggyBank, Landmark, PieChart, Lock, Star, ShieldCheck, Banknote, Umbrella } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState('identity');

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
        <div className="flex flex-col gap-6 bg-white px-8 py-10 text-slate-900 border-b border-slate-100">
          <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
            <div className="relative">
              <UserAvatar
                name={memberName}
                url={member.photoUrl}
                className="h-28 w-28 border-[3px] border-white ring-1 ring-slate-200 text-3xl shadow-md"
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

            <div className="flex-1">
              <p className="mb-1 text-[13px] font-semibold text-[var(--primary)] tracking-wide">{memberCode}</p>
              <h1 className="text-2xl font-bold tracking-tight">{memberName}</h1>
              <div className="mt-4 flex flex-wrap items-center gap-2 justify-center sm:justify-start">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[13px] font-medium text-slate-700">
                  <Shield size={14} className="text-slate-400" />
                  {membershipNo}
                </span>
                {status === 'Active' ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[13px] font-medium text-emerald-700">
                    {status}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-[13px] font-medium text-rose-700">
                    {status}
                  </span>
                )}
                {summaryLabel.map((item) => (
                  <span key={item} className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[13px] font-medium text-slate-700">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex border-b border-slate-200 px-8 pt-4">
          {[
            { id: 'identity', label: 'Identity' },
            { id: 'membership', label: 'Membership' },
            { id: 'contact', label: 'Contact Details' },
            { id: 'balances', label: 'Balances' },
            { id: 'documents', label: 'Documents' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative px-4 py-3 text-[14px] font-medium transition-colors ${
                activeTab === tab.id ? 'text-[var(--primary)]' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
              {activeTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-[3px] rounded-t-full bg-[var(--primary)]" />}
            </button>
          ))}
        </div>

        <div className="p-8 space-y-6">

            {activeTab === 'identity' && (
              <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="divide-y divide-slate-100 px-6">
                  <DetailRow label="Member Code" value={memberCode} />
                  <DetailRow label="Member Name" value={memberName} />
                  <DetailRow label="Father / Husband Name" value={member.fatherOrHusbandName} />
                  <DetailRow label="Branch" value={formatBranchLabel(memberBranch) || member.branchCode} />
                  <DetailRow label="Category" value={member.category} />
                  <DetailRow label="Caste" value={member.caste} />
                  <DetailRow label="Occupation / Designation" value={member.designation} />
                  <DetailRow label="Status" value={status} />
                  <DetailRow label="Dismembered" value={(member.dismembered ?? member.payload?.dismembered) ? "Yes" : "No"} />
                  <DetailRow label="Dismembered Date" value={member.dismemberedDate || member.payload?.dismemberedDate} />
                </div>
              </Card>
            )}

            {activeTab === 'membership' && (
              <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="divide-y divide-slate-100 px-6">
                  <DetailRow label="Membership No" value={membershipNo} />
                  <DetailRow label="Membership Date" value={member.membershipDate} />
                  <DetailRow label="Appointment Date" value={member.appointmentDate} />
                  <DetailRow label="Date of Birth" value={member.dateOfBirth} />
                  <DetailRow label="Surety 1" value={member.serviceName1} />
                  <DetailRow label="Surety 2" value={member.serviceName2} />
                </div>
              </Card>
            )}

            {activeTab === 'contact' && (
              <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="divide-y divide-slate-100 px-6">
                  <DetailRow label="Mobile No" value={formatMemberPhone(member.mobileNo || '') || '—'} />
                  <DetailRow label="Address" value={member.address || '—'} />
                  <DetailRow label="Nominee Name" value={member.nomineeName || '—'} />
                  <DetailRow label="Nominee Relation" value={member.nomineeRelation || "-"} />
                </div>
              </Card>
            )}

            {activeTab === 'balances' && (
              <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
                <div className="grid gap-4 md:grid-cols-3">
                  {[
                    { label: 'Opening Balance', value: formatMoney(member.openingBalance), icon: Wallet, color: 'text-blue-500', bg: 'bg-blue-50' },
                    { label: 'Deposit Balance', value: formatMoney(member.depositBalance ?? balances.compulsoryDeposit), icon: PiggyBank, color: 'text-emerald-500', bg: 'bg-emerald-50' },
                    { label: 'Regular Loan', value: formatMoney(member.loanOutstanding), icon: Landmark, color: 'text-rose-500', bg: 'bg-rose-50' },
                    { label: 'Share', value: formatMoney(balances.share), icon: PieChart, color: 'text-indigo-500', bg: 'bg-indigo-50' },
                    { label: 'Compulsory Deposit', value: formatMoney(balances.compulsoryDeposit ?? member.depositBalance), icon: Lock, color: 'text-teal-500', bg: 'bg-teal-50' },
                    { label: 'Special Saving', value: formatMoney(balances.specialSaving), icon: Star, color: 'text-amber-500', bg: 'bg-amber-50' },
                    { label: 'Provident Fund', value: formatMoney(balances.providentFund), icon: ShieldCheck, color: 'text-purple-500', bg: 'bg-purple-50' },
                    { label: 'Loan Against Deposit', value: formatMoney(balances.loanAgainstDeposit), icon: Banknote, color: 'text-orange-500', bg: 'bg-orange-50' },
                    { label: 'Insurance Premium', value: formatMoney(balances.insurancePremium), icon: Umbrella, color: 'text-cyan-500', bg: 'bg-cyan-50' }
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <div key={item.label} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.bg} ${item.color}`}>
                            <Icon size={18} strokeWidth={2} />
                          </div>
                          <p className="text-[12px] font-semibold uppercase tracking-wider text-slate-500">{item.label}</p>
                        </div>
                        <p className="mt-4 text-xl font-bold text-slate-900">{item.value}</p>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {activeTab === 'documents' && (
              <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <DocumentSection
                  title=""
                  description=""
                  definitions={MEMBER_DOCUMENT_DEFS}
                  documents={member.documents || {}}
                  editable={false}
                />
              </Card>
            )}
        </div>
      </div>
    </div>
  );
}

export default MemberDetailPage;
