import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { HardDrive } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../api/api';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/ui/Card';
import { ConfirmDialog } from '../../components/overlays/ConfirmDialog';
import { DriveBackupsCard, DriveConnectionCard } from './googleDrive/GoogleDriveSections';
import { backupFileName, readConnectResult } from './googleDrive/googleDriveUtils';

// Settings -> Google Drive: connect a Google account (Gmail sign-in), daily
// database backups to Drive with the newest 7 kept. A manual backup is a
// download to this computer (Settings -> Backup & Restore).
export function GoogleDrivePage() {
  const { token, hasPermission } = useAuth();
  const canWrite = hasPermission('settings.write');
  const location = useLocation();
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const [statusResponse, backupsResponse] = await Promise.all([
        api.googleDrive.status(token),
        api.googleDrive.listBackups(token).catch(() => ({ data: [] }))
      ]);
      setStatus(statusResponse.data || null);
      setBackups(backupsResponse.data || []);
    } catch (error) {
      toast.error(error.message || 'Unable to load Google Drive settings');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  // Back from Google: show the outcome once, then clean the address bar.
  useEffect(() => {
    const result = readConnectResult(location.search);
    if (!result) return;
    toast[result.tone](result.message);
    navigate(location.pathname, { replace: true });
  }, [location.pathname, location.search, navigate]);

  // While a backup runs, refresh every 3 seconds until it ends.
  const running = Boolean(status?.backup?.running);
  useEffect(() => {
    if (!running) return undefined;
    pollRef.current = setInterval(load, 3000);
    return () => clearInterval(pollRef.current);
  }, [running, load]);

  async function handleConnect() {
    setBusy(true);
    try {
      const response = await api.googleDrive.connect(token);
      // Google's sign-in page; it returns to this page afterwards.
      window.location.assign(response.data.url);
    } catch (error) {
      toast.error(error.message || 'Unable to start the Google sign-in');
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    setBusy(true);
    try {
      await api.googleDrive.disconnect(token);
      toast.success('Google Drive disconnected. Backups already in Drive stay there.');
      setConfirmDisconnect(false);
      await load();
    } catch (error) {
      toast.error(error.message || 'Unable to disconnect Google Drive');
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload(row) {
    try {
      const blob = await api.googleDrive.downloadBackup(token, row.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = backupFileName(row.name);
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error.message || 'Unable to download the backup');
    }
  }

  const drive = status?.drive || null;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900">
          <HardDrive className="text-emerald-600" /> Google Drive
        </h1>
        <p className="mt-1 text-sm text-slate-500">Daily database backups (latest 7 kept) and file uploads in your Google Drive.</p>
      </div>

      {loading && !status ? (
        <Card className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">Loading Google Drive settings...</Card>
      ) : (
        <>
          <DriveConnectionCard
            drive={drive}
            canWrite={canWrite}
            busy={busy}
            usedForUploads={Boolean(status?.storage?.usedForUploads)}
            onConnect={handleConnect}
            onDisconnect={() => setConfirmDisconnect(true)}
          />
          <DriveBackupsCard
            backup={status?.backup}
            backups={backups}
            connected={Boolean(drive?.connected && !drive?.needsReconnect)}
            canWrite={canWrite}
            onDownload={handleDownload}
            onRefresh={load}
          />
        </>
      )}

      <ConfirmDialog
        open={confirmDisconnect}
        title="Disconnect Google Drive"
        description="Automatic backups stop until you connect again. Backups already in Drive are kept."
        confirmLabel="Disconnect"
        onConfirm={handleDisconnect}
        onCancel={() => setConfirmDisconnect(false)}
      />
    </div>
  );
}

export default GoogleDrivePage;
