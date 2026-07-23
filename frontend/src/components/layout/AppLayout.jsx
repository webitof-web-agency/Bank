import { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { navigationGroups } from '../../config/navigation';
import { useAuth } from '../../context/AuthContext';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { cn } from '../../lib/cn';

function findNavItem(items = [], pathname = '') {
  for (const item of items) {
    if (Array.isArray(item.children) && item.children.length) {
      const child = findNavItem(item.children, pathname);
      if (child) return child;
    }
    if (pathname === item.path || pathname.startsWith(`${item.path}/`)) {
      return item;
    }
  }
  return null;
}

function resolveTitle(pathname) {
  const item = findNavItem(navigationGroups.flatMap((group) => group.items), pathname);
  return item?.label || 'Dashboard';
}

export function AppLayout() {
  const location = useLocation();
  const { user } = useAuth();

  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    if (window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  }, [location.pathname]);

  const title = useMemo(() => resolveTitle(location.pathname), [location.pathname]);
  const subtitle = user?.roles?.length
    ? `Signed in as ${user.roles.map((role) => role.name).join(', ')}`
    : 'Ready for role-based work';

  return (
    <div className="min-h-screen bg-white">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onToggleCollapse={() => setSidebarOpen((current) => !current)}
      />
      <div className={cn('min-h-screen transition-all duration-300', sidebarOpen ? 'lg:pl-64' : 'lg:pl-20')}>
        <Topbar
          title={title}
          subtitle={subtitle}
          onMenuClick={() => setSidebarOpen((current) => !current)}
        />
        <main className="w-full px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
