import { useState } from 'react';
import { Download, HardDrive } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { api } from '../../api/api';
import { useAuth } from '../../context/AuthContext';

export function BackupRestorePage() {
  const { token, hasPermission } = useAuth();
  const canWrite = hasPermission('settings.write');
  const [downloading, setDownloading] = useState(false);

  // A fresh dump of the whole database, saved on this computer (not Drive).
  async function handleBackup() {
    setDownloading(true);
    try {
      const { blob, name } = await api.backup.downloadLocal(token);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('Backup downloaded.');
    } catch (error) {
      toast.error(error.message || 'Unable to create the backup');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Backup</h1>
        <p className="mt-1 text-sm text-slate-500">Download a full copy of the database to this computer.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary,#1661F6)]"><Download size={20} /></div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Backup Database</h2>
              <p className="text-[13px] text-slate-500">Full database backup (.dump), downloaded to this computer.</p>
            </div>
          </div>
          <Button type="button" onClick={handleBackup} disabled={!canWrite || downloading} title={canWrite ? '' : 'Needs Settings edit permission'} className="gap-2">
            <HardDrive size={16} />
            {downloading ? 'Preparing backup…' : 'Download Backup'}
          </Button>
        </Card>

      </div>
    </div>
  );
}

export default BackupRestorePage;
