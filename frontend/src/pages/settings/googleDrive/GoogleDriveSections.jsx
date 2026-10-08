import { CheckCircle2, CircleAlert, CloudUpload, Download, ExternalLink, FolderOpen, Link2, Link2Off, RefreshCw, XCircle } from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Table } from '../../../components/ui/Table';
import { describeConnection, describeLastBackup, formatBytes, formatIstDateTime } from './googleDriveUtils';

// Presentational parts of Settings -> Google Drive: props in, markup out.
// Nothing here receives a token or the OAuth client secret.

const TONE = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  error: 'border-rose-200 bg-rose-50 text-rose-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  info: 'border-blue-200 bg-blue-50 text-blue-800',
  muted: 'border-slate-200 bg-slate-50 text-slate-600'
};

function StatusLine({ tone, label, detail }) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'error' ? XCircle : CircleAlert;
  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${TONE[tone] || TONE.muted}`}>
      <Icon size={18} className="mt-0.5 shrink-0" />
      <div>
        <div className="text-[14px] font-semibold">{label}</div>
        {detail ? <div className="mt-0.5 text-[13px]">{detail}</div> : null}
      </div>
    </div>
  );
}

function FolderLink({ label, folder }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</div>
      {folder?.id ? (
        <a href={folder.link} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1.5 text-[14px] font-medium text-blue-700 hover:underline">
          <FolderOpen size={15} /> {folder.name || 'Open folder'} <ExternalLink size={13} />
        </a>
      ) : <div className="mt-1 text-[14px] text-slate-400">Created when connected</div>}
    </div>
  );
}

export function DriveConnectionCard({ drive, canWrite = false, busy = false, usedForUploads = false, onConnect, onDisconnect }) {
  const state = describeConnection(drive);
  const connected = Boolean(drive?.connected);
  return (
    <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Google Drive connection</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            One Google account holds the backups and, if chosen under Storage Providers, uploaded files. The app can only see
            the folders it creates, nothing else in that Drive.
          </p>
        </div>
        {canWrite ? (
          <div className="flex gap-2">
            {(!connected || drive?.needsReconnect) ? (
              <Button type="button" onClick={onConnect} disabled={busy || !drive?.configured}>
                <Link2 size={16} /> {drive?.needsReconnect ? 'Reconnect Google Drive' : 'Connect Google Drive'}
              </Button>
            ) : null}
            {connected ? (
              <Button type="button" variant="outline" onClick={onDisconnect} disabled={busy || usedForUploads} title={usedForUploads ? 'Switch uploads to another storage provider first' : 'Disconnect'}>
                <Link2Off size={16} /> Disconnect
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mt-4 space-y-3">
        <StatusLine {...state} />
        {drive && !drive.configured ? (
          <p className="text-[13px] text-slate-600">
            Set these in the backend <code>.env</code> and restart. In Google Cloud Console, add this exact address under the OAuth
            client&apos;s &quot;Authorized redirect URIs&quot;: <code className="break-all">{drive.redirectUri}</code>
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <FolderLink label="Database backups folder" folder={drive?.backupFolder} />
          <FolderLink label="Uploads folder" folder={drive?.uploadsFolder} />
        </div>
        {connected ? (
          <p className="text-[13px] text-slate-500">
            Uploads: {usedForUploads ? 'new images and files are stored in Google Drive.' : 'still stored by the current provider. Choose Google Drive under Settings → Storage Providers to store new uploads here.'}
          </p>
        ) : null}
      </div>
    </Card>
  );
}

export function DriveBackupsCard({ backup, backups = [], connected = false, canWrite = false, starting = false, onBackupNow, onDownload, onRefresh }) {
  const last = describeLastBackup(backup?.last);
  const running = Boolean(backup?.running);
  const columns = [
    { key: 'name', label: 'Backup', render: (row) => <span className="font-mono text-[12px] text-slate-700">{row.name}</span> },
    { key: 'createdTime', label: 'Created', dateOnly: false, render: (row) => <span className="whitespace-nowrap">{formatIstDateTime(row.createdTime)}</span> },
    { key: 'size', label: 'Size', align: 'right', render: (row) => formatBytes(row.size) },
    { key: 'action', label: 'Action', render: (row) => (
      <Button type="button" variant="outline" size="sm" disabled={!canWrite} onClick={() => onDownload?.(row)} title={canWrite ? 'Download' : 'Needs settings.write'}>
        <Download size={14} /> Download
      </Button>
    ) }
  ];
  return (
    <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Database backups</h2>
          <p className="mt-1 text-sm text-slate-500">
            {backup?.schedule?.label || 'Daily'} · the newest {backup?.keep || 7} are kept in Drive, older ones are deleted automatically.
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onRefresh}><RefreshCw size={16} className={running ? 'animate-spin' : ''} /> Refresh</Button>
          {canWrite ? (
            <Button type="button" onClick={onBackupNow} disabled={!connected || running || starting}>
              <CloudUpload size={16} /> {running ? 'Backing up…' : 'Back up now'}
            </Button>
          ) : null}
        </div>
      </div>
      <div className="mt-4 space-y-4">
        <StatusLine {...last} tone={running ? 'info' : last.tone} label={running ? 'Backing up…' : last.label} />
        <Table columns={columns} data={backups.map((row) => ({ ...row, id: row.id }))} emptyMessage={connected ? 'No backups in Drive yet' : 'Connect Google Drive to see backups'} />
      </div>
    </Card>
  );
}
