import { useRef, useState } from 'react';
import { Camera, Trash2, Upload, User, Briefcase, FileText, Wallet } from 'lucide-react';
import PhoneInput from 'react-phone-input-2';
import { Input, Textarea } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { UserAvatar } from '../../../components/ui/UserAvatar';
import { DocumentSection } from '../../../components/master/DocumentSection';
import { MEMBER_DOCUMENT_DEFS } from '../../../components/master/documentUtils';
import { formatBranchLabel, stripPhoneDigits } from './memberUtils';

const BALANCE_FIELDS = [
  { name: 'openingBalance', label: 'Opening Balance' },
  { name: 'depositBalance', label: 'Deposit Balance' },
  { name: 'loanOutstanding', label: 'Regular Loan', sideName: 'balances.loanOutstandingSide' },
  { name: 'balances.share', label: 'Share Balance', sideName: 'balances.shareSide' },
  { name: 'balances.compulsoryDeposit', label: 'Compulsory Deposit', sideName: 'balances.compulsoryDepositSide' },
  { name: 'balances.specialSaving', label: 'Special Saving', sideName: 'balances.specialSavingSide' },
  { name: 'balances.providentFund', label: 'Provident Fund', sideName: 'balances.providentFundSide' },
  { name: 'balances.loanAgainstDeposit', label: 'Loan Against Deposit', sideName: 'balances.loanAgainstDepositSide' },
  { name: 'balances.insurancePremium', label: 'Insurance Premium', sideName: 'balances.insurancePremiumSide' }
];

function getNestedValue(value = {}, path = '') {
  return path.split('.').reduce((acc, key) => (acc ? acc[key] : undefined), value);
}

function setNestedValue(setValue, current, path, nextValue) {
  const parts = path.split('.');
  if (parts.length === 1) {
    setValue({ ...current, [path]: nextValue });
    return;
  }
  const [root, leaf] = parts;
  setValue({
    ...current,
    [root]: {
      ...(current[root] || {}),
      [leaf]: nextValue
    }
  });
}

