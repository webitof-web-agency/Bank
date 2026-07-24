import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { useAuth } from '../../context/AuthContext';
import { REPORT_GROUPED_LINKS } from './reportLinks';

function toneClassName(index) {
  const tones = [
    'border-blue-100 bg-blue-50 text-blue-600',
    'border-emerald-100 bg-emerald-50 text-emerald-600',
    'border-amber-100 bg-amber-50 text-amber-600',
    'border-rose-100 bg-rose-50 text-rose-600',
    'border-violet-100 bg-violet-50 text-violet-600',
    'border-sky-100 bg-sky-50 text-sky-600'
  ];
  return tones[index % tones.length];
}

export function ReportsHomePage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const visibleGroups = useMemo(
    () => REPORT_GROUPED_LINKS
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => hasPermission(item.permission))
      }))
      .filter((group) => group.items.length > 0),
    [hasPermission]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Reports</h1>
      </div>

      <div className="space-y-5">
        {visibleGroups.map((group, groupIndex) => (
          <Card key={group.key} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 md:flex-row md:items-end md:justify-between">
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-500">Category {groupIndex + 1}</p>
                <h2 className="text-xl font-semibold text-slate-900">{group.label}</h2>
                <p className="text-sm text-slate-500">{group.description}</p>
              </div>
              <span className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                {group.items.length} reports
              </span>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {group.items.map((item, index) => {
                const Icon = item.icon;
                return (
                  <Card key={item.key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${toneClassName(index + groupIndex)}`}>
                        <Icon size={22} strokeWidth={1.8} />
                      </div>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Report
                      </span>
                    </div>

                    <h3 className="mt-4 text-lg font-semibold text-slate-900">{item.label}</h3>
                    <p className="mt-1 text-sm text-slate-500">{item.description}</p>

                    <div className="mt-5">
                      <Button type="button" variant="outline" className="gap-2" onClick={() => navigate(item.path)}>
                        Open report
                        <ArrowRight size={14} />
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default ReportsHomePage;
