import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Folder, FolderPlus, Grid2x2, Image as ImageIcon, List, Search, Trash2, Upload, Pencil, FileText, Check } from 'lucide-react';
import imageCompression from 'browser-image-compression';
import { toast } from 'sonner';
import { api } from '../../api/api';
import { useAuth } from '../../context/AuthContext';
import { Modal } from './Modal';
import { Input } from './Input';
import { cn } from '../../lib/cn';

function getFileIcon(mimeType = '') {
  if (mimeType.startsWith('image/')) return ImageIcon;
  return FileText;
}

function formatSize(bytes = 0) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / (1024 ** index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function FileBrowser({
  onSelectFile,
  allowSelect = false,
  selectable = false,
  selectedIds = [],
  onSelectionChange = () => {},
  onViewFile,
  onUploadComplete,
  refreshTrigger = 0,
  showUpload = true,
  showSidebar = false,
  uploadModule,
  uploadEntityId
}) {
  const { token } = useAuth();
  const fileInputRef = useRef(null);
  const [path, setPath] = useState([{ id: null, name: 'Home' }]);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [loading, setLoading] = useState(false);
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolder, setEditingFolder] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);

  const currentFolder = path[path.length - 1];
  const currentFolderId = currentFolder?.id || null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.files.list(token, { folderId: currentFolderId || '' });
      setFolders(response.data?.folders || []);
      setFiles(response.data?.files || []);
    } catch (error) {
      toast.error(error.message || 'Unable to load files');
    } finally {
      setLoading(false);
    }
  }, [currentFolderId, token]);

  useEffect(() => {
    load();
  }, [load, refreshTrigger]);

  const filteredFolders = useMemo(() => {
    const term = search.trim().toLowerCase();
    return folders.filter((folder) => folder.name.toLowerCase().includes(term));
  }, [folders, search]);

  const filteredFiles = useMemo(() => {
    const term = search.trim().toLowerCase();
    return files.filter((file) => file.originalName.toLowerCase().includes(term));
  }, [files, search]);

  async function handleUpload(event) {
    const selected = Array.from(event.target.files || []);
    if (!selected.length) return;

    try {
      const formData = new FormData();
      for (const file of selected) {
        let uploadFile = file;
        if (file.type.startsWith('image/')) {
          try {
            uploadFile = await imageCompression(file, {
              maxSizeMB: 1,
              maxWidthOrHeight: 1920,
              useWebWorker: true
            });
          } catch {
            // Use the original file if compression fails.
          }
        }
        formData.append('file', uploadFile);
      }
      formData.append('folderId', currentFolderId || '');
      formData.append('moduleName', uploadModule || 'general');
      if (uploadEntityId) formData.append('entityId', uploadEntityId);

      const response = await api.files.upload(token, formData);
      toast.success('Files uploaded');
      await load();
      onUploadComplete?.(response.data || []);
    } catch (error) {
      toast.error(error.message || 'Upload failed');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function submitFolder(event) {
    event.preventDefault();
    const value = newFolderName.trim();
    if (!value) return;
    try {
      await api.files.createFolder(token, {
        name: value,
        parentFolderId: currentFolderId
      });
      toast.success('Folder created');
      setNewFolderOpen(false);
      setNewFolderName('');
      await load();
    } catch (error) {
      toast.error(error.message || 'Unable to create folder');
    }
  }

  async function submitRename(event) {
    event.preventDefault();
    const value = renameValue.trim();
    if (!value || !editingFolder) return;
    try {
      await api.files.renameFolder(token, editingFolder.id, value);
      toast.success('Folder renamed');
      setEditingFolder(null);
      setRenameValue('');
      await load();
    } catch (error) {
      toast.error(error.message || 'Unable to rename folder');
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.originalName) {
        // It's a file
        await api.files.remove(token, deleteTarget.id);
        toast.success('File deleted');
      } else {
        // It's a folder
        await api.files.deleteFolder(token, deleteTarget.id);
        toast.success('Folder deleted');
      }
      setDeleteTarget(null);
      await load();
    } catch (error) {
      toast.error(error.message || 'Unable to delete');
    }
  }

  function openFolder(folder) {
    setPath((current) => [...current, folder]);
    setSearch('');
  }

  function goToBreadcrumb(index) {
    setPath((current) => current.slice(0, index + 1));
    setSearch('');
  }

  return (
    <div className={cn('flex h-full min-h-[640px] overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm', showSidebar ? 'flex-col lg:flex-row' : 'flex-col')}>
      {showSidebar ? (
        <aside className="w-full border-b border-slate-200 bg-slate-50/70 p-4 lg:w-72 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Folders</p>
              <p className="mt-1 text-sm text-slate-500">Navigate the local upload tree</p>
            </div>
            <button
              type="button"
              onClick={() => setNewFolderOpen(true)}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 transition hover:border-[color-mix(in_srgb,var(--primary)_20%,white)] hover:text-slate-900"
            >
              <FolderPlus size={16} />
            </button>
          </div>

          <div className="mt-5 space-y-2">
            {path.map((crumb, index) => (
              <button
                key={crumb.id || 'home'}
                type="button"
                onClick={() => goToBreadcrumb(index)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-sm transition',
                  index === path.length - 1 ? 'bg-[color-mix(in_srgb,var(--primary)_10%,white)] text-[var(--primary)]' : 'text-slate-600 hover:bg-white'
                )}
              >
                <Folder size={16} />
                <span className="truncate">{crumb.name}</span>
              </button>
            ))}
          </div>
        </aside>
      ) : null}

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/60 px-4 py-4 md:px-5">
          <div className="flex min-w-0 items-center gap-2 text-sm text-slate-500">
            {path.map((crumb, index) => (
              <div key={crumb.id || 'home'} className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => goToBreadcrumb(index)}
                  className={cn(
                    'truncate rounded-full px-2 py-1 transition',
                    index === path.length - 1 ? 'font-semibold text-slate-900' : 'hover:bg-white hover:text-slate-900'
                  )}
                >
                  {crumb.name}
                </button>
                {index < path.length - 1 ? <ChevronRight size={14} className="text-slate-300" /> : null}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {showUpload ? (
              <>
                <button
                  type="button"
                  onClick={() => setNewFolderOpen(true)}
                  className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                >
                  <FolderPlus size={16} />
                  Folder
                </button>
                <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleUpload} />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex h-9 items-center gap-2 rounded-full bg-[var(--primary)] px-4 text-sm font-semibold text-white transition hover:opacity-90"
                >
                  <Upload size={16} />
                  Upload
                </button>
              </>
            ) : null}

            <div className="relative min-w-[220px]">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search files..." className="pl-9" />
            </div>

            <div className="inline-flex rounded-full border border-slate-200 bg-white p-1">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={cn('rounded-full p-2 transition', viewMode === 'grid' ? 'bg-slate-100 text-slate-900' : 'text-slate-400')}
              >
                <Grid2x2 size={16} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={cn('rounded-full p-2 transition', viewMode === 'list' ? 'bg-slate-100 text-slate-900' : 'text-slate-400')}
              >
                <List size={16} />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 md:p-5">
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">Folders</h3>
                  <span className="text-xs text-slate-400">{filteredFolders.length} items</span>
                </div>
                {filteredFolders.length ? (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {filteredFolders.map((folder) => (
                      <div key={folder.id} className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--primary)_18%,white)]">
                        <button type="button" onClick={() => openFolder(folder)} className="flex w-full items-start justify-between gap-3 text-left">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--primary)_10%,white)] text-[var(--primary)]">
                              <Folder size={20} />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">{folder.name}</p>
                              <p className="text-xs text-slate-500">Folder</p>
                            </div>
                          </div>
                          <Folder size={16} className="mt-1 text-slate-300" />
                        </button>
                        <div className="mt-3 flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingFolder(folder);
                              setRenameValue(folder.name);
                            }}
                            className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(folder)}
                            className="rounded-full p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/40 p-6 text-sm text-slate-500">No folders here yet.</div>
                )}
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">Files</h3>
                  <span className="text-xs text-slate-400">{filteredFiles.length} items</span>
                </div>
                {viewMode === 'grid' ? (
                  filteredFiles.length ? (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {filteredFiles.map((file) => {
                        const Icon = getFileIcon(file.mimeType);
                        const isSelected = selectedIds.includes(file.id);
                        const preview = file.mimeType?.startsWith('image/') ? file.viewUrl : '';
                        return (
                          <div
                            key={file.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              if (allowSelect) onSelectFile?.(file);
                              else if (selectable) onSelectionChange(isSelected ? selectedIds.filter((id) => id !== file.id) : [...selectedIds, file.id]);
                              else if (onViewFile) onViewFile(file);
                              else window.open(api.files.viewUrl(file.id), '_blank');
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                if (allowSelect) onSelectFile?.(file);
                                else if (selectable) onSelectionChange(isSelected ? selectedIds.filter((id) => id !== file.id) : [...selectedIds, file.id]);
                                else if (onViewFile) onViewFile(file);
                                else window.open(api.files.viewUrl(file.id), '_blank');
                              }
                            }}
                            className={cn(
                              'group relative cursor-pointer overflow-hidden rounded-2xl border bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--primary)_18%,white)]',
                              isSelected ? 'border-[var(--primary)] ring-1 ring-[var(--primary)]' : 'border-slate-200'
                            )}
                          >
                            <div className="flex h-32 items-center justify-center overflow-hidden rounded-xl bg-slate-50">
                              {preview ? (
                                <img src={api.files.viewUrl(file.id)} alt={file.originalName} className="h-full w-full object-cover" />
                              ) : (
                                <Icon size={34} className="text-slate-400" />
                              )}
                            </div>
                            <div className="mt-3 min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">{file.originalName}</p>
                              <p className="text-xs text-slate-500">{formatSize(file.sizeBytes)}</p>
                            </div>
                            {isSelected ? (
                              <div className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--primary)] text-white">
                                <Check size={12} />
                              </div>
                            ) : (
                              <div className="absolute right-3 top-3 opacity-0 transition-opacity group-hover:opacity-100 flex items-center justify-center">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteTarget(file);
                                  }}
                                  className="flex h-7 w-7 items-center justify-center rounded-full bg-white shadow text-slate-400 hover:text-rose-600 transition"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/40 p-6 text-sm text-slate-500">No files uploaded in this folder.</div>
                  )
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-[0.2em] text-slate-400">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Name</th>
                          <th className="px-4 py-3 font-semibold">Size</th>
                          <th className="px-4 py-3 font-semibold">Type</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredFiles.map((file) => {
                          const Icon = getFileIcon(file.mimeType);
                          const isSelected = selectedIds.includes(file.id);
                          return (
                            <tr
                              key={file.id}
                              onClick={() => {
                                if (allowSelect) onSelectFile?.(file);
                                else if (selectable) onSelectionChange(isSelected ? selectedIds.filter((id) => id !== file.id) : [...selectedIds, file.id]);
                                else if (onViewFile) onViewFile(file);
                                else window.open(api.files.viewUrl(file.id), '_blank');
                              }}
                              className={cn('cursor-pointer transition hover:bg-slate-50', isSelected && 'bg-[color-mix(in_srgb,var(--primary)_6%,white)]')}
                            >
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                                    <Icon size={16} />
                                  </span>
                                  <div className="min-w-0">
                                    <p className="truncate font-medium text-slate-900">{file.originalName}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-slate-500">{formatSize(file.sizeBytes)}</td>
                              <td className="px-4 py-3 text-slate-500">{file.mimeType || '-'}</td>
                              <td className="px-4 py-3 text-right">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteTarget(file);
                                  }}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      <Modal open={newFolderOpen} onClose={() => setNewFolderOpen(false)} title="Create Folder">
        <form onSubmit={submitFolder} className="space-y-4">
          <Input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="Folder name" autoFocus />
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setNewFolderOpen(false)} className="rounded-full px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
              Cancel
            </button>
            <button type="submit" className="rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
              Create
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(editingFolder)} onClose={() => setEditingFolder(null)} title="Rename Folder">
        <form onSubmit={submitRename} className="space-y-4">
          <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} placeholder="New name" autoFocus />
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setEditingFolder(null)} className="rounded-full px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
              Cancel
            </button>
            <button type="submit" className="rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
              Save
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title={deleteTarget?.originalName ? 'Delete File' : 'Delete Folder'}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Delete <strong>{deleteTarget?.originalName || deleteTarget?.name}</strong>? {deleteTarget?.originalName ? 'This will permanently remove the file.' : 'This only works when the folder is empty.'}
          </p>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setDeleteTarget(null)} className="rounded-full px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
              Cancel
            </button>
            <button type="button" onClick={confirmDelete} className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
              Delete
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
