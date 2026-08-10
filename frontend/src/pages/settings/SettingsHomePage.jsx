import { useNavigate } from 'react-router-dom';
import { ArrowRight, Search, Sparkles } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { useAuth } from '../../context/AuthContext';
import { SETTINGS_LINKS } from './settingsLinks';

export function SettingsHomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const visibleLinks = SETTINGS_LINKS.filter((link) => {
    if (!link.permission || user?.isSuperAdmin) return true;
    const required = Array.isArray(link.permission) ? link.permission : [link.permission];
    return required.some((permission) => user?.permissions?.includes(permission));
  });

  const groupedLinks = visibleLinks.reduce((acc, link) => {
    const group = link.group || 'Other';
    if (!acc[group]) acc[group] = [];
    acc[group].push(link);
    return acc;
  }, {});

  const groupOrder = ['Overview', 'Configuration', 'Communication', 'Administration', 'Other'];

  function toneStyles(tone = 'slate') {
    if (tone === 'emerald') return 'bg-emerald-50 text-emerald-600 border-emerald-100';
    if (tone === 'amber') return 'bg-amber-50 text-amber-600 border-amber-100';
    if (tone === 'blue') return 'bg-blue-50 text-blue-600 border-blue-100';
    return 'bg-slate-50 text-slate-600 border-slate-100';
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="relative bg-gradient-to-r from-[#0f172a] via-[#1d4ed8] to-[#1661F6] px-6 py-8 text-white md:px-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.16),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.08),transparent_35%)]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[12px] font-medium text-white/90 backdrop-blur">
                <Sparkles size={13} />
                System Settings Center
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Settings</h1>
                <p className="mt-2 max-w-2xl text-sm text-blue-50 md:text-[15px]">
                  Manage company identity, branding, UI preferences, and email configuration from one dedicated area.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 sm:min-w-[320px]">
              {[
                { label: 'Sections', value: Object.keys(groupedLinks).length },
                { label: 'Cards', value: visibleLinks.length },
                { label: 'Access', value: user?.isSuperAdmin ? 'All' : 'RBAC' }
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-blue-100">{item.label}</p>
                  <p className="mt-1 text-xl font-semibold">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <div className="space-y-6">
        {groupOrder.map((group) => {
          const items = groupedLinks[group];
          if (!items?.length) return null;
          return (
            <section key={group} className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">{group}</h2>
                  <p className="text-sm text-slate-500">{items.length} module{items.length === 1 ? '' : 's'} available</p>
                </div>
                <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-[12px] text-slate-500 md:inline-flex">
                  <Search size={14} />
                  Click a card to open
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.path}
                      type="button"
                      onClick={() => navigate(item.path)}
                      className="group text-left"
                    >
                      <Card className="h-full rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
                        <div className="flex items-start gap-4">
                          <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${toneStyles(item.tone)}`}>
                            <Icon size={22} strokeWidth={1.8} />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <h3 className="text-base font-semibold text-slate-900">{item.label}</h3>
                              <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${toneStyles(item.tone)}`}>
                                {group}
                              </span>
                            </div>
                            <p className="mt-1 text-sm text-slate-500">{item.description}</p>
                          </div>
                        </div>
                      </Card>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export default SettingsHomePage;
