import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Banknote, ChevronRight, FileText, Users } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { useAuth } from '../../../context/AuthContext';
import { TRANSACTION_SECTION_MAP } from '../transactionLinks';

const ITEM_META = {
  'receipt-voucher': {
    tone: 'emerald',
    icon: FileText,
    badge: 'RCPT',
    description: 'Receipt entry'
  },
  'interest-paid-member': {
    tone: 'rose',
    icon: Banknote,
    badge: 'INT',
    description: 'Interest entry'
  },
  'no-interest-members': {
    tone: 'amber',
    icon: Users,
    badge: 'LIST',
    description: 'Member exclusion'
  }
};

function toneClassName(tone = 'slate') {
  if (tone === 'emerald') return 'border-emerald-100 bg-emerald-50 text-emerald-700';
  if (tone === 'rose') return 'border-rose-100 bg-rose-50 text-rose-700';
  if (tone === 'amber') return 'border-amber-100 bg-amber-50 text-amber-700';
  return 'border-slate-100 bg-slate-50 text-slate-700';
}

function ReceiptLinkRow({ item, onOpen }) {
  const meta = ITEM_META[item.key] || ITEM_META.receipt-voucher;
  const Icon = meta.icon;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left transition hover:border-slate-300 hover:bg-slate-50"
    >
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${toneClassName(meta.tone)}`}>
        <Icon size={18} strokeWidth={1.9} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">{meta.badge}</p>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            {meta.description}
          </span>
        </div>
        <p className="mt-1 text-base font-semibold text-slate-900">{item.label}</p>
      </div>

      <ChevronRight size={16} className="shrink-0 text-slate-400" />
    </button>
  );
}

export function ReceiptInterestHomePage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const section = TRANSACTION_SECTION_MAP['receipt-interest'];
  const items = useMemo(() => section?.items || [], [section]);
  const visibleItems = useMemo(() => {
    return items.filter((item) => item.key !== 'no-interest-members' || hasPermission('no-interest-members.read'));
  }, [items, hasPermission]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-500">Receipt / Interest</p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Choose a receipt or interest workspace</h1>
        <p className="max-w-3xl text-sm leading-6 text-slate-500">
          Har item ka apna alag table, form, aur detail page hai. Niche wale links ko same pattern me rakha gaya hai taaki har workspace separate open ho.
        </p>
      </div>

      <Card className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 border-b border-slate-100 pb-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Receipt / Interest</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">Workspace links</h2>
        </div>

        <div className="space-y-3">
          {visibleItems.map((item) => (
            <ReceiptLinkRow
              key={item.key}
              item={item}
              onOpen={() => navigate(item.route || '/app/transactions/receipt-interest')}
            />
          ))}
        </div>
      </Card>
    </div>
  );
}

export default ReceiptInterestHomePage;
