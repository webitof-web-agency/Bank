import { useAuth } from '../../context/AuthContext';
import { getImageUrl } from '../../api/api';

export function AuthLayout({ title, subtitle, children }) {
  const { branding } = useAuth();

  return (
    <div className="relative min-h-screen overflow-hidden bg-white">
      <div className="relative flex min-h-screen items-center justify-center px-6 py-12">
        <div className="w-full max-w-lg flex flex-col items-center">
          {branding?.logoUrl ? (
            <img src={getImageUrl(branding.logoUrl)} alt={branding.appName || 'Logo'} className="mb-8 h-24 max-w-xs object-contain drop-shadow-sm" />
          ) : null}
          <section className="w-full rounded-[2rem] border border-slate-200 bg-white p-8 md:p-10 shadow-sm">
            <div className="mb-8">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{title}</h1>
              {subtitle ? <p className="mt-3 text-sm leading-6 text-slate-500">{subtitle}</p> : null}
            </div>
            {children}
          </section>
        </div>
      </div>
    </div>
  );
}
