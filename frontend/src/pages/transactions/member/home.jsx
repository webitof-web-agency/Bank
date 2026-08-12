import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ExternalLink, FileText, LayoutGrid, Plus } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { toneClassName } from './transactionUtils';
import { MEMBER_TRANSACTION_TYPES } from './memberConfig';

export function MemberTransactionsHomePage({ detailPathBase = '/app/transactions/member' }) {
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const sections = useMemo(() => MEMBER_TRANSACTION_TYPES.map((item) => ({
    ...item,
    route: `${detailPathBase}/${item.slug}`
  })), [detailPathBase]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.22em] text-[var(--primary)]">Member Transactions</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Choose a member transaction workspace</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Har transaction type ka apna table aur apna form hai. Yahan se aap directly Loan, Deposit, Insurance, ya Recovery workspace open kar sakte hain.
          </p>
        </div>

        <div className="relative">
          <Button
            type="button"
            className="gap-2 bg-[var(--primary,#1661F6)] text-white hover:opacity-90"
            onClick={() => setDropdownOpen((current) => !current)}
            onBlur={() => setTimeout(() => setDropdownOpen(false), 200)}
          >
            <Plus size={16} />
            Open Member Transaction
            <ChevronDown size={14} className="ml-1 opacity-70" />
          </Button>
          {dropdownOpen ? (
            <div className="absolute right-0 top-full z-50 mt-2 w-[340px] origin-top-right rounded-2xl border border-slate-200 bg-white p-2 shadow-xl ring-1 ring-slate-900/5">
              {sections.map((item) => {
                const Icon = item.icon || FileText;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => navigate(item.route)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-[color-mix(in_srgb,var(--primary)_8%,transparent)] hover:text-[var(--primary)]"
                  >
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${toneClassName(item.tone)}`}>
                      <Icon size={15} strokeWidth={2.2} />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate">{item.label}</div>
                      <div className="truncate text-[11px] font-normal text-slate-400">Open dedicated workspace</div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {sections.map((item) => {
          const Icon = item.icon || LayoutGrid;
          return (
            <Card key={item.key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-start justify-between gap-4">
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${toneClassName(item.tone)}`}>
                  <Icon size={22} strokeWidth={1.9} />
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${toneClassName(item.tone)}`}>
                  {item.slug}
                </span>
              </div>

              <h3 className="mt-4 text-lg font-semibold text-slate-900">{item.label}</h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">{item.description}</p>

              <div className="mt-5 flex items-center justify-between gap-3">
                <Button type="button" variant="outline" className="gap-2" onClick={() => navigate(item.route)}>
                  Open workspace
                  <ExternalLink size={14} />
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export default MemberTransactionsHomePage;
