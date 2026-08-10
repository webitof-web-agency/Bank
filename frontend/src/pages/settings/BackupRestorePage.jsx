import { useState } from 'react';
import { Download, Upload, RefreshCcw, HardDrive } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';

export function BackupRestorePage() {
  const [fileName, setFileName] = useState('');

  function handleBackup() {
    toast.info('Backup endpoint is not wired in the current backend.');
  }

  function handleRestore() {
    if (!fileName) {
      toast.error('Restore file select karo');
      return;
    }
    toast.info('Restore endpoint is not wired in the current backend.');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Backup & Restore</h1>
        <p className="mt-1 text-sm text-slate-500">Prototype navigation ke liye page added hai. Backend hook baad me attach kar sakte hain.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary,#1661F6)]"><Download size={20} /></div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Backup Database</h2>
              <p className="text-[13px] text-slate-500">Current app me direct backup route abhi available nahi hai.</p>
            </div>
          </div>
          <Button type="button" onClick={handleBackup} className="gap-2">
            <HardDrive size={16} />
            Download Backup
          </Button>
        </Card>

        <Card className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-[var(--primary,#1661F6)]"><Upload size={20} /></div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Restore Database</h2>
              <p className="text-[13px] text-slate-500">SQL / backup file select karke restore flow later connect ho sakta hai.</p>
            </div>
          </div>
          <div className="space-y-3">
            <input type="file" accept=".sql,.zip,.bak" onChange={(event) => setFileName(event.target.files?.[0]?.name || '')} className="block w-full text-[13px] text-slate-600" />
            <div className="text-[12px] text-slate-500">Selected: {fileName || 'No file selected'}</div>
            <Button type="button" onClick={handleRestore} className="gap-2">
              <RefreshCcw size={16} />
              Restore Backup
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default BackupRestorePage;
