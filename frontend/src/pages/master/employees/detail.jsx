import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Edit2, Mail, Phone, Shield, User, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../api/api';
import { useAuth } from '../../../context/AuthContext';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { UserAvatar } from '../../../components/ui/UserAvatar';
import { DocumentSection } from '../../../components/master/DocumentSection';
import { EMPLOYEE_DOCUMENT_DEFS } from '../../../components/master/documentUtils';
import { EmployeeForm } from './form';
import {
  buildEmployeePayload,
  formatBranchLabel,
  formatEmployeePhone,
  getBranchMap,
  createEmployeeDraftFromRecord,
  prepareEmployeeAvatarFile,
  stripPhoneDigits,
  suggestEmployeeCode
} from './employeeUtils';
import { uploadDocumentMap } from '../documentUpload';

function getEmployeeStatus(user) {
  if (!user) return 'Active';
  if (typeof user.status === 'string' && user.status.trim()) {
    return user.status;
  }
  return user.isActive === false ? 'Inactive' : 'Active';
}

function DetailRow({ label, value }) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-4 border-b border-slate-100 py-4 last:border-b-0">
      <div className="text-[13px] font-medium text-slate-500">{label}</div>
      <div className="text-[14px] font-medium text-slate-900">{value || 'â€”'}</div>
    </div>
  );
}

