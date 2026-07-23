import { useRef } from 'react';
import { Eye, Paperclip, Trash2, Upload } from 'lucide-react';
import { Button } from '../ui/Button';
import { cn } from '../../lib/cn';
import { getDocumentFileName, getDocumentFileUrl, isPendingDocument } from './documentUtils';
import { useEffect, useState } from 'react';

function DocumentPreview({ document }) {
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => {
    if (!document) {
      setPreviewUrl(null);
      return;
    }
    const isImage = document.mimeType?.startsWith('image/') || document.fileName?.match(/\.(jpeg|jpg|gif|png)$/i);
    if (!isImage) {
      setPreviewUrl(null);
      return;
    }

    if (document.file) {
      const url = URL.createObjectURL(document.file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      const url = getDocumentFileUrl(document);
      setPreviewUrl(url);
    }
  }, [document]);

  if (!previewUrl) return null;

  return (
    <div className="mt-3 mb-2 w-full h-40 rounded-lg border border-slate-200 overflow-hidden bg-white flex items-center justify-center p-2 shadow-sm">
      <img src={previewUrl} alt="Preview" className="w-full h-full object-contain" />
    </div>
  );
}

function formatSize(bytes = 0) {
  const value = Number(bytes || 0);
  if (!value) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  const size = value / (1024 ** index);
  return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function DocumentSection({
  title,
  description,
  definitions = [],
  documents = {},
  editable = false,
  onPickFile,
  onClearFile,
  onDeleteFile,
  className
}) {
  const inputRefs = useRef({});

  function triggerPicker(key) {
    inputRefs.current[key]?.click();
  }

  function handlePick(key, event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !onPickFile) return;
    onPickFile(key, file);
  }

  return (
    <div className={cn('space-y-4', className)}>
      {(title || description) ? (
        <div>
          {title ? <h3 className="text-base font-semibold text-slate-900">{title}</h3> : null}
          {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {definitions.map((definition) => {
          const document = documents?.[definition.key] || null;
          const fileName = getDocumentFileName(document);
          const fileUrl = getDocumentFileUrl(document);
          const pending = isPendingDocument(document);
          const hasFile = Boolean(document);

          return (
            <div key={definition.key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{definition.label}</p>
                  {definition.description ? <p className="mt-1 text-[12px] text-slate-500">{definition.description}</p> : null}
                </div>
                {pending ? (
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">Pending</span>
                ) : hasFile ? (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">Saved</span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500">Not uploaded</span>
                )}
              </div>

              <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-3">
                {hasFile ? (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Paperclip size={14} className="text-slate-400" />
                        <p className="truncate text-sm font-medium text-slate-900">{fileName}</p>
                      </div>
                      <p className="mt-1 text-[12px] text-slate-500">
                        {pending ? 'Selected for upload' : [document.mimeType, formatSize(document.sizeBytes)].filter(Boolean).join(' • ')}
                      </p>
                      <DocumentPreview document={document} />
                    </div>
                    {pending ? null : (
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-9 gap-2 rounded-full px-3 text-[13px]"
                        onClick={() => window.open(fileUrl, '_blank', 'noopener,noreferrer')}
                        disabled={!fileUrl}
                      >
                        <Eye size={14} />
                        View
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-slate-500">No file selected.</div>
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {editable ? (
                  <>
                    <input
                      ref={(node) => {
                        inputRefs.current[definition.key] = node;
                      }}
                      type="file"
                      accept="image/*,.pdf"
                      className="hidden"
                      onChange={(event) => handlePick(definition.key, event)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 gap-2 rounded-[var(--radius-button,1rem)] bg-white border border-slate-200 hover:bg-slate-50 px-3 text-[13px] text-slate-700 shadow-sm transition"
                      onClick={() => triggerPicker(definition.key)}
                    >
                      <Upload size={14} />
                      {hasFile ? 'Replace' : 'Select file'}
                    </Button>
                    {hasFile ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 gap-2 rounded-[var(--radius-button,1rem)] bg-rose-50 border border-rose-100 hover:bg-rose-100 px-3 text-[13px] text-rose-600 shadow-sm transition"
                        onClick={() => onClearFile?.(definition.key, document)}
                      >
                        <Trash2 size={14} />
                        Remove
                      </Button>
                    ) : null}
                  </>
                ) : (
                  <>
                    {fileUrl ? (
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-9 gap-2 rounded-full px-3 text-[13px]"
                        onClick={() => window.open(fileUrl, '_blank', 'noopener,noreferrer')}
                      >
                        <Eye size={14} />
                        Open
                      </Button>
                    ) : null}
                    {onDeleteFile && hasFile ? (
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-9 gap-2 rounded-full px-3 text-[13px] text-rose-600"
                        onClick={() => onDeleteFile(definition.key, document)}
                      >
                        <Trash2 size={14} />
                        Remove
                      </Button>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default DocumentSection;
