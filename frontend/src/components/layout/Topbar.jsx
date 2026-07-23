import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Calendar,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  FileBarChart,
  FileText,
  Folder,
  Landmark,
  LogOut,
  Settings,
  Settings2,
  ShieldAlert,
  UserRound
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/api';
import { SidebarToggle } from './Sidebar';
import { UserAvatar } from '../ui/UserAvatar';
import { REPORT_GROUPED_LINKS } from '../../pages/reports/reportLinks';
import {
  getNotificationAccentTone,
  formatNotificationTime,
  getNotificationIconKind,
  getNotificationTargetPath,
  notifyNotificationsChanged
} from '../../pages/notifications/notificationUtils';

function NotificationIcon({ item, size = 16 }) {
  const kind = getNotificationIconKind(item);
  const iconProps = { size, strokeWidth: 1.85 };

  switch (kind) {
    case 'success':
      return <CheckCircle2 {...iconProps} />;
    case 'warning':
      return <AlertTriangle {...iconProps} />;
    case 'error':
    case 'security':
      return <ShieldAlert {...iconProps} />;
    case 'transaction':
      return <Landmark {...iconProps} />;
    case 'master':
    case 'reports':
      return <FileText {...iconProps} />;
    case 'settings':
      return <Settings2 {...iconProps} />;
    case 'files':
      return <Folder {...iconProps} />;
    case 'auth':
      return <UserRound {...iconProps} />;
    case 'system':
      return <Bell {...iconProps} />;
    case 'info':
    default:
      return <Bell {...iconProps} />;
  }
}

