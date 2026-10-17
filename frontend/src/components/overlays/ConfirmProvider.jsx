import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog';

// `const confirm = useConfirm();` then `if (!(await confirm({ ... }))) return;`
// in place of window.confirm / window.prompt. Options are ConfirmDialog's
// props (title, description, confirmLabel, tone, requireReason, ...).
// Resolves true / false, or with requireReason the reason text / null.
const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [request, setRequest] = useState(null);
  const resolverRef = useRef(null);

  const confirm = useCallback((options = {}) => new Promise((resolve) => {
    // A second request replaces an open one, which counts as cancelled.
    resolverRef.current?.(options.requireReason ? null : false);
    resolverRef.current = resolve;
    setRequest(options);
  }), []);

  function finish(value) {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setRequest(null);
    resolve?.(value);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {/* data-modal-portal: clicks here are not "outside" a dialog behind it. */}
      <div data-modal-portal="true">
        <ConfirmDialog
          confirmLabel="Confirm"
          {...(request || {})}
          open={Boolean(request)}
          onConfirm={(reason) => finish(request?.requireReason ? reason : true)}
          onClose={() => finish(request?.requireReason ? null : false)}
        />
      </div>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return confirm;
}
