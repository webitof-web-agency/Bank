import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  BellRing,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  FileText,
  Filter,
  Folder,
  Landmark,
  RefreshCw,
  Search,
  Settings2,
  ShieldAlert,
  Trash2,
  UserRound
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../api/api';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { Table } from '../../components/ui/Table';
import {
  formatNotificationTime,
  getNotificationAccentTone,
  getNotificationIconKind,
  getNotificationModuleLabel,
  getNotificationSeverityLabel,
  getNotificationTone,
  getNotificationTypeLabel,
  NOTIFICATION_MODULE_OPTIONS,
  NOTIFICATION_SEVERITY_OPTIONS,
  NOTIFICATION_TYPE_OPTIONS,
  notifyNotificationsChanged
} from './notificationUtils';

function NotificationIcon({ item, size = 18 }) {
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
      return <BellRing {...iconProps} />;
    case 'info':
    default:
      return <BellRing {...iconProps} />;
  }
}

function NotificationPreview({ item, compact = false }) {
  const unread = !item.isRead;

  return (
    <button type="button" onClick={item.onOpen} className="flex w-full items-start gap-3 text-left">
      <span className={`mt-0.5 flex ${compact ? 'h-9 w-9' : 'h-10 w-10'} shrink-0 items-center justify-center rounded-2xl border ${getNotificationAccentTone(item)}`}>
        <NotificationIcon item={item} size={compact ? 16 : 18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[14px] font-semibold text-slate-900">{item.title || 'Notification'}</span>
          {unread ? <span className="h-2.5 w-2.5 rounded-full bg-blue-600" /> : null}
        </span>
        <span className="mt-1 line-clamp-2 text-[12.5px] leading-6 text-slate-500">{item.message || 'No message provided.'}</span>
      </span>
    </button>
  );
}

function useNotificationStream(token, onChange) {
  useEffect(() => {
    if (!token) return undefined;

    let mounted = true;
    let eventSource = null;
    let fallbackTimer = null;

    const notify = () => {
      if (!mounted) return;
      onChange?.();
    };

    try {
      eventSource = new EventSource(api.notifications.streamUrl(token));
      eventSource.onmessage = (event) => {
        if (!mounted) return;
        try {
          const payload = JSON.parse(event.data || '{}');
          if (payload?.type === 'connected') return;
        } catch {
          // Ignore malformed payloads and still refresh the inbox.
        }
        notify();
      };
      eventSource.onerror = () => {
        if (!mounted) return;
        if (eventSource?.readyState === EventSource.CLOSED) {
          eventSource.close();
        }
      };
    } catch {
      fallbackTimer = window.setInterval(notify, 30000);
    }

    return () => {
      mounted = false;
      if (eventSource) eventSource.close();
      if (fallbackTimer) window.clearInterval(fallbackTimer);
    };
  }, [onChange, token]);
}

export function NotificationsPage() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ total: 0, unreadCount: 0, page: 1, limit: 10 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [expandedModules, setExpandedModules] = useState({});

  const loadNotifications = useCallback(async () => {
    if (!token) return;
    setLoading(true);

    try {
      const response = await api.notifications.list(token, {
        search,
        module: moduleFilter,
        type: typeFilter,
        severity: severityFilter,
        unreadOnly: unreadOnly ? 'true' : '',
        page,
        limit
      });

      setItems(Array.isArray(response.data?.items) ? response.data.items : []);
      setMeta({
        total: Number(response.data?.total || 0),
        unreadCount: Number(response.data?.unreadCount || 0),
        page: Number(response.data?.page || page),
        limit: Number(response.data?.limit || limit)
      });
    } catch (error) {
      toast.error(error.message || 'Unable to load notifications');
    } finally {
      setLoading(false);
    }
  }, [limit, moduleFilter, page, search, severityFilter, token, typeFilter, unreadOnly]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  useNotificationStream(token, loadNotifications);

  useEffect(() => {
    const handleChange = () => loadNotifications();
    window.addEventListener('notifications:changed', handleChange);
    return () => window.removeEventListener('notifications:changed', handleChange);
  }, [loadNotifications]);

  const summary = useMemo(() => {
    const unread = meta.unreadCount;
    const critical = items.filter((item) => String(item.severity).toLowerCase() === 'critical').length;
    const security = items.filter((item) => String(item.type).toLowerCase() === 'security').length;
    const moduleCounts = items.reduce((acc, item) => {
      const key = String(item.module || 'system').toLowerCase();
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return { unread, critical, security, moduleCounts };
  }, [items, meta.unreadCount]);

  const groupedNotifications = useMemo(() => {
    const groups = new Map();

    items.forEach((item) => {
      const key = String(item.module || 'system').toLowerCase();
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          label: getNotificationModuleLabel(key),
          items: [],
          unreadCount: 0
        });
      }

      const group = groups.get(key);
      group.items.push(item);
      if (!item.isRead) {
        group.unreadCount += 1;
      }
    });

    return Array.from(groups.values()).sort((a, b) => b.items.length - a.items.length || a.label.localeCompare(b.label));
  }, [items]);

  useEffect(() => {
    setExpandedModules((current) => {
      const next = {};
      groupedNotifications.forEach((group, index) => {
        if (Object.prototype.hasOwnProperty.call(current, group.key)) {
          next[group.key] = current[group.key];
        } else {
          next[group.key] = index === 0;
        }
      });
      return next;
    });
  }, [groupedNotifications]);

  const modulePills = useMemo(() => {
    const base = [
      { key: '', label: 'All', value: meta.total },
      { key: 'master', label: 'Master', value: summary.moduleCounts.master || 0 },
      { key: 'banking', label: 'Banking', value: summary.moduleCounts.banking || 0 },
      { key: 'transaction', label: 'Transaction', value: summary.moduleCounts.transaction || 0 },
      { key: 'settings', label: 'Settings', value: summary.moduleCounts.settings || 0 },
      { key: 'reports', label: 'Reports', value: summary.moduleCounts.reports || 0 },
      { key: 'auth', label: 'Auth', value: summary.moduleCounts.auth || 0 },
      { key: 'files', label: 'Files', value: summary.moduleCounts.files || 0 }
    ];
    return base;
  }, [meta.total, summary.moduleCounts]);

  const quickFilters = [
    { label: 'All', active: !unreadOnly && !moduleFilter && !typeFilter && !severityFilter, onClick: () => { setUnreadOnly(false); setModuleFilter(''); setTypeFilter(''); setSeverityFilter(''); setPage(1); } },
    { label: 'Unread', active: unreadOnly, onClick: () => { setUnreadOnly((current) => !current); setPage(1); } },
    { label: 'Reset', active: !unreadOnly && !moduleFilter && !typeFilter && !severityFilter, onClick: () => { setUnreadOnly(false); setModuleFilter(''); setTypeFilter(''); setSeverityFilter(''); setPage(1); } }
  ];

  async function refreshList() {
    await loadNotifications();
  }

  async function handleMarkAllRead() {
    try {
      await api.notifications.markAllRead(token);
      toast.success('All notifications marked as read');
      notifyNotificationsChanged();
      await loadNotifications();
    } catch (error) {
      toast.error(error.message || 'Unable to mark notifications as read');
    }
  }

  async function handleMarkRead(notificationId) {
    try {
      await api.notifications.markRead(token, notificationId);
      notifyNotificationsChanged();
      await loadNotifications();
    } catch (error) {
      toast.error(error.message || 'Unable to update notification');
    }
  }

  async function handleDelete(notificationId) {
    try {
      await api.notifications.remove(token, notificationId);
      toast.success('Notification deleted');
      notifyNotificationsChanged();
      await loadNotifications();
    } catch (error) {
      toast.error(error.message || 'Unable to delete notification');
    }
  }

  function toggleModuleGroup(key) {
    setExpandedModules((current) => ({
      ...current,
      [key]: !current[key]
    }));
  }

  const columns = [
    {
      key: 'title',
      label: 'Notification',
      render: (row) => (
        <NotificationPreview
          item={{
            ...row,
            onOpen: () => navigate(`/app/notifications/${row.id}`)
          }}
        />
      )
    },
    {
      key: 'module',
      label: 'Module',
      render: (row) => (
        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getNotificationTone(row.module, row.type)}`}>
          {getNotificationModuleLabel(row.module)}
        </span>
      )
    },
    {
      key: 'type',
      label: 'Type',
      render: (row) => (
        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getNotificationTone(row.type, row.severity)}`}>
          {getNotificationTypeLabel(row.type)}
        </span>
      )
    },
    {
      key: 'severity',
      label: 'Severity',
      render: (row) => (
        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getNotificationTone(row.severity, row.type)}`}>
          {getNotificationSeverityLabel(row.severity)}
        </span>
      )
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => (
        row.isRead ? (
          <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">Read</span>
        ) : (
          <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">Unread</span>
        )
      )
    },
    {
      key: 'createdAt',
      label: 'Received',
      render: (row) => (
        <div className="text-[12px] text-slate-600">
          <div>{formatNotificationTime(row.createdAt)}</div>
          <div className="text-slate-400">{new Date(row.createdAt).toLocaleString()}</div>
        </div>
      )
    },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-1">
          {!row.isRead ? (
            <button
              type="button"
              onClick={() => handleMarkRead(row.id)}
              className="rounded-full p-2 text-slate-400 transition hover:bg-blue-50 hover:text-blue-600"
              title="Mark as read"
            >
              <CheckCheck size={16} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => navigate(`/app/notifications/${row.id}`)}
            className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
            title="Open"
          >
            <RefreshCw size={16} />
          </button>
          <button
            type="button"
            onClick={() => handleDelete(row.id)}
            className="rounded-full p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
            title="Delete"
          >
            <Trash2 size={16} />
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Alerts"
        title="Notifications"
        description="Banking shell ke saare auto alerts, manual notices, aur email-triggered updates yahan inbox style me dikhte hain."
        meta={(
          <div className="flex flex-wrap gap-2 text-[12px]">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-semibold text-slate-600">Total {meta.total}</span>
            <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 font-semibold text-blue-700">Unread {meta.unreadCount}</span>
          </div>
        )}
        actions={[
          {
            label: unreadOnly ? 'Showing unread' : 'Show unread only',
            variant: unreadOnly ? 'primary' : 'outline',
            icon: Filter,
            onClick: () => {
              setUnreadOnly((current) => !current);
              setPage(1);
            }
          },
          {
            label: 'Mark all read',
            variant: 'outline',
            icon: CheckCheck,
            onClick: handleMarkAllRead
          },
          {
            label: 'Refresh',
            variant: 'outline',
            icon: RefreshCw,
            onClick: refreshList
          }
        ]}
      />

      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: 'Unread', value: summary.unread, tone: 'border-blue-100 bg-blue-50 text-blue-700' },
          { label: 'Critical', value: summary.critical, tone: 'border-rose-100 bg-rose-50 text-rose-700' },
          { label: 'Security', value: summary.security, tone: 'border-violet-100 bg-violet-50 text-violet-700' },
          { label: 'Loaded', value: loading ? '...' : items.length, tone: 'border-slate-200 bg-slate-50 text-slate-700' }
        ].map((item) => (
          <Card key={item.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${item.tone}`}>
              {item.label}
            </div>
            <div className="mt-3 text-3xl font-semibold text-slate-900">{item.value}</div>
            <p className="mt-1 text-sm text-slate-500">Auto alerts and inbox entries.</p>
          </Card>
        ))}
      </div>

      <Card className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {quickFilters.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={chip.onClick}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[12px] font-semibold transition ${
                chip.active
                  ? 'border-blue-200 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
              }`}
            >
              {chip.label}
              {chip.label === 'Unread' ? <span className="h-2 w-2 rounded-full bg-blue-500" /> : null}
            </button>
          ))}
        </div>
      </Card>

      <Card className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-600">Module collapse</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">Group-wise notification view</h3>
            <p className="mt-1 text-sm text-slate-500">Har module alag accordion me khul sakta hai, taaki master, transaction, settings, aur reports ko quickly scan kar sako.</p>
          </div>
          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[12px] font-semibold text-slate-600">
            {groupedNotifications.length} module groups
          </span>
        </div>

        <div className="mt-4 space-y-3">
          {groupedNotifications.map((group) => {
            const firstItem = group.items[0] || { module: group.key, type: 'info' };
            const isExpanded = Boolean(expandedModules[group.key]);

            return (
              <div key={group.key} className="overflow-hidden rounded-2xl border border-slate-100">
                <button
                  type="button"
                  onClick={() => toggleModuleGroup(group.key)}
                  className="flex w-full items-center justify-between gap-4 bg-slate-50/70 px-4 py-3 text-left transition hover:bg-slate-50"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${getNotificationAccentTone(firstItem)}`}>
                      <NotificationIcon item={firstItem} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{group.label}</p>
                      <p className="text-[12px] text-slate-500">
                        {group.items.length} notifications
                        {' · '}
                        {group.unreadCount} unread
                      </p>
                    </div>
                  </div>
                  <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </button>

                {isExpanded ? (
                  <div className="border-t border-slate-100 bg-white p-4">
                    <div className="space-y-3">
                      {group.items.slice(0, 3).map((item) => (
                        <div key={item.id} className="rounded-2xl border border-slate-100 bg-slate-50/40 p-3">
                          <NotificationPreview
                            compact
                            item={{
                              ...item,
                              onOpen: () => navigate(`/app/notifications/${item.id}`)
                            }}
                          />
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setModuleFilter(group.key);
                          setPage(1);
                        }}
                      >
                        Filter {group.label}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate('/app/notifications')}
                      >
                        Open inbox
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {modulePills.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => {
              setModuleFilter(item.key);
              setPage(1);
            }}
            className="text-left"
          >
            <Card className={`rounded-2xl border p-4 shadow-sm transition ${moduleFilter === item.key ? 'border-blue-200 bg-blue-50/60' : 'border-slate-200 bg-white hover:-translate-y-0.5 hover:shadow-md'}`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{item.value}</p>
                </div>
                <span className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${moduleFilter === item.key ? 'border-blue-200 bg-white text-blue-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                  Filter
                </span>
              </div>
            </Card>
          </button>
        ))}
      </div>

      <Card className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <div className="relative md:col-span-2">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search notifications..."
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 pl-9 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-1 lg:grid-cols-3">
            <select
              value={moduleFilter}
              onChange={(event) => {
                setModuleFilter(event.target.value);
                setPage(1);
              }}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-[13px] text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {NOTIFICATION_MODULE_OPTIONS.map((item) => (
                <option key={item.value || 'all-modules'} value={item.value}>{item.label}</option>
              ))}
            </select>

            <select
              value={typeFilter}
              onChange={(event) => {
                setTypeFilter(event.target.value);
                setPage(1);
              }}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-[13px] text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {NOTIFICATION_TYPE_OPTIONS.map((item) => (
                <option key={item.value || 'all-types'} value={item.value}>{item.label}</option>
              ))}
            </select>

            <select
              value={severityFilter}
              onChange={(event) => {
                setSeverityFilter(event.target.value);
                setPage(1);
              }}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-[13px] text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {NOTIFICATION_SEVERITY_OPTIONS.map((item) => (
                <option key={item.value || 'all-severity'} value={item.value}>{item.label}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex h-40 items-center justify-center text-sm text-slate-500">Loading notifications...</div>
        ) : (
          <Table
            columns={columns}
            data={items}
            defaultRowsPerPage={limit}
            emptyMessage="No notifications found."
            headerActions={(
              <Button type="button" variant="outline" className="gap-2" onClick={handleMarkAllRead}>
                <CheckCheck size={16} />
                Mark all read
              </Button>
            )}
            serverPagination={{
              page,
              total: meta.total,
              limit,
              onPageChange: setPage,
              onLimitChange: (nextLimit) => {
                setLimit(nextLimit);
                setPage(1);
              }
            }}
          />
        )}
      </Card>
    </div>
  );
}

export default NotificationsPage;