export function Topbar({ title, subtitle, onMenuClick }) {
  const { user, token, logout, hasPermission } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [latestNotifications, setLatestNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const userDropdownRef = useRef(null);
  const reportsDropdownRef = useRef(null);
  const notificationsDropdownRef = useRef(null);
  const notificationsOpenRef = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();
  const isDashboard = location.pathname === '/app/dashboard';

  function refreshUnreadCount(active = true) {
    if (!user || !token || !api?.notifications?.unreadCount) {
      if (active) setUnreadCount(0);
      return Promise.resolve();
    }

    return api.notifications.unreadCount(token)
      .then((response) => {
        if (!active) return;
        setUnreadCount(Number(response.data?.unreadCount || 0));
      })
      .catch(() => {
        if (active) setUnreadCount(0);
      });
  }

  useEffect(() => {
    function handleClickOutside(event) {
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
      if (reportsDropdownRef.current && !reportsDropdownRef.current.contains(event.target)) {
        setReportsOpen(false);
      }
      if (notificationsDropdownRef.current && !notificationsDropdownRef.current.contains(event.target)) {
        setNotificationsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setDropdownOpen(false);
    setReportsOpen(false);
    setNotificationsOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    notificationsOpenRef.current = notificationsOpen;
  }, [notificationsOpen]);

  async function loadLatestNotifications(active = true) {
    if (!user || !token || !api?.notifications?.list) {
      if (active) setLatestNotifications([]);
      return;
    }

    setNotificationsLoading(true);
    try {
      const response = await api.notifications.list(token, { page: 1, limit: 5 });
      if (!active) return;
      setLatestNotifications(Array.isArray(response.data?.items) ? response.data.items : []);
    } catch {
      if (active) setLatestNotifications([]);
    } finally {
      if (active) setNotificationsLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    const handleNotificationChange = () => {
      refreshUnreadCount(mounted);
      if (notificationsOpenRef.current) {
        loadLatestNotifications(mounted);
      }
    };

    refreshUnreadCount(mounted);
    window.addEventListener('notifications:changed', handleNotificationChange);

    let eventSource;
    let fallbackTimer;
    if (token) {
      try {
        eventSource = new EventSource(api.notifications.streamUrl(token));
        eventSource.onmessage = (event) => {
          if (!mounted) return;
          try {
            const payload = JSON.parse(event.data || '{}');
            if (payload?.type === 'connected') return;
          } catch {
            // Ignore malformed messages and just refresh unread count.
          }
          refreshUnreadCount(mounted);
        };
        eventSource.onerror = () => {
          if (eventSource && eventSource.readyState === EventSource.CLOSED) {
            eventSource.close();
          }
        };
      } catch {
        fallbackTimer = window.setInterval(() => refreshUnreadCount(mounted), 30000);
      }
    }

    return () => {
      mounted = false;
      window.removeEventListener('notifications:changed', handleNotificationChange);
      if (eventSource) eventSource.close();
      if (fallbackTimer) window.clearInterval(fallbackTimer);
    };
  }, [token, user, location.pathname]);

  useEffect(() => {
    if (notificationsOpen) {
      loadLatestNotifications(true);
    }
  }, [notificationsOpen]);

  const visibleReports = useMemo(
    () => REPORT_GROUPED_LINKS
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => hasPermission(item.permission))
      }))
      .filter((group) => group.items.length > 0),
    [hasPermission]
  );

  async function handleOpenNotification(notification) {
    const targetPath = getNotificationTargetPath(notification);
    const fallbackPath = `/app/notifications/${notification.id}`;
    const nextPath = targetPath && targetPath !== '/app/notifications' ? targetPath : fallbackPath;

    if (!notification.isRead) {
      try {
        await api.notifications.markRead(token, notification.id);
        notifyNotificationsChanged();
      } catch {
        // Continue navigation even if marking read fails.
      }
    }

    setNotificationsOpen(false);
    navigate(nextPath);
  }

  async function handleMarkAllReadInDropdown() {
    try {
      await api.notifications.markAllRead(token);
      notifyNotificationsChanged();
      await Promise.all([refreshUnreadCount(true), loadLatestNotifications(true)]);
    } catch {
      // no-op
    }
  }

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/90 px-4 py-3 backdrop-blur-xl shadow-sm print:hidden md:px-8">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <SidebarToggle onClick={onMenuClick} />
        </div>

        <div className="flex items-center gap-3">

          <button
            type="button"
            onClick={() => navigate('/app/calendar')}
            className="text-slate-400 transition hover:text-slate-600"
            aria-label="Open calendar"
            title="Calendar"
          >
            <Calendar size={20} strokeWidth={1.8} />
          </button>

          <div className="relative" ref={notificationsDropdownRef}>
            <button
              type="button"
              className="relative text-slate-400 transition hover:text-slate-600"
              onClick={() => setNotificationsOpen((current) => !current)}
              aria-label="Open notifications"
              title="Notifications"
            >
              <Bell size={20} strokeWidth={1.8} />
              {unreadCount > 0 ? (
                <span className="absolute -right-1 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--primary,#1661F6)] px-1 text-[10px] font-bold text-white ring-2 ring-white">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              ) : null}
            </button>

            {notificationsOpen ? (
              <div className="absolute right-0 top-full z-30 mt-3 w-[min(24rem,calc(100vw-1rem))] overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-[0_24px_80px_-20px_rgba(15,23,42,0.24)]">
                <div className="flex items-center justify-between gap-4 border-b border-[color-mix(in_srgb,var(--primary)_10%,transparent)] bg-[color-mix(in_srgb,var(--primary)_4%,transparent)] px-4 py-4">
                  <div>
                    <p className="text-[14px] font-bold text-[var(--primary)]">Notifications</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setNotificationsOpen(false);
                      navigate('/app/notifications');
                    }}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700 transition hover:border-[var(--primary)] hover:text-[var(--primary)] hover:bg-[color-mix(in_srgb,var(--primary)_4%,transparent)]"
                  >
                    Open inbox
                    <ArrowRight size={13} />
                  </button>
                </div>

                <div className="max-h-[28rem] overflow-y-auto p-2">
                  {notificationsLoading ? (
                    <div className="flex h-32 items-center justify-center text-sm text-slate-500">Loading...</div>
                  ) : latestNotifications.length ? (
                    <div className="space-y-1">
                      {latestNotifications.map((notification) => {
                        const unread = !notification.isRead;
                        return (
                          <button
                            key={notification.id}
                            type="button"
                            onClick={() => handleOpenNotification(notification)}
                            className="flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-[color-mix(in_srgb,var(--primary)_4%,transparent)]"
                          >
                            <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] border ${getNotificationAccentTone(notification)}`}>
                              <NotificationIcon item={notification} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-2">
                                <span className="truncate text-[13px] font-semibold text-slate-900">{notification.title}</span>
                                {unread ? <span className="h-2.5 w-2.5 rounded-full bg-[var(--primary)]" /> : null}
                              </span>
                              <span className="mt-1 line-clamp-2 text-[12px] leading-5 text-slate-500">{notification.message || 'No message provided.'}</span>
                              <span className="mt-2 block text-[11px] text-slate-400">{formatNotificationTime(notification.createdAt)}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex h-32 flex-col items-center justify-center gap-2 text-sm text-slate-500">
                      <Bell size={18} className="text-slate-300" />
                      No notifications yet
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-[color-mix(in_srgb,var(--primary)_10%,transparent)] bg-[color-mix(in_srgb,var(--primary)_2%,transparent)] px-4 py-3">
                  <button
                    type="button"
                    onClick={handleMarkAllReadInDropdown}
                    className="inline-flex items-center gap-2 rounded-[var(--radius-button,1rem)] border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700 transition hover:border-[var(--primary)] hover:text-[var(--primary)] hover:bg-[color-mix(in_srgb,var(--primary)_4%,transparent)]"
                  >
                    <CheckCheck size={13} />
                    Mark all read
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNotificationsOpen(false);
                      navigate('/app/notifications');
                    }}
                    className="inline-flex items-center gap-2 rounded-[var(--radius-button,1rem)] px-3 py-1.5 text-[12px] font-semibold text-[var(--primary)] transition hover:bg-[color-mix(in_srgb,var(--primary)_8%,transparent)]"
                  >
                    View all
                    <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="relative ml-2" ref={userDropdownRef}>
            <button
              type="button"
              className="flex items-center outline-none"
              onClick={() => setDropdownOpen((current) => !current)}
            >
              <UserAvatar name={user?.fullName || 'User'} url={user?.avatarUrl} gender={user?.gender} className="h-10 w-10 cursor-pointer shadow-sm ring-2 ring-slate-100 transition hover:ring-slate-200" fallbackSize={18} />
            </button>

            {dropdownOpen ? (
              <div className="absolute right-0 top-full mt-3 w-64 rounded-2xl border border-slate-100 bg-white p-2 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.1)]">
                <div className="flex items-center gap-3 p-3">
                  <UserAvatar name={user?.fullName || 'User'} url={user?.avatarUrl} gender={user?.gender} className="h-10 w-10 shrink-0" fallbackSize={18} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{user?.fullName || 'System Admin'}</p>
                    <p className="truncate text-[13px] font-medium text-blue-600">{user?.role || 'Admin'}</p>
                    <p className="truncate text-xs text-slate-500">{user?.email || 'admin@webitof.com'}</p>
                  </div>
                </div>

                <div className="my-1 h-px w-full bg-slate-100" />

                <div className="flex justify-between gap-1 p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setDropdownOpen(false);
                      navigate('/app/profile');
                    }}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-[13px] font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-900"
                  >
                    <Settings size={15} />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDropdownOpen(false);
                      logout();
                    }}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-[13px] font-medium text-rose-600 transition hover:bg-rose-50"
                  >
                    <LogOut size={15} />
                    Logout
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
