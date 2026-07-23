import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';

export function AccessDeniedPage({ requiredPermission = '' }) {
  const { logout, user } = useAuth();
  const permissionLabel = Array.isArray(requiredPermission)
    ? requiredPermission.filter(Boolean).join(' or ')
    : requiredPermission;

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-xl text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl border border-rose-400/20 bg-rose-500/10 text-rose-200">
          <ShieldAlert size={28} />
        </div>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.28em] text-[var(--text-muted)]">Access denied</p>
        <h1 className="mt-3 text-3xl font-semibold text-[var(--text)]">You do not have permission to open this page.</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
          {permissionLabel ? `Required permission: ${permissionLabel}.` : 'Your account is missing the permission needed for this section.'}
        </p>
        <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
          Signed in as {user?.fullName || user?.username || 'current user'}.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button as={Link} to="/app/dashboard">
            Back to Dashboard
          </Button>
          <Button type="button" variant="secondary" onClick={logout}>
            Logout
          </Button>
        </div>
      </Card>
    </div>
  );
}
