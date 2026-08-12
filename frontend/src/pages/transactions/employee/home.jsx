import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Plus } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { EMPLOYEE_TRANSACTION_TYPES } from './employeeConfig';

export function EmployeeTransactionsHomePage() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const items = useMemo(() => EMPLOYEE_TRANSACTION_TYPES, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-500">Employee Transactions</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Choose an employee transaction workspace</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Har employee transaction type ka alag table, alag form, aur alag detail page hai.
          </p>
        </div>

        <div className="relative">
          <Button
            type="button"
            className="gap-2 rounded-full bg-[var(--primary,#1661F6)] px-4 text-white hover:opacity-90"
            onClick={() => setOpen((current) => !current)}
          >
            <Plus size={16} />
            Open Employee Transaction
            <ChevronDown size={14} className="ml-1 opacity-80" />
          </Button>

          {open ? (
            <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl ring-1 ring-slate-900/5">
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      navigate(item.route);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                      <Icon size={16} strokeWidth={2} />
                    </div>
                    <span className="line-clamp-1">{item.label}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.key} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-700">
                    <Icon size={20} strokeWidth={1.9} />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">{item.tone}</p>
                    <h2 className="mt-1 text-lg font-semibold text-slate-900">{item.label}</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-500">{item.description}</p>
                  </div>
                </div>
              </div>
              <div className="mt-5">
                <Button type="button" variant="outline" className="gap-2 rounded-full" onClick={() => navigate(item.route)}>
                  Open workspace
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export default EmployeeTransactionsHomePage;

