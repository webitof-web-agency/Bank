import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  BellRing,
  CheckCheck,
  CheckCircle2,
  ExternalLink,
  FileText,
  Folder,
  Landmark,
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
import {
  formatNotificationDateTime,
  formatNotificationTime,
  getNotificationIconKind,
  getNotificationModuleLabel,
  getNotificationNavigationMeta,
  getNotificationSeverityLabel,
  getNotificationTone,
  getNotificationTypeLabel,
  notifyNotificationsChanged
} from './notificationUtils';

function MetaRow({ label, value, mono = false }) {
  return (
    <div className="grid gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className={`text-sm font-medium text-slate-900 ${mono ? 'font-mono break-all text-[13px]' : ''}`}>{value || '-'}</p>
    </div>
  );
}

function NotificationIcon({ item, size = 20 }) {
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

export function NotificationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const [notification, setNotification] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const isUnread = Boolean(notification && !notification.isRead);

  const payloadPreview = useMemo(() => {
    if (!notification?.payload || typeof notification.payload !== 'object') return '';
    try {
      return JSON.stringify(notification.payload, null, 2);
    } catch {
      return '';
    }
  }, [notification]);

  const navigationMeta = useMemo(() => getNotificationNavigationMeta(notification || {}), [notification]);

  const relatedShortcuts = useMemo(() => {
    const shortcuts = [];

    if (navigationMeta.path && navigationMeta.path !== '/app/notifications') {
      shortcuts.push({
        label: navigationMeta.label,
        path: navigationMeta.path,
        icon: ExternalLink,
        tone: 'border-blue-100 bg-blue-50 text-blue-700'
      });
    }

    if (navigationMeta.modulePath && navigationMeta.modulePath !== navigationMeta.path) {
      shortcuts.push({
        label: `Open ${navigationMeta.moduleLabel} hub`,
        path: navigationMeta.modulePath,
        icon: Folder,
        tone: 'border-slate-200 bg-slate-50 text-slate-700'
      });
    }

    shortcuts.push({
      label: 'Open notifications inbox',
      path: '/app/notifications',
      icon: BellRing,
      tone: 'border-violet-100 bg-violet-50 text-violet-700'
    });

    return shortcuts;
  }, [navigationMeta]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const response = await api.notifications.get(token, id);
        if (!mounted) return;
        setNotification(response.data || null);
      } catch (error) {
        if (!mounted) return;
        toast.error(error.message || 'Unable to load notification');
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [id, token]);

  useEffect(() => {
    if (!notification || notification.isRead) return undefined;
    let mounted = true;

    (async () => {
      try {
        setSaving(true);
        const response = await api.notifications.markRead(token, notification.id);
        if (!mounted) return;
        setNotification(response.data || notification);
        notifyNotificationsChanged();
      } catch {
        // Silent: detail still opens even if auto-mark fails.
      } finally {
        if (mounted) setSaving(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [notification, token]);

  async function handleMarkRead() {
    if (!notification) return;
    try {
      setSaving(true);
      const response = await api.notifications.markRead(token, notification.id);
      setNotification(response.data || notification);
      notifyNotificationsChanged();
      toast.success('Marked as read');
    } catch (error) {
      toast.error(error.message || 'Unable to mark notification');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!notification) return;
    if (!window.confirm('Delete this notification?')) return;

    try {
      setSaving(true);
      await api.notifications.remove(token, notification.id);
      notifyNotificationsChanged();
      toast.success('Notification deleted');
      navigate('/app/notifications');
    } catch (error) {
      toast.error(error.message || 'Unable to delete notification');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
      </div>
    );
  }

  if (!notification) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
        Notification not found
      </div>
    );
  }

  const tone = getNotificationTone(notification.type, notification.severity);
  const actionUrl = notification.actionUrl || '';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-[13px] font-medium text-slate-500">
        <button type="button" onClick={() => navigate('/app/notifications')} className="flex items-center gap-1.5 transition-colors hover:text-slate-900">
          <ArrowLeft size={14} /> Back
        </button>
        <span className="text-slate-300">/</span>
        <span className="text-slate-900">Notification Detail</span>
      </div>

      <PageHeader
        eyebrow="Alerts"
        title={notification.title || 'Notification'}
        description={notification.message || 'Notification details'}
        meta={(
          <div className="flex flex-wrap gap-2 text-[12px]">
            <span className={`inline-flex rounded-full border px-3 py-1 font-semibold ${tone}`}>
              {getNotificationModuleLabel(notification.module)}
            </span>
            <span className={`inline-flex rounded-full border px-3 py-1 font-semibold ${tone}`}>
              {getNotificationTypeLabel(notification.type)}
            </span>
            <span className={`inline-flex rounded-full border px-3 py-1 font-semibold ${getNotificationTone(notification.severity, notification.type)}`}>
              {getNotificationSeverityLabel(notification.severity)}
            </span>
            {isUnread ? (
              <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 font-semibold text-blue-700">Unread</span>
            ) : (
              <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-semibold text-emerald-700">Read</span>
            )}
          </div>
        )}
        actions={[
          ...(actionUrl ? [{
            label: 'Open source',
            variant: 'outline',
            icon: ExternalLink,
            onClick: () => window.open(actionUrl, '_blank', 'noopener,noreferrer')
          }] : []),
          ...(isUnread ? [{
            label: 'Mark read',
            variant: 'outline',
            icon: CheckCheck,
            onClick: handleMarkRead
          }] : []),
          {
            label: 'Delete',
            variant: 'destructive',
            icon: Trash2,
            onClick: handleDelete
          }
        ]}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${tone}`}>
              <NotificationIcon item={notification} />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Status</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{notification.isRead ? 'Read' : 'Unread'}</p>
            </div>
          </div>
        </Card>
        <Card className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Received</p>
          <p className="mt-2 text-lg font-semibold text-slate-900">{formatNotificationTime(notification.createdAt)}</p>
          <p className="mt-1 text-sm text-slate-500">{formatNotificationDateTime(notification.createdAt)}</p>
        </Card>
        <Card className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Read at</p>
          <p className="mt-2 text-lg font-semibold text-slate-900">{formatNotificationTime(notification.readAt)}</p>
          <p className="mt-1 text-sm text-slate-500">{formatNotificationDateTime(notification.readAt)}</p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
        <Card className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Message</h2>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-600">
            {notification.message || 'No message provided.'}
          </p>

          {actionUrl ? (
            <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">Action URL</p>
              <div className="mt-2 flex items-center justify-between gap-4">
                <a href={actionUrl} target="_blank" rel="noreferrer" className="break-all text-sm font-medium text-blue-700 underline-offset-4 hover:underline">
                  {actionUrl}
                </a>
                <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => window.open(actionUrl, '_blank', 'noopener,noreferrer')}>
                  <ExternalLink size={14} />
                  Open
                </Button>
              </div>
            </div>
          ) : null}

          {payloadPreview ? (
            <div className="mt-6">
              <h3 className="text-base font-semibold text-slate-900">Payload</h3>
              <pre className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-950 p-4 text-[12px] leading-6 text-slate-100">
                {payloadPreview}
              </pre>
            </div>
          ) : null}
        </Card>

        <div className="space-y-6">
          <Card className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Details</h2>
            <div className="mt-4 grid gap-3">
              <MetaRow label="Notification ID" value={notification.id} mono />
              <MetaRow label="Module" value={notification.module || 'system'} />
              <MetaRow label="Type" value={notification.type || 'info'} />
              <MetaRow label="Severity" value={notification.severity || 'medium'} />
              <MetaRow label="Action" value={notification.action || '-'} />
              <MetaRow label="Entity Type" value={notification.entityType || '-'} />
              <MetaRow label="Entity ID" value={notification.entityId || '-'} mono />
              <MetaRow label="Entity Code" value={notification.entityCode || '-'} />
              <MetaRow label="Audience" value={notification.audience || '-'} />
              <MetaRow label="Email Sent" value={notification.emailSent ? 'Yes' : 'No'} />
              <MetaRow label="Email To" value={notification.emailTo || '-'} mono />
              <MetaRow label="Read By" value={notification.readByUserId || '-'} mono />
            </div>
          </Card>

          <Card className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Related shortcuts</h2>
            <p className="mt-1 text-sm text-slate-500">Direct links jahan se notification aayi thi ya jahan user ko jump karna chahiye.</p>

            <div className="mt-4 space-y-2">
              {relatedShortcuts.map((shortcut) => {
                const ShortcutIcon = shortcut.icon;

                return (
                  <button
                    key={shortcut.label}
                    type="button"
                    onClick={() => navigate(shortcut.path)}
                    className="flex w-full items-center justify-between gap-4 rounded-2xl border border-slate-100 px-4 py-3 text-left transition hover:border-blue-200 hover:bg-blue-50/60"
                  >
                    <span className="flex items-center gap-3">
                      <span className={`flex h-10 w-10 items-center justify-center rounded-2xl border ${shortcut.tone}`}>
                        <ShortcutIcon size={16} strokeWidth={1.85} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-900">{shortcut.label}</span>
                        <span className="mt-0.5 block text-[12px] text-slate-500">{shortcut.path}</span>
                      </span>
                    </span>
                    <ExternalLink size={15} className="shrink-0 text-slate-400" />
                  </button>
                );
              })}
            </div>
          </Card>
        </div>
      </div>

      {saving ? (
        <div className="fixed bottom-5 right-5 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-lg">
          Updating notification...
        </div>
      ) : null}
    </div>
  );
}

export default NotificationDetailPage;