export function MemberForm({
  value,
  setValue,
  branches,
  branchesLoading,
  onSubmit,
  isEdit,
  avatarPreview = '',
  avatarBusy = false,
  onAvatarPick,
  onAvatarClear,
  onDocumentRemove,
  saving,
  onCancel
}) {
  const [activeTab, setActiveTab] = useState('basic');
  const fileInputRef = useRef(null);

  async function handleAvatarChange(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !onAvatarPick) return;
    await onAvatarPick(file);
  }

  function updateDocument(key, nextValue) {
    setValue((current) => ({
      ...current,
      documents: {
        ...(current.documents || {}),
        [key]: nextValue
      }
    }));
  }

  const tabs = [
    { id: 'basic', label: 'Basic Info', icon: User },
    { id: 'membership', label: 'Membership', icon: Briefcase },
    { id: 'documents', label: 'Documents', icon: FileText },
    { id: 'financial', label: 'Financial & Nominee', icon: Wallet }
  ];

  return (
    <form
      id="member-form"
      className="flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm"
      onSubmit={(event) => event.preventDefault()}
    >
      
      {/* Top Progress Stepper */}
      <div className="border-b border-slate-200 px-8 pt-6 pb-10 bg-slate-50/50 rounded-t-2xl">
        <div className="relative flex justify-between mx-auto max-w-3xl">
          
          {/* Progress Lines */}
          <div className="absolute left-5 right-5 top-5 h-1 bg-slate-200 rounded-full">
            <div 
              className="absolute left-0 top-0 h-full bg-[var(--primary)] rounded-full transition-all duration-500 ease-out" 
              style={{ width: `${(tabs.findIndex(t => t.id === activeTab) / (tabs.length - 1)) * 100}%` }} 
            />
          </div>

          {tabs.map((tab, index) => {
            const Icon = tab.icon;
            const currentIndex = tabs.findIndex(t => t.id === activeTab);
            const isCompleted = index < currentIndex;
            const isActive = index === currentIndex;
            
            return (
              <div key={tab.id} className="relative z-10 flex justify-center w-10">
                <button
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-300 ${
                    isActive 
                      ? 'border-[var(--primary)] bg-[var(--primary)] text-white shadow-md ring-4 ring-[color-mix(in_srgb,var(--primary)_20%,transparent)]' 
                      : isCompleted
                        ? 'border-[var(--primary)] bg-white text-[var(--primary)]'
                        : 'border-slate-200 bg-white text-slate-400 hover:border-slate-300'
                  }`}
                >
                  <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                </button>
                <span className={`absolute top-12 left-1/2 -translate-x-1/2 whitespace-nowrap text-[12px] font-semibold transition-colors duration-300 ${isActive ? 'text-[var(--primary)]' : isCompleted ? 'text-slate-700' : 'text-slate-400'}`}>
                  {tab.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Content Area */}
      <div className="p-8">
        
        {/* TAB: BASIC INFO */}
        <div className={activeTab === 'basic' ? 'block space-y-8' : 'hidden'}>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Basic Information</h3>
            <p className="text-[13px] text-slate-500 mt-1">Personal and contact details for the member.</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
              <div className="relative mx-auto sm:mx-0">
                <UserAvatar
                  name={value.name || 'Member'}
                  url={avatarPreview || value.photoUrl || ''}
                  className="h-[88px] w-[88px] border-[3px] border-white text-3xl shadow-sm ring-1 ring-slate-200"
                  fallbackSize={32}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={avatarBusy || !onAvatarPick}
                  className="absolute bottom-0 right-0 inline-flex h-[34px] w-[34px] items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-60"
                  title="Choose profile image"
                >
                  <Camera size={15} />
                </button>
              </div>

              <div className="flex-1 text-center sm:text-left">
                <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                  <p className="text-[15px] font-semibold text-slate-900">Profile Picture</p>
                  {avatarPreview || value.photoUrl ? (
                    <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
                      Uploaded
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-[13px] text-slate-500">Recommended size: 256x256px (JPG, PNG)</p>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={avatarBusy || !onAvatarPick}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Upload size={14} /> Upload New
                  </button>
                  {avatarPreview || value.photoUrl ? (
                    <button
                      type="button"
                      onClick={onAvatarClear}
                      disabled={avatarBusy || !onAvatarClear}
                      className="inline-flex items-center gap-2 rounded-lg border border-rose-100 bg-rose-50 px-3 py-1.5 text-[13px] font-medium text-rose-600 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Trash2 size={14} /> Remove
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-slate-700">Member Name <span className="text-rose-500">*</span></label>
              <Input placeholder="e.g. John Doe" value={value.name || ''} onChange={(e) => setValue({ ...value, name: e.target.value })} />
            </div>

            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-slate-700">Father / Husband Name</label>
              <Input value={value.fatherOrHusbandName || ''} onChange={(e) => setValue({ ...value, fatherOrHusbandName: e.target.value })} />
            </div>

            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-slate-700">Date of Birth</label>
              <Input type="date" value={value.dateOfBirth || ''} onChange={(e) => setValue({ ...value, dateOfBirth: e.target.value })} />
            </div>

            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-slate-700">Mobile No</label>
              <PhoneInput
                country="in"
                preferredCountries={['in']}
                enableSearch
                countryCodeEditable={false}
                placeholder="9876543210"
                value={stripPhoneDigits(value.mobileNo || '')}
                onChange={(nextValue) => setValue({ ...value, mobileNo: nextValue ? `+${nextValue}` : '' })}
                containerClass="employee-phone-input"
                inputClass="!h-[42px] !w-full !rounded-[var(--radius-input,0.75rem)] !border-slate-200 focus:!border-[var(--primary)] focus:!ring-1 focus:!ring-[var(--primary)]"
                buttonClass="!border-r !border-slate-200 !rounded-l-[var(--radius-input,0.75rem)] !bg-slate-50"
                dropdownClass="!z-50"
                inputProps={{ name: 'mobileNo' }}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-slate-700">Category</label>
              <Input placeholder="e.g. General, SC, ST" value={value.category || ''} onChange={(e) => setValue({ ...value, category: e.target.value })} />
            </div>

            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-slate-700">Caste</label>
              <Input value={value.caste || ''} onChange={(e) => setValue({ ...value, caste: e.target.value })} />
            </div>

            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-slate-700">Basic Salary</label>
              <Input type="number" min="0" step="1" value={value.basicSalary || ''} onChange={(e) => setValue({ ...value, basicSalary: e.target.value })} />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <label className="text-[13px] font-semibold text-slate-700">Residential Address</label>
              <Textarea rows={3} placeholder="Full address..." value={value.address || ''} onChange={(e) => setValue({ ...value, address: e.target.value })} />
            </div>
          </div>
        </div>

        {/* TAB: MEMBERSHIP */}
        <div className={activeTab === 'membership' ? 'block space-y-8' : 'hidden'}>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Membership Details</h3>
            <p className="text-[13px] text-slate-500 mt-1">Branch assignment and membership status.</p>
          </div>


          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-slate-700">Member Code</label>
              <Input placeholder="M0009" value={value.code || ''} onChange={(e) => setValue({ ...value, code: e.target.value.toUpperCase() })} className="font-mono uppercase tracking-wider" />
            </div>

            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-slate-700">Membership No</label>
              <Input placeholder="MB-1009" value={value.membershipNo || ''} onChange={(e) => setValue({ ...value, membershipNo: e.target.value.toUpperCase() })} className="font-mono uppercase tracking-wider" />
            </div>

            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-slate-700">Branch <span className="text-rose-500">*</span></label>
              <Select
                value={value.branchCode || ''}
                disabled={branchesLoading && branches.length === 0}
                onChange={(val) => setValue({ ...value, branchCode: val })}
                searchable={true}
                placeholder={branchesLoading ? 'Loading branches...' : 'Select branch'}
                options={branches.map((branch) => ({ value: branch.code, label: formatBranchLabel(branch) }))}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-slate-700">Occupation / Designation</label>
              <Input value={value.designation || ''} onChange={(e) => setValue({ ...value, designation: e.target.value })} />
            </div>

            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-slate-700">Membership Date</label>
              <Input type="date" value={value.membershipDate || ''} onChange={(e) => setValue({ ...value, membershipDate: e.target.value })} />
            </div>

            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-slate-700">Appointment Date</label>
              <Input type="date" value={value.appointmentDate || ''} onChange={(e) => setValue({ ...value, appointmentDate: e.target.value })} />
            </div>

            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-slate-700">Surety 1</label>
              <Input value={value.serviceName1 || ''} onChange={(e) => setValue({ ...value, serviceName1: e.target.value })} />
            </div>

            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-slate-700">Surety 2</label>
              <Input value={value.serviceName2 || ''} onChange={(e) => setValue({ ...value, serviceName2: e.target.value })} />
            </div>

            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-slate-700">Account Status</label>
              <Select
                value={value.status || 'Active'}
                onChange={(val) => setValue({ ...value, status: val })}
                options={[
                  { value: 'Active', label: 'Active' },
                  { value: 'Inactive', label: 'Inactive' },
                  { value: 'Exited', label: 'Exited' }
                ]}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-slate-700">Dismembered</label>
              <label className="flex items-center gap-2 rounded-[var(--radius-input,0.75rem)] border border-slate-200 bg-white px-4 py-3 text-[13px] font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={Boolean(value.dismembered)}
                  onChange={(e) => setValue({ ...value, dismembered: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 accent-[var(--primary)]"
                />
                Mark as dismembered
              </label>
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-slate-700">Dismembered Date</label>
              <Input type="date" value={value.dismemberedDate || ''} onChange={(e) => setValue({ ...value, dismemberedDate: e.target.value })} />
            </div>
          </div>
        </div>

        {/* TAB: DOCUMENTS */}
        <div className={activeTab === 'documents' ? 'block space-y-6' : 'hidden'}>
          <DocumentSection
            title="Member Documents"
            description="Upload KYC, signature specimen, and nominee verification documents."
            definitions={MEMBER_DOCUMENT_DEFS}
            documents={value.documents || {}}
            editable
            onPickFile={(key, file) => {
              const currentDocument = value.documents?.[key];
              if (currentDocument?.fileId) {
                onDocumentRemove?.(key, currentDocument);
              }
              updateDocument(key, {
                file,
                fileName: file.name,
                originalName: file.name,
                mimeType: file.type,
                sizeBytes: file.size,
                documentType: key
              });
            }}
            onClearFile={(key, document) => {
              onDocumentRemove?.(key, document);
              updateDocument(key, null);
            }}
          />
        </div>

        {/* TAB: FINANCIAL */}
        <div className={activeTab === 'financial' ? 'block space-y-8' : 'hidden'}>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Balances & Nominee</h3>
            <p className="text-[13px] text-slate-500 mt-1">Opening balances and beneficiary details.</p>
          </div>
          
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5">
            <h4 className="text-sm font-semibold text-slate-900 mb-4">Initial Balances</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
              {BALANCE_FIELDS.map((field) => (
                <div key={field.name} className="space-y-1.5">
                  <label className="text-[13px] font-medium text-slate-700">{field.label}</label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      className="bg-white flex-1"
                      value={getNestedValue(value, field.name) ?? ''}
                      onChange={(e) => setNestedValue(setValue, value, field.name, e.target.value)}
                    />
                    {field.sideName && (
                      <div className="w-[90px]">
                        <Select
                          value={getNestedValue(value, field.sideName) || 'Cr'}
                          onChange={(val) => setNestedValue(setValue, value, field.sideName, val)}
                          options={[
                            { value: 'Dr', label: 'Dr' },
                            { value: 'Cr', label: 'Cr' }
                          ]}
                          className="bg-white"
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-slate-700">Nominee Name</label>
              <Input value={value.nomineeName || ''} onChange={(e) => setValue({ ...value, nomineeName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-slate-700">Nominee Relation</label>
              <Select
                value={value.nomineeRelation || ""}
                onChange={(val) => setValue({ ...value, nomineeRelation: val })}
                options={[
                  { value: "Spouse", label: "Spouse" },
                  { value: "Parent", label: "Parent" },
                  { value: "Child", label: "Child" },
                  { value: "Other", label: "Other" }
                ]}
              />
            </div>
        </div>

      </div>

      {/* Integrated Form Footer */}
      <div className="border-t border-slate-200 bg-slate-50/50 px-8 py-5 flex items-center justify-between rounded-b-2xl">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-[var(--radius-button,1rem)] border border-slate-300 bg-white px-5 py-2.5 text-[14px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
        <div className="flex items-center gap-4">
          {tabs.findIndex(t => t.id === activeTab) > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab(tabs[tabs.findIndex(t => t.id === activeTab) - 1].id)}
              className="rounded-[var(--radius-button,1rem)] border border-slate-300 bg-white px-5 py-2.5 text-[14px] font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Previous
            </button>
          )}
          {tabs.findIndex(t => t.id === activeTab) < tabs.length - 1 ? (
            <button
              type="button"
              onClick={() => setActiveTab(tabs[tabs.findIndex(t => t.id === activeTab) + 1].id)}
              className="rounded-[var(--radius-button,1rem)] bg-[var(--primary)] px-8 py-2.5 text-[14px] font-semibold text-white shadow-sm transition hover:opacity-90 hover:shadow"
            >
              Next Step
            </button>
          ) : (
            <button
              type="button"
              onClick={onSubmit}
              disabled={saving}
              className="rounded-[var(--radius-button,1rem)] bg-[var(--primary)] px-8 py-2.5 text-[14px] font-semibold text-white shadow-sm transition hover:opacity-90 hover:shadow disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Saving...' : (isEdit ? 'Update Member' : 'Create Member')}
            </button>
          )}
        </div>
      </div>
      </div>
    </form>
  );
}

export default MemberForm;



