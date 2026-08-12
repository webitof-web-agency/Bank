import { useEffect, useMemo, useState } from 'react';
import { CircleDollarSign, Percent, RotateCcw, Save, ShieldCheck, SlidersHorizontal, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../api/api';
import { useAuth } from '../../../context/AuthContext';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';

const DEFAULT_RATES_CONFIG = {
  interestRates: {
    paid: {
      compulsoryDeposit: 7,
      specialSaving: 8,
      cashCredit: 0,
      dividend: 5
    },
    receive: {
      loan: 9,
      loanAgainstDeposit: 9,
      houseLoanStaff: 9,
      vehicleLoanStaff: 7
    }
  },
  limits: {
    loan: {
      maxAmount: 1000000,
      multipliers: {
        coOpBankBasic: 8,
        ldBankBasic: 10,
        jilaSanghBasic: 10
      }
    },
    loanAgainstDeposit: {
      compulsoryDepositPercent: 200
    }
  },
  demandListAmount: {
    compulsoryDeposit: 10,
    coOpBankBasic: 10,
    ldBankBasic: 10,
    jilaSanghBasic: 10
  },
  syncOptions: {
    applyChangesInAllMembers: false,
    applyChangesInCompulsoryDeposit: true
  }
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergeDeep(target = {}, source = {}) {
  const base = Array.isArray(target) ? [...target] : { ...target };
  Object.entries(source || {}).forEach(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      base[key] = mergeDeep(target?.[key] || {}, value);
    } else {
      base[key] = value;
    }
  });
  return base;
}

function normalizeRatesConfig(config = {}) {
  return mergeDeep(clone(DEFAULT_RATES_CONFIG), config || {});
}

function setNestedValue(source, path, value) {
  const next = clone(source);
  let cursor = next;
  for (let index = 0; index < path.length - 1; index += 1) {
    cursor = cursor[path[index]];
  }
  cursor[path[path.length - 1]] = value;
  return next;
}

function formatMoney(value) {
  const amount = Number(value || 0);
  return amount.toLocaleString('en-IN');
}

function ConfigField({ label, value, onChange, suffix = '%', prefix = '', disabled = false, step = '0.01', placeholder = '' }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2.5">
      <label className="text-sm font-medium text-slate-800">{label}</label>
      <div className="flex items-center gap-2">
        {prefix ? <span className="text-sm font-semibold text-slate-500">{prefix}</span> : null}
        <Input
          type="number"
          step={step}
          value={value ?? ''}
          onChange={onChange}
          disabled={disabled}
          placeholder={placeholder}
          className="w-32 bg-white text-right font-medium text-slate-900 shadow-sm"
        />
        {suffix ? <span className="min-w-4 text-sm font-semibold text-slate-500">{suffix}</span> : null}
      </div>
    </div>
  );
}

function SectionHeader({ children }) {
  return (
    <div className="rounded-lg bg-slate-100/80 px-4 py-2.5 text-[12px] font-bold uppercase tracking-[0.1em] text-slate-600 ring-1 ring-inset ring-slate-200">
      {children}
    </div>
  );
}

