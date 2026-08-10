import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronRight, Menu, X } from 'lucide-react';
import { navigationGroups } from '../../config/navigation';
import { useAuth } from '../../context/AuthContext';
import { getImageUrl } from '../../api/api';
import { cn } from '../../lib/cn';



function isPathActive(pathname, path) {
  if (!path) return false;
  return pathname === path || pathname.startsWith(`${path}/`);
}

function SidebarLink({ item, onNavigate, open }) {
  return (
    <NavLink
      to={item.path}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-3 px-3 py-2.5 text-[15px] transition-all duration-200 overflow-hidden whitespace-nowrap rounded-[var(--radius-button,1rem)]',
          isActive ? 'font-medium bg-[var(--brand-sidebar-active,#e0e7ff)] text-[var(--primary,#2563eb)]' : 'font-medium text-slate-700 hover:bg-[color-mix(in_srgb,var(--primary)_8%,transparent)] hover:text-[var(--primary,#2563eb)]',
          !open && 'lg:justify-center lg:px-0 lg:bg-transparent lg:hover:bg-transparent'
        )
      }
      style={{
        marginLeft: open ? '0.5rem' : '0.35rem',
        marginRight: open ? '0.5rem' : '0.35rem'
      }}
      title={!open ? item.label : undefined}
    >
      {({ isActive }) => (
        <>
          <item.icon size={20} strokeWidth={2} className={cn('shrink-0 transition-colors', isActive ? 'text-[var(--primary,#2563eb)]' : 'text-slate-700 group-hover:text-[var(--primary,#2563eb)]')} />
          <span className={cn('truncate transition-colors duration-200 group-hover:text-[var(--primary,#2563eb)]', !open && 'lg:hidden', isActive && 'text-[var(--primary,#2563eb)] font-semibold')}>
            {item.label}
          </span>
        </>
      )}
    </NavLink>
  );
}

function SidebarDropdown({ item, onNavigate, open, pathname, expanded, onToggle }) {
  const activeChild = item.children.some((child) => isPathActive(pathname, child.path));
  const activeParent = isPathActive(pathname, item.path);
  const visible = expanded ?? (activeChild || activeParent);

  return (
    <div
      className="overflow-hidden transition-all duration-200"
      style={{
        marginLeft: open ? '0.5rem' : '0.35rem',
        marginRight: open ? '0.5rem' : '0.35rem'
      }}
    >
      <button
        type="button"
        onClick={() => onToggle(!visible)}
        className={cn(
          'group flex w-full items-center justify-between gap-3 px-3 py-2.5 text-[15px] transition-all duration-200 whitespace-nowrap rounded-[var(--radius-button,1rem)]',
          activeChild || activeParent || visible ? 'font-medium text-[var(--primary,#2563eb)]' : 'font-medium text-slate-700 hover:bg-[color-mix(in_srgb,var(--primary)_8%,transparent)] hover:text-[var(--primary,#2563eb)]',
          !open && 'lg:justify-center lg:px-0 lg:bg-transparent lg:hover:bg-transparent'
        )}
        title={!open ? item.label : undefined}
      >
        <span className="flex items-center gap-3 overflow-hidden">
          <item.icon size={20} strokeWidth={2} className={cn('shrink-0 transition-colors', activeChild || activeParent || visible ? 'text-[var(--primary,#2563eb)]' : 'text-slate-700 group-hover:text-[var(--primary,#2563eb)]')} />
          <span className={cn('truncate transition-colors duration-200 group-hover:text-[var(--primary,#2563eb)]', !open && 'lg:hidden')}>
            {item.label}
          </span>
        </span>
        <span className={cn('transition-transform duration-200', !open && 'lg:hidden', visible && 'rotate-180')}>
          <ChevronDown size={16} />
        </span>
      </button>

      {visible ? (
        <div className={cn('mt-1 space-y-1 pb-2', !open && 'lg:hidden')}>
          {item.children.map((child) => (
            <div key={child.path} className="pl-4">
              <SidebarLink item={child} onNavigate={onNavigate} open={open} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function Sidebar({ open = false, onClose, onToggleCollapse }) {
  const { user, branding, hasPermission: checkAuthPermission } = useAuth();
  const { pathname } = useLocation();
  const [expandedGroups, setExpandedGroups] = useState({});

  useEffect(() => {
    setExpandedGroups({});
  }, [pathname]);

  const visibleGroups = useMemo(() => {
    function filterItem(item) {
      if (item.children?.length) {
        const children = item.children
          .map((child) => filterItem(child))
          .filter(Boolean);

        if (!children.length) return null;
        return { ...item, children };
      }

      if (item.permission && !checkAuthPermission(item.permission)) {
        return null;
      }

      return item;
    }

    return navigationGroups
      .map((group) => ({
        ...group,
        items: group.items
          .map((item) => filterItem(item))
          .filter(Boolean)
      }))
      .filter((group) => group.items.length > 0);
  }, [user, checkAuthPermission]);

  return (
    <>
      {open ? <div className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-sm lg:hidden" onClick={onClose} /> : null}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex flex-col overflow-hidden border-r border-slate-200 bg-white shadow-sm transition-all duration-300 lg:translate-x-0',
          open ? 'translate-x-0 w-64' : '-translate-x-full w-64 lg:w-20'
        )}
      >
        <div className={cn('relative flex min-h-[5rem] items-center justify-center px-5 py-4')}>
          <div className="flex items-center justify-center">
            {open ? (
              (branding?.sidebarExpandedUrl || branding?.logoUrl) ? (
                <img src={getImageUrl(branding?.sidebarExpandedUrl || branding?.logoUrl)} alt={branding?.appName || 'Logo'} className="h-16 w-auto max-w-[200px] object-contain" />
              ) : null
            ) : (
              branding?.sidebarCollapsedUrl ? (
                <img src={getImageUrl(branding.sidebarCollapsedUrl)} alt={branding?.appName || 'Logo'} className="hidden h-12 w-auto max-w-[64px] object-contain lg:block" />
              ) : null
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 lg:hidden"
            aria-label="Close sidebar"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 space-y-2 overflow-y-auto px-2 py-5">
          {visibleGroups.map((group) => (
            <div key={group.title}>
              <div className="space-y-1">
                {group.items.map((item) => (
                  item.children ? (
                    <SidebarDropdown
                      key={item.label}
                      item={item}
                      open={open}
                      pathname={pathname}
                      expanded={expandedGroups[item.label]}
                      onToggle={(next) => setExpandedGroups((current) => ({ ...current, [item.label]: next }))}
                      onNavigate={() => { if (window.innerWidth < 1024) onClose(); }}
                    />
                  ) : (
                    <SidebarLink
                      key={item.path}
                      item={item}
                      open={open}
                      onNavigate={() => { if (window.innerWidth < 1024) onClose(); }}
                    />
                  )
                ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}

export function SidebarToggle({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-[color-mix(in_srgb,var(--primary)_8%,transparent)] hover:text-[var(--primary)]"
      aria-label="Toggle navigation"
    >
      <Menu size={20} strokeWidth={1.8} />
    </button>
  );
}
