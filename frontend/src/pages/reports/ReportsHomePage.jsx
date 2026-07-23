import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../api/api';
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
  const { token, hasPermission } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const visibleGroups = useMemo(
    () => REPORT_GROUPED_LINKS
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => hasPermission(item.permission))
      }))
      .filter((group) => group.items.length > 0),
    [hasPermission]
  );

  useEffect(() => {
    let mounted = true;
    if (!hasPermission('dashboard.read')) {
      setDashboard(null);
      setLoading(false);
      return () => {
        mounted = false;
      };
    }

    setLoading(true);
    api.banking.dashboard(token)
      .then((response) => {
        if (!mounted) return;
        setDashboard(response.data || null);
      })
      .catch((error) => {
        if (!mounted) return;
        toast.error(error.message || 'Unable to load report dashboard');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [token, hasPermission]);

  const stats = useMemo(() => {
    const counts = dashboard?.counts || {};
    const reportCount = visibleGroups.reduce((sum, group) => sum + group.items.length, 0);
    return [
      { label: 'Branches', value: counts.branches || 0 },
      { label: 'Members', value: counts.members || 0 },
      { label: 'Employees', value: counts.employees || 0 },
      { label: 'Reports', value: reportCount }
    ];
  }, [dashboard, visibleGroups]);

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="relative bg-gradient-to-r from-[#0f172a] via-[#2563eb] to-[#1661F6] px-6 py-8 text-white md:px-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.16),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.08),transparent_30%)]" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[12px] font-medium text-white/90 backdrop-blur">
                <Sparkles size={13} />
                Reports Module
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Reports</h1>
                <p className="mt-2 max-w-2xl text-sm text-blue-50 md:text-[15px]">
                  Account statement, member ledger, trial balance, cash book, day book, voucher summary, and monthly reports.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:min-w-[320px] lg:grid-cols-4">
              {loading ? (
                <div className="col-span-full rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-blue-50">Loading dashboard...</div>
              ) : stats.map((item) => (
                <div key={item.label} className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-blue-100">{item.label}</p>
                  <p className="mt-1 text-xl font-semibold">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="gap-2" onClick={() => navigate('/app/transactions/overview')}>
          Back to Transactions
          <ArrowRight size={14} />
        </Button>
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
