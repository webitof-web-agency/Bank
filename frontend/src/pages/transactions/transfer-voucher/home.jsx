import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Repeat2 } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { TRANSACTION_SECTION_MAP } from '../transactionLinks';
import { toneClassName } from './transactionUtils';

function WorkspaceCard({ item, onOpen }) {
  const Icon = item.icon || Repeat2;

  return (
    <Card className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${toneClassName(item.tone || 'violet')}`}>
            <Icon size={18} strokeWidth={1.9} />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-500">Transfer Voucher</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">{item.label}</h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">{item.description}</p>
          </div>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${toneClassName(item.tone || 'violet')}`}>
          {item.key === 'transfer-voucher-paid' ? 'DR' : item.key === 'transfer-voucher-recover' ? 'CR' : 'PAY'}
        </span>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <Button type="button" variant="outline" onClick={onOpen} className="gap-2 rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50">
          Open workspace
          <ChevronRight size={16} />
        </Button>
      </div>
    </Card>
  );
}

export function TransferVoucherTransactionsHomePage() {
  const navigate = useNavigate();
  const section = TRANSACTION_SECTION_MAP['transfer-voucher'];
  const items = useMemo(() => section?.children || [], [section]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-500">Member Transactions</p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Choose a transfer voucher workspace</h1>
        <p className="max-w-3xl text-sm leading-6 text-slate-500">
          Transfer voucher ke har type ka apna alag table, form, aur detail page hoga. Paid, recover, aur payment entries ko separate routes me open karein.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {items.map((item) => (
          <WorkspaceCard key={item.key} item={item} onOpen={() => navigate(item.path)} />
        ))}
      </div>
    </div>
  );
}

export default TransferVoucherTransactionsHomePage;

