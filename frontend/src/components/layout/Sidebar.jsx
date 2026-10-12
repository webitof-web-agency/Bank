import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronRight, Menu, X } from 'lucide-react';
import { navigationGroups } from '../../config/navigation';
import { useAuth } from '../../context/AuthContext';
import { getImageUrl } from '../../api/api';
import { cn } from '../../lib/cn';
import { useSociety } from '../../pages/reports/print/useSociety';

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

// The flyout starts flush against the trigger; `leftGap` is transparent
// padding so the pointer never crosses dead space on its way to the menu.
function getFlyoutPosition(rect, leftGap) {
  if (!rect) return {};
  const viewportPadding = 12;
  const top = Math.max(viewportPadding, Math.min(rect.top, window.innerHeight - viewportPadding - 120));
  return {
    top,
    left: rect.right,
    paddingLeft: leftGap,
    maxHeight: window.innerHeight - top - viewportPadding
  };
}

const FLYOUT_CLOSE_DELAY = 250;

function useHoverFlyout() {
  const [isHovered, setIsHovered] = useState(false);
  const [rect, setRect] = useState(null);
  const closeTimeoutRef = useRef(null);

  const clearCloseTimeout = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const open = (e) => {
    clearCloseTimeout();
    if (e) setRect(e.currentTarget.getBoundingClientRect());
    setIsHovered(true);
  };

  const scheduleClose = () => {
    clearCloseTimeout();
    closeTimeoutRef.current = setTimeout(() => setIsHovered(false), FLYOUT_CLOSE_DELAY);
  };

  useEffect(() => clearCloseTimeout, []);

  return { isHovered, rect, open, scheduleClose };
}

// `activeSub`/`setActiveSub` come from the parent flyout so only one sibling
// sub-menu is ever open: hovering a sibling swaps it in immediately.
function PopoverDropdown({ item, onNavigate, pathname, activeSub, setActiveSub }) {
  const { isHovered, rect, open: openFlyout, scheduleClose } = useHoverFlyout();
  const [childSub, setChildSub] = useState(null);
  const open = (e) => {
    openFlyout(e);
    setActiveSub(item.label);
  };
  const activeChild = item.children.some((child) => isItemActive(pathname, child));

  return (
    <div
      className="relative"
      onMouseEnter={open}
      onMouseLeave={scheduleClose}
    >
      {/* React's enter/leave skips the wrapper when coming back from the
          portalled flyout, so the row itself must cancel the pending close. */}
      <div
        onMouseEnter={() => open()}
        className={cn(
          'flex cursor-pointer items-center justify-between px-4 py-2.5 text-[14px] transition-colors',
          activeChild ? 'bg-slate-50 font-semibold text-[var(--primary,#2563eb)]' : 'text-slate-700 hover:bg-slate-100 hover:text-[var(--primary,#2563eb)]'
        )}
      >
        <span>{item.label}</span>
        <ChevronRight size={16} className="text-slate-400" />
      </div>

      {isHovered && rect && activeSub === item.label ? createPortal(
        <div
          className="fixed z-[110] flex"
          style={getFlyoutPosition(rect, 4)}
          onMouseEnter={() => open()}
          onMouseLeave={scheduleClose}
        >
          <div className="w-52 overflow-y-auto rounded-md bg-white py-1.5 shadow-lg ring-1 ring-black/5 border border-slate-100">
            {item.children.map((child) => (
              child.children ? (
                <PopoverDropdown key={child.label} item={child} onNavigate={onNavigate} pathname={pathname} activeSub={childSub} setActiveSub={setChildSub} />
              ) : (
                <PopoverLink key={child.path || child.label} item={child} onNavigate={onNavigate} />
              )
            ))}
          </div>
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
  const [activeSub, setActiveSub] = useState(null);
  const { isHovered, rect, open: openFlyout, scheduleClose } = useHoverFlyout();

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
        if (!open) openFlyout(e);
      }}
      onMouseLeave={() => !open && scheduleClose()}
      // Padding (not margin) so the inset stays inside the hover target; when
      // collapsed the wrapper reaches the sidebar edge and meets the flyout.
      style={{
        paddingLeft: open ? '0.5rem' : '0.35rem',
        paddingRight: open ? '0.5rem' : '0.35rem'
      }}
    >
      <button
        type="button"
        onMouseEnter={() => !open && isHovered && openFlyout()}
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
          className="fixed z-[100] flex"
          style={getFlyoutPosition(rect, 0)}
          onMouseEnter={() => openFlyout()}
          onMouseLeave={scheduleClose}
        >
          <div className="w-56 overflow-y-auto rounded-xl bg-white py-2 shadow-xl ring-1 ring-black/5 border border-slate-100">
            <div className="px-4 pb-2 mb-1 border-b border-slate-100 font-semibold text-slate-800 text-sm">
              {item.label}
            </div>
            {item.children.map((child) => (
              child.children ? (
                <PopoverDropdown key={child.label} item={child} onNavigate={onNavigate} pathname={pathname} activeSub={activeSub} setActiveSub={setActiveSub} />
              ) : (
                <PopoverLink key={child.path || child.label} item={child} onNavigate={onNavigate} />
              )
            ))}
          </div>
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
  const society = useSociety();
  // Uploaded sidebar branding wins; otherwise fall back to the society logo.
  const expandedLogo = branding?.sidebarExpandedUrl || branding?.logoUrl || society.logoUrl;
  const collapsedLogo = branding?.sidebarCollapsedUrl || branding?.logoUrl || society.logoUrl;
  const logoAlt = society.name || branding?.appName || 'Logo';

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
      // A section's own permission covers its children too.
      if (item.permission && !checkAuthPermission(item.permission)) {
        return null;
      }

      if (item.children?.length) {
        const children = item.children
          .map((child) => filterItem(child))
          .filter(Boolean);

        if (!children.length) return null;
        return { ...item, children };
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
          'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-slate-200 bg-white shadow-sm transition-all duration-300 lg:translate-x-0 print:hidden',
          open ? 'translate-x-0 w-64' : '-translate-x-full w-64 lg:w-20'
        )}
      >
        <div className={cn('relative flex min-h-[5rem] items-center justify-center px-5 py-4')}>
          <div className="flex items-center justify-center">
            {open ? (
              expandedLogo ? (
                <img src={getImageUrl(expandedLogo)} alt={logoAlt} className="h-16 w-auto max-w-[200px] object-contain" />
              ) : null
            ) : (
              collapsedLogo ? (
                <img src={getImageUrl(collapsedLogo)} alt={logoAlt} className="hidden h-12 w-auto max-w-[64px] object-contain lg:block" />
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

        <nav className={cn('flex-1 space-y-2 overflow-y-auto overflow-x-hidden py-5', open ? 'px-2' : 'px-2 lg:px-0')}>
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
