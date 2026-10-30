import { useEffect, useState } from 'react';
import { RotateCw } from 'lucide-react';
import { request } from '../../api/api';
import { Button } from '../../components/ui/Button';
import { MemberLedgerPrintTemplate } from '../reports/MemberLedgerPrintTemplate';
import { EmployeeLedgerPrint } from '../reports/print/EmployeeLedgerPrint';
import { PrintViewContext, ReportActionsContext } from '../reports/print/PrintShell';
import { setSocietyCache } from '../reports/print/useSociety';

// The website's member / employee ledger template, opened by the member app
// (in its web view, or a frame in the /member web copy) with a short-lived
// ticket instead of a web login. Zoom comes with the report frame; Rotate
// turns the sheet to landscape on a phone held upright.
const PAGE_PADDING = 8;

export function LedgerViewPage() {
  const [state, setState] = useState({ loading: true, error: '', data: null });
  const [rotated, setRotated] = useState(false);
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));

  useEffect(() => {
    const ticket = new URLSearchParams(window.location.search).get('ticket') || '';
    // The ticket is not left in the address bar (or the history).
    window.history.replaceState(null, '', window.location.pathname);
    if (!ticket) {
      setState({ loading: false, error: 'Open the ledger from the app.', data: null });
      return;
    }
    request(`/app/ledger-view?ticket=${encodeURIComponent(ticket)}`, { skipCache: true })
      .then((response) => {
        const data = response?.data || response;
        setSocietyCache(data?.society);
        document.title = `Ledger ${data?.fy || ''}`.trim();
        setState({ loading: false, error: '', data });
      })
      .catch((error) => setState({ loading: false, error: error.message || 'The ledger could not be loaded.', data: null }));
  }, []);

  useEffect(() => {
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (state.loading || state.error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6 text-center text-sm text-slate-600">
        {state.loading ? <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" /> : state.error}
      </div>
    );
  }

  const { data } = state;
  const rotateButton = (
    <Button type="button" variant="outline" className="h-9 gap-2 px-3 text-[13px]" onClick={() => setRotated((value) => !value)}>
      <RotateCw size={14} />
      {rotated ? 'Upright' : 'Rotate'}
    </Button>
  );
  const template = data.type === 'employee'
    ? <EmployeeLedgerPrint data={data.ledger} filters={{}} headerActions={rotateButton} />
    : <MemberLedgerPrintTemplate payload={data.ledger} headerActions={rotateButton} />;

  // Rotated: the page is laid out on a landscape box (the screen's height as
  // its width) turned a quarter, so the wide ledger fills an upright phone.
  const box = rotated
    ? { width: viewport.height, height: viewport.width, transform: `translateX(${viewport.width}px) rotate(90deg)`, transformOrigin: 'top left' }
    : { width: viewport.width, height: viewport.height };

  return (
    // No printing or PDF here: an app's web view cannot save or print them.
    <ReportActionsContext.Provider value={{ canPrint: false, canExport: false }}>
      {/* Fitted to the width (a small gap each side), as the website shows
          it; the frame takes the height the screen gives it, upright or
          turned, and scrolls a taller sheet. */}
      <PrintViewContext.Provider value={{ compact: true, availableHeight: (rotated ? viewport.width : viewport.height) - PAGE_PADDING * 2 }}>
        <div className="fixed inset-0 overflow-hidden bg-slate-50">
          <div className="overflow-hidden" style={{ ...box, padding: PAGE_PADDING }}>
            {template}
          </div>
        </div>
      </PrintViewContext.Provider>
    </ReportActionsContext.Provider>
  );
}

export default LedgerViewPage;
