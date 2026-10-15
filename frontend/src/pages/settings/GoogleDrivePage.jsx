import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api } from '../../api/api';
import { useAuth } from '../../context/AuthContext';
import { Card } from '../../components/ui/Card';
import { ConfirmDialog } from '../../components/overlays/ConfirmDialog';
import { DriveBackupsCard, DriveConnectionCard } from './googleDrive/GoogleDriveSections';
import { backupFileName, readConnectResult } from './googleDrive/googleDriveUtils';

// The Google Drive section of Settings -> Storage Providers: connect a Google
// account (Gmail sign-in), daily database backups to Drive with the newest 7
// kept. A manual backup is a download to this computer (Settings -> Backup).
// `onStatus` receives the status after every load (connected or not).
export function GoogleDrivePanel({ onStatus }) {
  const { token, hasPermission } = useAuth();
  const canWrite = hasPermission('settings.write');
  const location = useLocation();
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [startingBackup, setStartingBackup] = useState(false);
  const [downloadingId, setDownloadingId] = useState('');
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const [statusResponse, backupsResponse] = await Promise.all([
        api.googleDrive.status(token),
        api.googleDrive.listBackups(token).catch(() => ({ data: [] }))
      ]);
      setStatus(statusResponse.data || null);
      onStatus?.(statusResponse.data || null);
      setBackups(backupsResponse.data || []);
    } catch (error) {
      toast.error(error.message || 'Unable to load Google Drive settings');
    } finally {
      setLoading(false);
    }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

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

  async function handleBackupNow() {
    setStartingBackup(true);
    try {
      await api.googleDrive.runBackup(token);
      toast.message('Backup started. This page updates when it finishes.');
      await load();
    } catch (error) {
      toast.error(error.message || 'Unable to start the backup');
    } finally {
      setStartingBackup(false);
    }
  }

  // The file comes Drive -> server -> browser, so it takes a few seconds:
  // the row shows "Downloading..." until the browser has it.
  async function handleDownload(row) {
    if (downloadingId) return;
    setDownloadingId(row.id);
    try {
      const blob = await api.googleDrive.downloadBackup(token, row.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = backupFileName(row.name);
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Revoking at once can cancel the save in some browsers.
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      toast.success('Backup downloaded.');
    } catch (error) {
      toast.error(error.message || 'Unable to download the backup');
    } finally {
      setDownloadingId('');
    }
  }

  const drive = status?.drive || null;
  return (
    <div className="space-y-6">

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
            starting={startingBackup}
            downloadingId={downloadingId}
            onDownload={handleDownload}
            onRefresh={load}
            onBackupNow={handleBackupNow}
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

// The old Settings -> Google Drive address now opens Storage Providers.
export function GoogleDrivePage() {
  const location = useLocation();
  return <Navigate to={`/app/settings/storage${location.search}`} replace />;
}

export default GoogleDrivePage;
