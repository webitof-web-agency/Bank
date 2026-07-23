import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { AccessDeniedPage } from '../../pages/system/AccessDeniedPage';

export function PermissionRoute({ permission, children }) {
  const { token, loading, hasPermission } = useAuth();
  const requestedPermissions = Array.isArray(permission) ? permission : [permission];

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-[var(--text-muted)]">
        Loading session...
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (permission && !hasPermission(...requestedPermissions)) {
    return <AccessDeniedPage requiredPermission={permission} />;
  }

  return children;
}
