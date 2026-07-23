import { FileBrowser } from '../../components/ui/FileBrowser';

export function FilesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">File Manager</h1>
        <p className="mt-1 text-sm text-slate-500">Upload files to local storage, organize them into folders, and preview them from the same interface.</p>
      </div>
      <FileBrowser showSidebar showUpload />
    </div>
  );
}