export function RatesPage() {
  const { token, hasPermission } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(() => clone(DEFAULT_RATES_CONFIG));
  const [initial, setInitial] = useState(() => clone(DEFAULT_RATES_CONFIG));
  const [activeTab, setActiveTab] = useState('interest');

  const canManage = hasPermission('rates.write');

  useEffect(() => {
    let mounted = true;

    async function loadRates() {
      setLoading(true);
      try {
        const response = await api.banking.getMaster('/masters/rates', token);
        const next = normalizeRatesConfig(response?.data || response || {});
        if (!mounted) return;
        setDraft(next);
        setInitial(clone(next));
      } catch (error) {
        if (mounted) {
          toast.error(error.message || 'Unable to load rates configuration');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadRates();

    return () => {
      mounted = false;
    };
  }, [token]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(initial), [draft, initial]);

  function updateField(path, value) {
    setDraft((current) => setNestedValue(current, path, value));
  }

  async function saveConfig(nextConfig = draft) {
    if (!canManage) return;
    setSaving(true);
    try {
      const response = await api.banking.updateMaster('/masters/rates', token, nextConfig);
      const next = normalizeRatesConfig(response?.data || response || nextConfig);
      setDraft(next);
      setInitial(clone(next));
      toast.success('Rates configuration saved');
    } catch (error) {
      toast.error(error.message || 'Unable to save rates configuration');
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setDraft(clone(initial));
  }

  async function handleApplyAllMembers() {
    if (!canManage || saving) return;
    const next = clone(draft);
    next.syncOptions.applyChangesInAllMembers = true;
    await saveConfig(next);
  }

  const paidInterestFields = [
    { label: 'Compulsory Deposit', path: ['interestRates', 'paid', 'compulsoryDeposit'] },
    { label: 'Special Saving A/c', path: ['interestRates', 'paid', 'specialSaving'] },
    { label: 'Cash Credit A/c', path: ['interestRates', 'paid', 'cashCredit'] },
    { label: 'Dividend', path: ['interestRates', 'paid', 'dividend'] }
  ];

  const receiveInterestFields = [
    { label: 'Loan', path: ['interestRates', 'receive', 'loan'] },
    { label: 'Loan Against Deposit', path: ['interestRates', 'receive', 'loanAgainstDeposit'] },
    { label: 'House Loan (Staff)', path: ['interestRates', 'receive', 'houseLoanStaff'] },
    { label: 'Vehicle Loan (Staff)', path: ['interestRates', 'receive', 'vehicleLoanStaff'] }
  ];

  const limitMultiplierFields = [
    { label: 'Co-op. Bank Basic', path: ['limits', 'loan', 'multipliers', 'coOpBankBasic'] },
    { label: 'L.D. Bank Basic', path: ['limits', 'loan', 'multipliers', 'ldBankBasic'] },
    { label: 'Jila Sangh Basic', path: ['limits', 'loan', 'multipliers', 'jilaSanghBasic'] }
  ];

  const demandAmountFields = [
    { label: 'Compulsory Deposit', path: ['demandListAmount', 'compulsoryDeposit'] },
    { label: 'Co-op. Bank Basic', path: ['demandListAmount', 'coOpBankBasic'] },
    { label: 'L.D. Bank Basic', path: ['demandListAmount', 'ldBankBasic'] },
    { label: 'Jila Sangh Basic', path: ['demandListAmount', 'jilaSanghBasic'] }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Rates Dashboard</h1>
      </div>

      {loading ? (
        <Card className="rounded-[1.75rem] border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          Loading rates configuration...
        </Card>
      ) : (
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          {/* Sidebar */}
          <div className="flex w-full shrink-0 flex-row gap-2 overflow-x-auto lg:w-64 lg:flex-col lg:overflow-visible">
            <button
              type="button"
              onClick={() => setActiveTab('interest')}
              className={`group flex shrink-0 items-center gap-3 rounded-[var(--radius-button,1rem)] px-4 py-3 text-[15px] font-medium transition-colors ${
                activeTab === 'interest'
                  ? 'bg-[var(--brand-sidebar-active,#e0e7ff)] text-[var(--primary,#2563eb)]'
                  : 'text-slate-700 hover:bg-[color-mix(in_srgb,var(--primary)_8%,transparent)] hover:text-[var(--primary,#2563eb)]'
              }`}
            >
              <Percent size={20} className={activeTab === 'interest' ? 'text-[var(--primary,#2563eb)]' : 'text-slate-700 group-hover:text-[var(--primary,#2563eb)]'} />
              Interest Rate's
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('limits')}
              className={`group flex shrink-0 items-center gap-3 rounded-[var(--radius-button,1rem)] px-4 py-3 text-[15px] font-medium transition-colors ${
                activeTab === 'limits'
                  ? 'bg-[var(--brand-sidebar-active,#e0e7ff)] text-[var(--primary,#2563eb)]'
                  : 'text-slate-700 hover:bg-[color-mix(in_srgb,var(--primary)_8%,transparent)] hover:text-[var(--primary,#2563eb)]'
              }`}
            >
              <ShieldCheck size={20} className={activeTab === 'limits' ? 'text-[var(--primary,#2563eb)]' : 'text-slate-700 group-hover:text-[var(--primary,#2563eb)]'} />
              Limits
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('demand')}
              className={`group flex shrink-0 items-center gap-3 rounded-[var(--radius-button,1rem)] px-4 py-3 text-[15px] font-medium transition-colors ${
                activeTab === 'demand'
                  ? 'bg-[var(--brand-sidebar-active,#e0e7ff)] text-[var(--primary,#2563eb)]'
                  : 'text-slate-700 hover:bg-[color-mix(in_srgb,var(--primary)_8%,transparent)] hover:text-[var(--primary,#2563eb)]'
              }`}
            >
              <Sparkles size={20} className={activeTab === 'demand' ? 'text-[var(--primary,#2563eb)]' : 'text-slate-700 group-hover:text-[var(--primary,#2563eb)]'} />
              Demand List Amount
            </button>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 overflow-hidden">
            {activeTab === 'interest' && (
              <Card className="animate-in fade-in slide-in-from-bottom-2 duration-300 rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                <div className="mb-6 flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight text-slate-900">Interest Rate's</h2>
                    <p className="mt-1 text-sm text-slate-500">Configure the paid and receive rate heads used across the system.</p>
                  </div>
                  <div className="rounded-full bg-rose-50 p-3 text-rose-600 hidden sm:block">
                    <Percent size={18} />
                  </div>
                </div>

                <div className="space-y-6">
                  <SectionHeader>Paid</SectionHeader>
                  <div className="grid gap-x-12 gap-y-1 sm:grid-cols-2">
                    {paidInterestFields.map((field) => (
                      <ConfigField
                        key={field.label}
                        label={field.label}
                        value={field.path.reduce((acc, key) => acc?.[key], draft)}
                        onChange={(event) => updateField(field.path, event.target.value)}
                        disabled={!canManage || saving}
                      />
                    ))}
                  </div>

                  <SectionHeader>Receive</SectionHeader>
                  <div className="grid gap-x-12 gap-y-1 sm:grid-cols-2">
                    {receiveInterestFields.map((field) => (
                      <ConfigField
                        key={field.label}
                        label={field.label}
                        value={field.path.reduce((acc, key) => acc?.[key], draft)}
                        onChange={(event) => updateField(field.path, event.target.value)}
                        disabled={!canManage || saving}
                      />
                    ))}
                  </div>
                </div>
              </Card>
            )}

            {activeTab === 'limits' && (
              <Card className="animate-in fade-in slide-in-from-bottom-2 duration-300 rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                <div className="mb-6 flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight text-slate-900">Limits</h2>
                    <p className="mt-1 text-sm text-slate-500">Loan ceiling and multiplier rules that shape member eligibility.</p>
                  </div>
                  <div className="rounded-full bg-amber-50 p-3 text-amber-600 hidden sm:block">
                    <ShieldCheck size={18} />
                  </div>
                </div>

                <div className="space-y-6">
                  <SectionHeader>Loan</SectionHeader>
                  <div className="space-y-3">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2.5 max-w-lg">
                      <label className="text-sm font-medium text-slate-800">Maximum Amount Rs.</label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          step="1"
                          value={draft.limits.loan.maxAmount ?? ''}
                          onChange={(event) => updateField(['limits', 'loan', 'maxAmount'], event.target.value)}
                          disabled={!canManage || saving}
                          className="w-40 bg-white text-right font-medium text-slate-900 shadow-sm"
                        />
                      </div>
                    </div>

                    <div className="py-1 text-center text-sm font-semibold text-slate-500 max-w-lg relative">
                       <div className="absolute inset-0 flex items-center" aria-hidden="true">
                         <div className="w-full border-t border-slate-200"></div>
                       </div>
                       <span className="relative bg-white px-2 text-sm text-slate-500">OR</span>
                    </div>

                    <div className="space-y-1">
                      {limitMultiplierFields.map((field) => (
                        <div key={field.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2.5 max-w-lg">
                          <label className="text-sm font-medium text-slate-800">{field.label}</label>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-500">x</span>
                            <Input
                              type="number"
                              step="0.01"
                              value={field.path.reduce((acc, key) => acc?.[key], draft)}
                              onChange={(event) => updateField(field.path, event.target.value)}
                              disabled={!canManage || saving}
                              className="w-28 bg-white text-right font-medium text-slate-900 shadow-sm"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-4">
                    <SectionHeader>Loan Against Deposit</SectionHeader>
                    <div className="max-w-lg">
                      <ConfigField
                        label="Compulsory Deposit"
                        value={draft.limits.loanAgainstDeposit.compulsoryDepositPercent}
                        onChange={(event) => updateField(['limits', 'loanAgainstDeposit', 'compulsoryDepositPercent'], event.target.value)}
                        disabled={!canManage || saving}
                      />
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {activeTab === 'demand' && (
              <Card className="animate-in fade-in slide-in-from-bottom-2 duration-300 rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                <div className="mb-6 flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight text-slate-900">Demand List Amount</h2>
                    <p className="mt-1 text-sm text-slate-500">Default demand percentages carried into member demand generation.</p>
                  </div>
                  <div className="rounded-full bg-indigo-50 p-3 text-indigo-600 hidden sm:block">
                    <Sparkles size={18} />
                  </div>
                </div>

                <div className="grid gap-x-12 gap-y-1 sm:grid-cols-2">
                  <div className="space-y-6 sm:col-span-2">
                    <SectionHeader>Compulsory Deposit</SectionHeader>
                  </div>
                  {demandAmountFields.map((field) => (
                    <ConfigField
                      key={field.label}
                      label={field.label}
                      value={field.path.reduce((acc, key) => acc?.[key], draft)}
                      onChange={(event) => updateField(field.path, event.target.value)}
                      disabled={!canManage || saving}
                    />
                  ))}
                </div>

                <div className="mt-8 max-w-lg">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                    disabled={!canManage || saving}
                    onClick={handleApplyAllMembers}
                  >
                    Apply Changes In All Members
                  </Button>
                </div>

                <div className="mt-5 max-w-lg rounded-2xl border border-slate-200 bg-slate-50/50 p-5">
                  <p className="text-[13px] font-semibold text-slate-800">When Members Basic Change</p>
                  <label className="mt-3 flex items-start gap-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-[var(--accent)] focus:ring-[var(--accent)]"
                      checked={Boolean(draft.syncOptions.applyChangesInCompulsoryDeposit)}
                      onChange={(event) => updateField(['syncOptions', 'applyChangesInCompulsoryDeposit'], event.target.checked)}
                      disabled={!canManage || saving}
                    />
                    <span>Apply Changes In Compulsory Deposit</span>
                  </label>
                </div>
              </Card>
            )}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="outline" type="button" onClick={handleReset} disabled={!dirty || saving || !canManage} className="gap-2">
          <RotateCcw size={16} />
          Reset
        </Button>
        <Button type="button" onClick={() => saveConfig()} disabled={!dirty || saving || !canManage} className="gap-2 px-6">
          <Save size={16} />
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

export default RatesPage;
