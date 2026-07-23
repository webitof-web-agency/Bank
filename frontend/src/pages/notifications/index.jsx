import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  BellRing,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  Filter,
  Folder,
  Landmark,
  RefreshCw,
  Search,
  Settings2,
  ShieldAlert,
  Trash2,
  UserRound,
  Plus
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../api/api';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Select } from '../../components/ui/Select';
import { PageHeader } from '../../components/ui/PageHeader';
import { Table } from '../../components/ui/Table';
import { CreateNotificationModal } from './CreateNotificationModal';
import { FilterSettingsModal } from './FilterSettingsModal';
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
  const inboxRef = useRef(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);

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
      { key: '', label: 'All', value: meta.total, icon: BellRing, bg: 'bg-blue-50', color: 'text-blue-600' },
      { key: 'master', label: 'Master', value: summary.moduleCounts.master || 0, icon: FileText, bg: 'bg-slate-100', color: 'text-slate-600' },
      { key: 'banking', label: 'Banking', value: summary.moduleCounts.banking || 0, icon: Landmark, bg: 'bg-emerald-50', color: 'text-emerald-600' },
      { key: 'transaction', label: 'Transaction', value: summary.moduleCounts.transaction || 0, icon: Landmark, bg: 'bg-amber-50', color: 'text-amber-600' },
      { key: 'settings', label: 'Settings', value: summary.moduleCounts.settings || 0, icon: Settings2, bg: 'bg-slate-100', color: 'text-slate-600' },
      { key: 'reports', label: 'Reports', value: summary.moduleCounts.reports || 0, icon: FileText, bg: 'bg-violet-50', color: 'text-violet-600' },
      { key: 'auth', label: 'Auth', value: summary.moduleCounts.auth || 0, icon: UserRound, bg: 'bg-rose-50', color: 'text-rose-600' },
      { key: 'files', label: 'Files', value: summary.moduleCounts.files || 0, icon: Folder, bg: 'bg-orange-50', color: 'text-orange-600' }
    ];
    return base;
  }, [meta.total, summary.moduleCounts]);

  const quickFilters = [
    {
      label: 'All',
      active: !unreadOnly,
      onClick: () => {
        setUnreadOnly(false);
        setPage(1);
      }
    },
    { label: 'Unread', active: unreadOnly, onClick: () => { setUnreadOnly((current) => !current); setPage(1); } },
    {
      label: 'Reset',
      active: Boolean(search || moduleFilter || typeFilter || severityFilter || unreadOnly),
      onClick: () => {
        setSearch('');
        setUnreadOnly(false);
        setModuleFilter('');
        setTypeFilter('');
        setSeverityFilter('');
        setPage(1);
      }
    }
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

  async function handleCreateNotification(payload) {
    setCreating(true);
    try {
      const response = await api.notifications.create(token, payload);
      const createdCount = Array.isArray(response.data?.notifications) ? response.data.notifications.length : 0;
      if (!createdCount) {
        throw new Error('No matching recipients found');
      }
      toast.success(`${createdCount} notification${createdCount === 1 ? '' : 's'} created`);
      setCreateOpen(false);
      notifyNotificationsChanged();
      await loadNotifications();
    } catch (error) {
      toast.error(error.message || 'Unable to create notification');
    } finally {
      setCreating(false);
    }
  }

  function applyFilterDraft(draft = {}) {
    setSearch(String(draft.search || ''));
    setModuleFilter(String(draft.module || ''));
    setTypeFilter(String(draft.type || ''));
    setSeverityFilter(String(draft.severity || ''));
    setUnreadOnly(Boolean(draft.unreadOnly));
    setPage(1);
    setFilterOpen(false);
  }

  function resetFilters() {
    setSearch('');
    setModuleFilter('');
    setTypeFilter('');
    setSeverityFilter('');
    setUnreadOnly(false);
    setPage(1);
  }

  function openInbox() {
    resetFilters();
    setTimeout(() => {
      inboxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
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
        title="Notifications"
        meta={(
          <div className="flex flex-wrap gap-2 text-[12px]">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-semibold text-slate-600">Total {meta.total}</span>
            <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 font-semibold text-blue-700">Unread {meta.unreadCount}</span>
          </div>
        )}
        actions={[
          {
            label: 'Create Notification',
            variant: 'primary',
            icon: Plus,
            onClick: () => setCreateOpen(true)
          },
          {
            label: 'Mark all read',
            variant: 'outline',
            icon: CheckCheck,
            onClick: handleMarkAllRead
          }
        ]}
      />

      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: 'Unread', value: summary.unread, bg: 'bg-blue-50', color: 'text-blue-500', icon: BellRing, subLabel: 'Unread notifications requiring attention' },
          { label: 'Critical', value: summary.critical, bg: 'bg-emerald-50', color: 'text-emerald-500', icon: ShieldAlert, subLabel: 'Critical system alerts and failures' },
          { label: 'Security', value: summary.security, bg: 'bg-rose-50', color: 'text-rose-500', icon: UserRound, subLabel: 'Security-related warnings' },
          { label: 'Loaded', value: loading ? '...' : items.length, bg: 'bg-purple-50', color: 'text-purple-500', icon: CheckCheck, subLabel: 'Total notifications loaded' }
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className={`flex h-12 w-12 items-center justify-center rounded-full ${item.bg} ${item.color}`}>
                <Icon size={22} strokeWidth={1.5} />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{item.label}</p>
                <p className="text-xl font-bold text-slate-900">{item.value}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{item.subLabel}</p>
              </div>
            </Card>
          );
        })}
      </div>



      <div className="flex items-center gap-6 border-b border-slate-200 px-1">
        {quickFilters.map((chip) => (
          <button
            key={chip.label}
            type="button"
            onClick={chip.onClick}
            className={`inline-flex items-center gap-2 border-b-2 py-3 text-[13px] font-semibold transition-colors -mb-px ${
              chip.active
                ? 'border-[var(--primary)] text-[var(--primary)]'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-900'
            }`}
          >
            {chip.label}
            {chip.label === 'Unread' ? <span className={`h-2 w-2 rounded-full ${chip.active ? 'bg-[var(--primary)]' : 'bg-slate-300'}`} /> : null}
          </button>
        ))}
      </div>

      <Card className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-button,12px)] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary,#1661F6)]">
              <Folder size={18} />
            </span>
            <h3 className="text-lg font-bold text-slate-900">Group-wise notification view</h3>
          </div>
          <button type="button" onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-1.5 rounded-[var(--radius-button,1rem)] border border-[var(--primary)] px-3 py-1.5 text-[12px] font-semibold text-[var(--primary)] transition-colors">
            <Plus size={14} />
            Create Notification
          </button>
        </div>

        <div className="mt-5 flex flex-col">
          {groupedNotifications.map((group, index) => {
            const firstItem = group.items[0] || { module: group.key, type: 'info' };
            const desc = group.key === 'settings' ? 'System and application settings' 
                         : group.key === 'updates' ? 'System updates and maintenance' 
                         : group.key === 'security' ? 'Security related warnings and alerts'
                         : group.key === 'master' ? 'Master data changes and updates'
                         : group.key === 'banking' ? 'Banking and ledger updates'
                         : group.key === 'transaction' ? 'Transactions and voucher alerts'
                         : group.key === 'reports' ? 'Report generation and schedules'
                         : group.key === 'auth' ? 'Authentication and access alerts'
                         : group.key === 'files' ? 'File system and storage notices'
                         : `${group.label} notifications`;
            return (
              <button
                key={group.key}
                type="button"
                onClick={() => {
                  setModuleFilter(group.key);
                  setPage(1);
                }}
                className={`group flex items-center justify-between py-4 text-left transition-colors ${index !== groupedNotifications.length - 1 ? 'border-b border-slate-100' : ''}`}
              >
                <div className="flex items-center gap-4">
                  <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-transparent ${getNotificationAccentTone(firstItem).replace(/border-[a-z]+-\\d+/, '')}`}>
                    <NotificationIcon item={firstItem} />
                  </span>
                  <div>
                    <p className="text-[13px] font-bold text-slate-900">{group.label}</p>
                    <p className="mt-0.5 text-[11.5px] font-medium text-slate-500">{desc}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[11.5px] font-semibold text-slate-500">{group.items.length} Notifications</span>
                  <ChevronRight size={16} className="text-slate-400 group-hover:text-slate-600 transition-colors" />
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button type="button" onClick={() => setFilterOpen(true)} className="inline-flex items-center gap-2 rounded-[var(--radius-button,1rem)] border border-slate-200 px-3 py-1.5 text-[12px] font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900">
            <Filter size={14} />
            Filter Settings
          </button>
          <button type="button" onClick={openInbox} className="inline-flex items-center gap-2 rounded-[var(--radius-button,1rem)] border border-slate-200 px-3 py-1.5 text-[12px] font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900">
            <Folder size={14} />
            Open Inbox
          </button>
        </div>
      </Card>

      <div className="flex items-center gap-6 border-b border-slate-200 px-1 overflow-x-auto hide-scrollbar">
        {modulePills.map((item) => {
          const isActive = moduleFilter === item.key;
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => {
                setModuleFilter(item.key);
                setPage(1);
              }}
              className={`inline-flex items-center gap-2 border-b-2 py-3 text-[13px] font-semibold transition-colors -mb-px whitespace-nowrap ${
                isActive
                  ? 'border-[var(--primary)] text-[var(--primary)]'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-900'
              }`}
            >
              {item.label}
              <span className={`rounded-full px-2 py-0.5 text-[10px] ${isActive ? 'bg-[var(--primary)]/10 text-[var(--primary)]' : 'bg-slate-100 text-slate-500'}`}>
                {item.value}
              </span>
            </button>
          );
        })}
      </div>

      <div ref={inboxRef}>
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
              className="h-9 w-full rounded-[var(--radius-input,0.75rem)] border border-slate-200 bg-white px-3 pl-9 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)] transition-colors"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-1 lg:grid-cols-3">
            <Select
              value={moduleFilter}
              onChange={(value) => {
                setModuleFilter(value);
                setPage(1);
              }}
              size="sm"
              options={NOTIFICATION_MODULE_OPTIONS}
            />

            <Select
              value={typeFilter}
              onChange={(value) => {
                setTypeFilter(value);
                setPage(1);
              }}
              size="sm"
              options={NOTIFICATION_TYPE_OPTIONS}
            />

            <Select
              value={severityFilter}
              onChange={(value) => {
                setSeverityFilter(value);
                setPage(1);
              }}
              size="sm"
              options={NOTIFICATION_SEVERITY_OPTIONS}
            />
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

      <CreateNotificationModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={handleCreateNotification}
        saving={creating}
      />

      <FilterSettingsModal
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        value={{
          search,
          module: moduleFilter,
          type: typeFilter,
          severity: severityFilter,
          unreadOnly
        }}
        onApply={applyFilterDraft}
        onReset={() => {
          resetFilters();
          setFilterOpen(false);
        }}
      />
    </div>
  );
}

export default NotificationsPage;
