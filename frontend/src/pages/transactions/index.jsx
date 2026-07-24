import { useEffect, useState } from 'react';
import { ArrowRight, ArrowLeftRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../../api/api';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { TRANSACTION_SECTIONS } from './transactionLinks';

function toneClassName(tone = 'slate') {
  if (tone === 'pink') return 'border-rose-100 bg-rose-50 text-rose-600';
  if (tone === 'green' || tone === 'emerald') return 'border-emerald-100 bg-emerald-50 text-emerald-600';
  if (tone === 'amber') return 'border-amber-100 bg-amber-50 text-amber-600';
  if (tone === 'violet') return 'border-violet-100 bg-violet-50 text-violet-600';
  if (tone === 'sky') return 'border-sky-100 bg-sky-50 text-sky-600';
  if (tone === 'blue') return 'border-blue-100 bg-blue-50 text-blue-600';
  return 'border-slate-100 bg-slate-50 text-slate-600';
}

export function TransactionsHomePage() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const visibleSections = TRANSACTION_SECTIONS.filter((section) => section.key !== 'overview');

  useEffect(() => {
    let mounted = true;
    api.banking.getTransactionCatalog(token)
      .then((response) => {
        if (!mounted) return;
        setCatalog(Array.isArray(response.data) ? response.data : []);
      })
      .catch((error) => {
        if (!mounted) return;
        toast.error(error.message || 'Unable to load transaction catalog');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [token]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">Transactions</h1>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="gap-2" onClick={() => navigate('/app/reports')}>
          <ArrowLeftRight size={14} />
          Open Reports
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibleSections.map((section) => {
          const sectionData = catalog.find((item) => item.key === section.key);
          const items = sectionData?.items || [];
          const Icon = section.icon;
          return (
            <Card key={section.key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${toneClassName(section.tone)}`}>
                  <Icon size={22} strokeWidth={1.8} />
                </div>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {items.length} types
                </span>
              </div>

              <h3 className="mt-4 text-lg font-semibold text-slate-900">{section.label}</h3>
              <p className="mt-1 text-sm text-slate-500">{section.description}</p>

              <div className="mt-4 flex flex-wrap gap-2">
                {items.slice(0, 3).map((item) => (
                  <span key={item.key} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium text-slate-600">
                    {item.label}
                  </span>
                ))}
              </div>

              <div className="mt-5 flex items-center justify-between gap-3">
                <Button type="button" variant="outline" className="gap-2" onClick={() => navigate(section.path)}>
                  Open section
                  <ArrowRight size={14} />
                </Button>
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${toneClassName(section.tone)}`}>
                  {section.key}
                </span>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <ArrowLeftRight size={20} />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900">Next phase ready point</h3>
            <p className="mt-1 text-sm text-slate-500">
              Abhi har section alag page me show ho raha hai. Phase 2 me hum inhi folders ke andar actual create/edit forms, posting screens, aur backend submission flows add karenge.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default TransactionsHomePage;
