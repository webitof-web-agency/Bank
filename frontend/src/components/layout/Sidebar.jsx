import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
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

function PopoverLink({ item, onNavigate }) {
  return (
    <NavLink
      to={item.path}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'block px-4 py-2.5 text-[14px] text-slate-700 hover:bg-slate-100 hover:text-[var(--primary,#2563eb)] transition-colors',
          isActive && 'bg-slate-50 font-semibold text-[var(--primary,#2563eb)]'
        )
      }
    >
      {item.label}
    </NavLink>
  );
}

function PopoverDropdown({ item, onNavigate, pathname }) {
  const [isHovered, setIsHovered] = useState(false);
  const [rect, setRect] = useState(null);
  const activeChild = item.children.some((child) => isItemActive(pathname, child));

  return (
    <div
      className="relative"
      onMouseEnter={(e) => {
        setRect(e.currentTarget.getBoundingClientRect());
        setIsHovered(true);
      }}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={cn(
          'flex cursor-pointer items-center justify-between px-4 py-2.5 text-[14px] transition-colors',
          activeChild ? 'bg-slate-50 font-semibold text-[var(--primary,#2563eb)]' : 'text-slate-700 hover:bg-slate-100 hover:text-[var(--primary,#2563eb)]'
        )}
      >
        <span>{item.label}</span>
        <ChevronRight size={16} className="text-slate-400" />
      </div>

      {isHovered && rect ? createPortal(
        <div 
          className="fixed z-[110] w-52 rounded-md bg-white py-1.5 shadow-lg ring-1 ring-black/5 border border-slate-100"
          style={{ top: rect.top, left: rect.right + 4 }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {item.children.map((child) => (
            child.children ? (
              <PopoverDropdown key={child.label} item={child} onNavigate={onNavigate} pathname={pathname} />
            ) : (
              <PopoverLink key={child.path || child.label} item={child} onNavigate={onNavigate} />
            )
          ))}
        </div>,
        document.body
      ) : null}
    </div>
  );
}

function isItemActive(pathname, item) {
  if (isPathActive(pathname, item.path)) return true;
  if (item.children) {
    return item.children.some(child => isItemActive(pathname, child));
  }
  return false;
}

function SidebarDropdown({ item, onNavigate, open, pathname, expanded, onToggle }) {
  const [localExpanded, setLocalExpanded] = useState(false);
  const [expandedChild, setExpandedChild] = useState(null);
  const [isHovered, setIsHovered] = useState(false);
  const [rect, setRect] = useState(null);

  const activeChild = item.children.some((child) => isItemActive(pathname, child));
  const activeParent = isPathActive(pathname, item.path);
  const visible = expanded ?? localExpanded ?? (activeChild || activeParent);

  const handleToggle = (next) => {
    if (onToggle) {
      onToggle(next);
    } else {
      setLocalExpanded(next);
    }
  };

  const handleChildToggle = (next, childLabel) => {
    setExpandedChild(next ? childLabel : null);
  };

  return (
    <div
      className="relative transition-all duration-200"
      onMouseEnter={(e) => {
        if (!open) {
          setRect(e.currentTarget.getBoundingClientRect());
          setIsHovered(true);
        }
      }}
      onMouseLeave={() => !open && setIsHovered(false)}
      style={{
        marginLeft: open ? '0.5rem' : '0.35rem',
        marginRight: open ? '0.5rem' : '0.35rem'
      }}
    >
      <button
        type="button"
        onClick={() => {
          if (open) handleToggle(!visible);
        }}
        className={cn(
          'group flex w-full items-center justify-between gap-3 px-3 py-2.5 text-[15px] transition-all duration-200 whitespace-nowrap rounded-[var(--radius-button,1rem)]',
          activeChild || activeParent || (open && visible) ? 'font-medium text-[var(--primary,#2563eb)]' : 'font-medium text-slate-700 hover:bg-[color-mix(in_srgb,var(--primary)_8%,transparent)] hover:text-[var(--primary,#2563eb)]',
          !open && 'lg:justify-center lg:px-0 lg:bg-transparent lg:hover:bg-transparent',
          !open && isHovered && 'bg-[color-mix(in_srgb,var(--primary)_8%,transparent)]'
        )}
        title={!open ? item.label : undefined}
      >
        <span className="flex items-center gap-3 overflow-hidden">
          <item.icon size={20} strokeWidth={2} className={cn('shrink-0 transition-colors', activeChild || activeParent || (open && visible) ? 'text-[var(--primary,#2563eb)]' : 'text-slate-700 group-hover:text-[var(--primary,#2563eb)]')} />
          <span className={cn('truncate transition-colors duration-200 group-hover:text-[var(--primary,#2563eb)]', !open && 'lg:hidden')}>
            {item.label}
          </span>
        </span>
        <span className={cn('transition-transform duration-200', !open && 'lg:hidden', visible && 'rotate-180')}>
          <ChevronDown size={16} />
        </span>
      </button>

      {/* Inline children (when open) */}
      {open && visible ? (
        <div className="mt-1 space-y-1 pb-2">
          {item.children.map((child) => (
            <div key={child.label || child.path} className="pl-4">
              {child.children ? (
                <SidebarDropdown
                  item={child}
                  onNavigate={onNavigate}
                  open={open}
                  pathname={pathname}
                  expanded={expandedChild === child.label}
                  onToggle={(next) => handleChildToggle(next, child.label)}
                />
              ) : (
                <SidebarLink item={child} onNavigate={onNavigate} open={open} />
              )}
            </div>
          ))}
        </div>
      ) : null}

      {/* Popover children (when collapsed) */}
      {!open && isHovered && rect ? createPortal(
        <div 
          className="fixed z-[100] w-56 rounded-xl bg-white py-2 shadow-xl ring-1 ring-black/5 border border-slate-100"
          style={{ top: rect.top, left: rect.right + 12 }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <div className="px-4 pb-2 mb-1 border-b border-slate-100 font-semibold text-slate-800 text-sm">
            {item.label}
          </div>
          {item.children.map((child) => (
            child.children ? (
              <PopoverDropdown key={child.label} item={child} onNavigate={onNavigate} pathname={pathname} />
            ) : (
              <PopoverLink key={child.path || child.label} item={child} onNavigate={onNavigate} />
            )
          ))}
        </div>,
        document.body
      ) : null}
    </div>
  );
}

export function Sidebar({ open = false, onClose, onToggleCollapse }) {
  const { user, branding, hasPermission: checkAuthPermission } = useAuth();
  const { pathname } = useLocation();
  const [expandedGroups, setExpandedGroups] = useState({});

  useEffect(() => {
    // When pathname changes, we want to auto-expand the parent containing the active item
    let activeRoot = null;
    let found = false;
    for (const group of navigationGroups) {
      if (found) break;
      for (const item of group.items) {
        if (item.children && isItemActive(pathname, item)) {
          activeRoot = item.label;
          found = true;
          break;
        }
      }
    }
    setExpandedGroups(activeRoot ? { [activeRoot]: true } : {});
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
          'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-slate-200 bg-white shadow-sm transition-all duration-300 lg:translate-x-0',
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

        <nav className="flex-1 space-y-2 overflow-y-auto overflow-x-hidden px-2 py-5">
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
                      onToggle={(next) => setExpandedGroups(next ? { [item.label]: true } : {})}
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
