import { FileBrowser } from '../../components/ui/FileBrowser';

export function FilesPage() {
  return (
    <div className="space-y-6">
      <div className="mb-2">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">File Manager</h1>
      </div>
      <FileBrowser showSidebar showUpload />
    </div>
  );
}
