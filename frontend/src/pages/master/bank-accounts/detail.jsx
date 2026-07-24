import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Edit2, Building2, Landmark, Wallet, CreditCard, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../../api/api';
import { useAuth } from '../../../context/AuthContext';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { BankAccountForm } from './form';
import { buildBankAccountPayload, createBankAccountDraftFromRecord, formatMoney, getLedgerLabel } from './bankAccountUtils';

function DetailRow({ label, value }) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-4 border-b border-slate-100 py-4 last:border-b-0">
      <div className="text-[13px] font-medium text-slate-500">{label}</div>
      <div className="text-[14px] font-medium text-slate-900">{value || '—'}</div>
    </div>
  );
}

export function BankAccountDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token, hasPermission } = useAuth();
  const [account, setAccount] = useState(null);
  const [ledgers, setLedgers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const [activeTab, setActiveTab] = useState('account');

  const canManage = hasPermission('bank-accounts.write');

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    Promise.all([
      api.resources.get('/banking/masters/bank-accounts', id, token),
      api.resources.list('/banking/masters/ledgers', token)
    ])
      .then(([accountRes, ledgersRes]) => {
        if (!mounted) return;
        setAccount(accountRes.data || null);
        setLedgers(ledgersRes.data || []);
      })
      .catch((error) => {
        if (!mounted) return;
        toast.error(error.message || 'Unable to load bank account');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [id, token]);

  function openEditor() {
    if (!account) return;
    setDraft(createBankAccountDraftFromRecord(account));
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setDraft(null);
  }

  async function saveAccount(event) {
    event.preventDefault();
    if (!account || !draft) return;

    setSaving(true);
    try {
      const payload = buildBankAccountPayload(draft);
      const response = await api.resources.update('/banking/masters/bank-accounts', account.id, payload, token);
      setAccount(response.data || account);
      toast.success('Bank account updated');
      closeEditor();
    } catch (error) {
      toast.error(error.message || 'Unable to save bank account');
    } finally {
      setSaving(false);
    }
  }

  const statusBadge = useMemo(() => {
    const active = String(account?.status || 'Active').toLowerCase() !== 'inactive';
    return active
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : 'border-rose-200 bg-rose-50 text-rose-700';
  }, [account?.status]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
      </div>
    );
  }

  if (!account) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
        Bank account not found
      </div>
    );
  }

  const accountName = account.bankName || 'Bank Account';
  const accountCode = account.code || '—';
  const linkedLedger = ledgers.find((ledger) => String(ledger.code || '').toUpperCase() === String(account.linkedLedgerCode || '').toUpperCase());

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-[13px] font-medium text-slate-500">
        <button type="button" onClick={() => navigate(-1)} className="flex items-center gap-1.5 transition-colors hover:text-slate-900">
          <ArrowLeft size={14} /> Back
        </button>
        <span className="text-slate-300">/</span>
        <span className="text-slate-900">Bank Account Detail</span>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-6 px-8 py-8 md:flex-row md:items-start md:justify-between border-b border-slate-100">
          <div className="flex items-center gap-5">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[18px] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary,#1661F6)] shadow-sm">
              <Building2 size={36} strokeWidth={1.5} />
            </div>
            <div>
              <p className="mb-1 text-[13px] font-bold text-[var(--primary,#1661F6)] tracking-wide">{accountCode}</p>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{accountName}</h1>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-semibold ${statusBadge}`}>
                  <CheckCircle2 size={14} />
                  {String(account.status || 'Active')}
                </span>
                {account.isPrimary ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[12px] font-semibold text-slate-600">
                    <CreditCard size={14} />
                    Primary Account
                  </span>
                ) : null}
                {account.linkedLedgerCode ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[12px] font-semibold text-slate-600">
                    <Landmark size={14} />
                    {account.linkedLedgerCode}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-col md:items-end gap-4">
            {canManage && (
              <Button variant="outline" type="button" onClick={openEditor} className="gap-2 border-slate-200 shadow-sm rounded-[var(--radius-input,0.75rem)] hover:bg-slate-50 text-slate-700 font-semibold">
                <Edit2 size={16} />
                Edit Bank Account
              </Button>
            )}
            
            <div className="flex items-center gap-5 mt-1 bg-slate-50/80 border border-slate-100 rounded-[14px] px-5 py-3 shadow-sm">
              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Current Balance</p>
                <p className="text-base font-bold text-slate-900 leading-tight mt-0.5">{formatMoney(account.currentBalance ?? 0)}</p>
              </div>
              <div className="w-px h-8 bg-slate-200"></div>
              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Opening Balance</p>
                <p className="text-base font-bold text-slate-900 leading-tight mt-0.5">{formatMoney(account.openingBalance ?? 0)}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex border-b border-slate-100 bg-slate-50/50 px-6">
          {[
            { id: 'account', label: 'Account Info', icon: Wallet },
            { id: 'balance', label: 'Balance & Link', icon: Landmark }
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 border-b-2 px-6 py-4 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'border-[var(--primary,#1661F6)] text-[var(--primary,#1661F6)]'
                    : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="p-8 bg-slate-50/30">
          {activeTab === 'account' && (
            <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm py-2">
              <div className="divide-y divide-slate-100 px-6">
                <DetailRow label="Account Code" value={accountCode} />
                <DetailRow label="Bank Name" value={account.bankName} />
                <DetailRow label="Account Holder" value={account.accountHolderName} />
                <DetailRow label="Account Number" value={account.accountNumber} />
                <DetailRow label="IFSC" value={account.ifsc} />
                <DetailRow label="Branch" value={account.branch} />
                <DetailRow label="Account Type" value={account.accountType} />
              </div>
            </Card>
          )}

          {activeTab === 'balance' && (
            <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm py-2">
              <div className="divide-y divide-slate-100 px-6">
                <DetailRow label="Opening Balance" value={formatMoney(account.openingBalance ?? 0)} />
                <DetailRow label="Current Balance" value={formatMoney(account.currentBalance ?? 0)} />
                <DetailRow label="Linked Ledger" value={getLedgerLabel(linkedLedger) || account.linkedLedgerCode} />
                <DetailRow label="UPI ID" value={account.upiId} />
                <DetailRow label="Primary Account" value={account.isPrimary ? 'Yes' : 'No'} />
                <DetailRow label="Status" value={account.status} />
              </div>
            </Card>
          )}
        </div>
      </div>

      <Modal
        open={editorOpen}
        title="Edit Bank Account"
        onClose={closeEditor}
        width="min(1080px, 96vw)"
        footer={
          <div className="flex justify-end gap-3 w-full">
            <Button variant="outline" type="button" onClick={closeEditor}>Cancel</Button>
            <Button type="submit" form="bank-account-form" disabled={saving} className="bg-[var(--primary,#1661F6)] hover:bg-[color-mix(in_srgb,var(--primary)_90%,black)] text-white shadow-sm rounded-[var(--radius-input,0.75rem)] px-6 border-none">
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        }
      >
        {draft ? (
          <BankAccountForm
            value={draft}
            setValue={setDraft}
            onSubmit={saveAccount}
            ledgers={ledgers}
          />
        ) : null}
      </Modal>
    </div>
  );
}

export default BankAccountDetailPage;

