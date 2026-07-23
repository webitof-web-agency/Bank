import { FileBrowser } from './FileBrowser';
import { Modal } from './Modal';

export function FileBrowserModal({ open, onClose, onSelect, uploadModule, uploadEntityId }) {
  return (
    <Modal open={open} onClose={onClose} title="Browse Files" size="4xl">
      <div className="h-[600px] overflow-hidden -mx-6 -mb-6">
        <FileBrowser
          showSidebar={true}
          showUpload={true}
          allowSelect={true}
          onSelectFile={(file) => {
            if (onSelect) onSelect(file);
            onClose();
          }}
          uploadModule={uploadModule}
          uploadEntityId={uploadEntityId}
        />
      </div>
    </Modal>
  );
}