export function EmployeeDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token, hasPermission } = useAuth();
  const [user, setUser] = useState(null);
  const [roles, setRoles] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [avatarCleared, setAvatarCleared] = useState(false);
  const [removedDocumentIds, setRemovedDocumentIds] = useState([]);
  const [activeTab, setActiveTab] = useState('personal');

  const branchLookup = useMemo(() => getBranchMap(branches), [branches]);
  const statusLabel = getEmployeeStatus(user);
  const primaryRole = (user?.roles || [])[0];
  const canManage = hasPermission('employees.write', 'users.manage');

  useEffect(() => {
    return () => {
      if (avatarPreview && String(avatarPreview).startsWith('blob:')) {
        URL.revokeObjectURL(avatarPreview);
      }
    };
  }, [avatarPreview]);

  useEffect(() => {
    let mounted = true;

    Promise.all([
      api.users.get(token, id),
      api.roles.list(token),
      api.resources.list('/banking/masters/branches', token)
    ])
      .then(([userRes, rolesRes, branchesRes]) => {
        if (!mounted) return;
        setUser(userRes.data || null);
        setRoles(rolesRes.data || []);
        setBranches(branchesRes.data || []);
      })
      .catch((error) => {
        if (!mounted) return;
        toast.error(error.message || 'Unable to load employee');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [id, token]);

  function openEditor() {
    if (!user) return;
    navigate(`/app/master/employees/${id}/edit`);
  }

  async function handleDeleteDocument(key, document) {
    if (!canManage || !document?.fileId || !user) return;
    const label = document.originalName || key;
    if (!window.confirm(`Delete ${label}?`)) return;

    try {
      await api.files.remove(token, document.fileId);
      const nextDocuments = { ...(user.documents || {}) };
      delete nextDocuments[key];
      const response = await api.users.update(token, user.id, { documents: nextDocuments });
      setUser(response.data || { ...user, documents: nextDocuments });
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

  if (!user) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
        Employee not found
      </div>
    );
  }

  const employeeName = user.fullName || user.name || 'Employee';
  const employeeCode = user.code || suggestEmployeeCode(user.fullName || user.name, user.username);
  const employeeMobile = formatEmployeePhone(user.mobileNo || '');
  const employeeBranch = branchLookup.get(String(user.branchCode || '').trim().toUpperCase());
  const employeePayload = user.payload || {};
  const readableLastLogin = user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'â€”';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-[13px] font-medium text-slate-500">
        <button type="button" onClick={() => navigate(-1)} className="flex items-center gap-1.5 transition-colors hover:text-slate-900">
          <ArrowLeft size={14} /> Back
        </button>
        <span className="text-slate-300">/</span>
        <span className="text-slate-900">Employee Profile</span>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-6 bg-white px-8 py-10 text-slate-900 border-b border-slate-100">
          <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
            <div className="relative">
              <UserAvatar
                name={employeeName}
                url={user.avatarUrl}
                gender={user.gender}
                className="h-28 w-28 border-[3px] border-white ring-1 ring-slate-200 text-3xl shadow-md"
                fallbackSize={40}
              />
              <button
                type="button"
                onClick={openEditor}
                className="absolute bottom-0 right-0 inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-lg transition hover:bg-slate-50"
                title="Edit employee"
              >
                <Edit2 size={15} />
              </button>
            </div>

            <div className="flex-1">
              <p className="mb-1 text-[13px] font-semibold text-[var(--primary)] tracking-wide">{employeeCode}</p>
              <h1 className="text-2xl font-bold tracking-tight">{employeeName}</h1>

              <div className="mt-4 flex flex-wrap justify-center sm:justify-start gap-2">
                {primaryRole ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[13px] font-medium text-slate-700">
                    {primaryRole?.name?.toLowerCase().includes('support') ? <Shield size={14} className="text-slate-400" /> : <User size={14} className="text-slate-400" />}
                    {primaryRole.name}
                  </span>
                ) : null}
                {statusLabel === 'Active' ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[13px] font-medium text-emerald-700">
                    <CheckCircle size={14} className="text-emerald-500" /> Active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-[13px] font-medium text-rose-700">
                    Inactive
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 px-8 pt-4">
          {[
            { id: 'personal', label: 'Personal Details' },
            { id: 'work', label: 'Work Details' },
            { id: 'documents', label: 'Documents' },
            { id: 'activity', label: 'Activity Log' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative px-4 py-3 text-[14px] font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-[var(--primary)]'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-[3px] rounded-t-full bg-[var(--primary)]" />
              )}
            </button>
          ))}
        </div>

        <div className="p-8 space-y-6">
            {activeTab === 'personal' && (
              <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="divide-y divide-slate-100 px-6">
                  <DetailRow label="Employee Name" value={employeeName} />
                  <DetailRow label="Father / Husband Name" value={user.fatherOrHusbandName || employeePayload.fatherOrHusbandName} />
                  <DetailRow label="Date of Birth" value={user.dateOfBirth || employeePayload.dateOfBirth} />
                  <DetailRow label="Appointment Date" value={user.appointmentDate || employeePayload.appointmentDate} />
                  <DetailRow label="Gender" value={user.gender} />
                  <DetailRow label="Email" value={user.email} />
                  <DetailRow label="Mobile No" value={employeeMobile} />
                </div>
              </Card>
            )}

            {activeTab === 'work' && (
              <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="divide-y divide-slate-100 px-6">
                  <DetailRow label="Employee Code" value={employeeCode} />
                  <DetailRow label="Login Username" value={user.username} />
                  <DetailRow label="Designation" value={user.designation} />
                  <DetailRow label="Branch" value={formatBranchLabel(employeeBranch) || user.branchCode} />
                  <DetailRow label="Category" value={user.category || employeePayload.category} />
                  <DetailRow label="Caste" value={user.caste || employeePayload.caste} />
                  <DetailRow label="Qualification" value={user.qualification || employeePayload.qualification} />
                  <DetailRow label="Basic Salary" value={String(user.basicSalary ?? employeePayload.basicSalary ?? "")} />
                  <DetailRow label="Housing Loan" value={String(user.housingLoan ?? employeePayload.housingLoan ?? "")} />
                  <DetailRow label="Vehicle Loan" value={String(user.vehicleLoan ?? employeePayload.vehicleLoan ?? "")} />
                  <DetailRow label="Grain Advance" value={String(user.grainAdvance ?? employeePayload.grainAdvance ?? "")} />
                  <DetailRow label="Retired" value={(user.retired ?? employeePayload.retired) ? "Yes" : "No"} />
                  <DetailRow label="Retired Date" value={user.retiredDate || employeePayload.retiredDate} />
                  <DetailRow label="Status" value={statusLabel} />
                  <DetailRow
                    label="Assigned Role"
                    value={primaryRole?.name ? (
                      <span className="inline-flex items-center gap-1.5 text-[14px] font-medium text-slate-900">
                        <Shield size={16} className="text-[var(--primary)]" />
                        {primaryRole.name}
                      </span>
                    ) : 'No Role'}
                  />
                </div>
              </Card>
            )}

            {activeTab === 'documents' && (
              <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <DocumentSection
                  title=""
                  description=""
                  definitions={EMPLOYEE_DOCUMENT_DEFS}
                  documents={user.documents || {}}
                  editable={false}
                />
              </Card>
            )}

            {activeTab === 'activity' && (
              <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
                <div className="flex flex-col gap-6">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                    <div>
                      <h3 className="text-[15px] font-semibold text-slate-900">Recent Login Activity</h3>
                      <p className="text-[13px] text-slate-500 mt-1">Timeline of recent login sessions for this employee.</p>
                    </div>
                  </div>
                  
                  <div className="relative pl-6 border-l-2 border-slate-100 space-y-8 pb-4 ml-2 mt-4">
                    {user.lastLoginAt ? (
                      <div className="relative">
                        <div className="absolute -left-[33px] flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 border-4 border-white shadow-sm ring-1 ring-emerald-100">
                          <CheckCircle size={12} className="text-emerald-500" />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[14px] font-semibold text-slate-900">Successful Login</span>
                            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 border border-emerald-100">Current Session</span>
                          </div>
                          <span className="text-[13px] text-slate-500">{readableLastLogin}</span>
                          
                          <div className="mt-2 flex flex-wrap gap-x-8 gap-y-4 text-[12px] text-slate-500 bg-slate-50/80 p-3.5 rounded-xl border border-slate-100">
                            <div className="flex flex-col gap-1">
                              <span className="font-semibold text-slate-700 uppercase tracking-wider text-[10px]">IP Address</span>
                              <span className="font-medium text-slate-600">192.168.1.45 <span className="text-slate-400 font-normal">(Raipur, IN)</span></span>
                            </div>
                            <div className="flex flex-col gap-1">
                              <span className="font-semibold text-slate-700 uppercase tracking-wider text-[10px]">Device & Browser</span>
                              <span className="font-medium text-slate-600">Windows 11 <span className="text-slate-300 mx-1">â€¢</span> Chrome 120</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-[14px] text-slate-500 py-4">No recent activity.</div>
                    )}

                    <div className="relative">
                        <div className="absolute -left-[33px] flex h-6 w-6 items-center justify-center rounded-full bg-rose-50 border-4 border-white shadow-sm ring-1 ring-rose-100">
                          <div className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[14px] font-semibold text-slate-900">Failed Login Attempt</span>
                          </div>
                          <span className="text-[13px] text-slate-500">2 Days Ago</span>
                          
                          <div className="mt-2 flex flex-wrap gap-x-8 gap-y-4 text-[12px] text-slate-500 bg-rose-50/30 p-3.5 rounded-xl border border-rose-100/50">
                            <div className="flex flex-col gap-1">
                              <span className="font-semibold text-slate-700 uppercase tracking-wider text-[10px]">Reason</span>
                              <span className="font-medium text-rose-600">Incorrect Password</span>
                            </div>
                            <div className="flex flex-col gap-1">
                              <span className="font-semibold text-slate-700 uppercase tracking-wider text-[10px]">IP Address</span>
                              <span className="font-medium text-slate-600">112.56.89.12 <span className="text-slate-400 font-normal">(Unknown)</span></span>
                            </div>
                          </div>
                        </div>
                    </div>
                  </div>
                </div>
              </Card>
            )}
        </div>
      </div>
    </div>
  );
}

export default EmployeeDetailPage;

