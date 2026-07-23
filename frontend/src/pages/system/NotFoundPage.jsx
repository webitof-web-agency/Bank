import { Link } from 'react-router-dom';
import { ArrowLeft, FileText, Compass } from 'lucide-react';
import { Card } from '../../components/ui/Card';

export function NotFoundPage() {
  return (
    <div className="flex min-h-[85vh] items-center justify-center p-4">
      <Card className="relative z-10 w-full max-w-lg overflow-hidden bg-white p-10 text-center shadow-2xl ring-1 ring-slate-100 animate-in fade-in slide-in-from-bottom-8 duration-700">
        
        {/* Animated Icon Container */}
        <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-slate-50 ring-8 ring-slate-50 animate-bounce">
          <Compass size={44} className="text-[var(--primary)]" strokeWidth={1.5} />
        </div>

        <h1 className="text-7xl font-black tracking-tight text-slate-800">404</h1>
        <h2 className="mt-4 text-2xl font-bold tracking-tight text-slate-800">Page Not Found</h2>
        
        <p className="mt-4 text-sm leading-6 text-slate-500">
          Oops! It seems you've drifted off route. The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            to="/app/dashboard"
            className="flex items-center gap-2 rounded-xl bg-[var(--primary)] px-6 py-3 text-sm font-medium text-white shadow-lg shadow-[var(--primary)]/30 transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-[var(--primary)]/40 focus:ring-2 focus:ring-[var(--primary)] focus:outline-none focus:ring-offset-2"
          >
            <ArrowLeft size={18} className="text-white" />
            <span className="text-white">Back to Dashboard</span>
          </Link>
          <Link
            to="/app/files"
            className="flex items-center gap-2 rounded-xl bg-slate-100 px-6 py-3 text-sm font-medium text-slate-700 transition-all hover:bg-slate-200 hover:-translate-y-1"
          >
            <FileText size={18} />
            <span>Open Files</span>
          </Link>
        </div>
      </Card>
    </div>
  );
}
