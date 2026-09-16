import { useEffect, useRef, useState } from 'react';
import { Download, Minus, Plus, Printer, RotateCcw } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { getImageUrl } from '../../../api/api';
import { useSociety } from './useSociety';
import placeholderLogo from '../../../../assets/images/placeholder-logo.svg';

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;

const MM_TO_PX = 96 / 25.4;
// A4 minus the 6mm print padding applied on both sides (see contentRef below).
const PAGE_CONTENT_WIDTH_MM = { landscape: 297 - 12, portrait: 210 - 12 };

function ZoomStage({ zoom, landscape, children }) {
  const innerRef = useRef(null);
  const [height, setHeight] = useState(null);
  // The on-screen zoom above uses `transform`, which only repaints — it never
  // changes layout size, so a table built wider than the page (see
  // printStyles.js) still overflows the page at its natural width when
  // actually printed, and Chrome tiles that overflow into extra pages
  // reading left-to-right instead of flowing top-to-bottom. `zoom` (unlike
  // `transform`) genuinely reflows the box, so this measures the content's
  // real width and shrinks it to fit the printable page width — independent
  // of, and in addition to, the on-screen zoom control.
  const [printZoom, setPrintZoom] = useState(1);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return undefined;
    const pageContentWidthPx = PAGE_CONTENT_WIDTH_MM[landscape ? 'landscape' : 'portrait'] * MM_TO_PX;
    const recompute = () => {
      const naturalWidth = el.scrollWidth;
      setPrintZoom(naturalWidth > pageContentWidthPx ? pageContentWidthPx / naturalWidth : 1);
    };

    let observer;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver((entries) => {
        const rect = entries[0]?.contentRect;
        if (rect) setHeight(rect.height);
        recompute();
      });
      observer.observe(el);
    }

    // Belt-and-suspenders: re-measure right before the browser actually
    // paints for print, in case content (real data, fonts) finished
    // settling after the last ResizeObserver tick.
    window.addEventListener('beforeprint', recompute);
    return () => {
      observer?.disconnect();
      window.removeEventListener('beforeprint', recompute);
    };
  }, [landscape]);

  return (
    <div
      className="w-full print:!h-auto print:block"
      style={{ height: height ? height * zoom : undefined }}
    >
      <div
        ref={innerRef}
        className="w-full print:!transform-none print:!w-full print-fit-width"
        style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', '--print-zoom': printZoom }}
      >
        {children}
      </div>
    </div>
  );
}

export function PrintLetterhead({ title, meta }) {
  const society = useSociety();
  const logoSrc = society.logoUrl ? getImageUrl(society.logoUrl) : placeholderLogo;

  return (
    <div className="mb-2">
      <div className="flex items-center justify-center gap-2 text-center">
        <img src={logoSrc} alt="" className="h-16 w-16 shrink-0 rounded-full object-cover" />
        <div>
          <h1 className="text-xl font-bold uppercase tracking-wide text-black">{society.name || 'Society Name'}</h1>
          {society.address ? <p className="text-[12px] font-semibold text-black">{society.address}</p> : null}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 items-end border-b-2 border-black pb-1">
        <span />
        <h2 className="text-center text-[13px] font-bold uppercase text-black">{title}</h2>
        <span className="text-right text-[11px] text-black">{meta}</span>
      </div>
    </div>
  );
}

export function PrintShell({ headerActions, landscape = false, children }) {
  const [zoom, setZoom] = useState(1);
  const [exporting, setExporting] = useState(false);
  const contentRef = useRef(null);

  async function handleDownloadPdf() {
    if (!contentRef.current || exporting) return;
    setExporting(true);
    const previousZoom = zoom;
    setZoom(1);
    // Let the reset-zoom render commit before html2canvas snapshots the DOM.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    try {
      const { default: html2pdf } = await import('html2pdf.js');
      const filenameBase = (document.title || 'report').trim().replace(/[^a-z0-9-_]+/gi, '-').toLowerCase() || 'report';
      await html2pdf()
        .set({
          margin: 0,
          filename: `${filenameBase}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: landscape ? 'landscape' : 'portrait' },
          pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', 'td'] }
        })
        .from(contentRef.current)
        .save();
    } finally {
      setZoom(previousZoom);
      setExporting(false);
    }
  }

  return (
    <div className="w-full text-black">
      <div className="print:hidden mb-4 flex flex-wrap items-center justify-end gap-2">
        {headerActions}
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setZoom((z) => Math.max(ZOOM_MIN, Number((z - ZOOM_STEP).toFixed(2))))}
            title="Zoom out"
          >
            <Minus size={14} />
          </Button>
          <span className="w-11 text-center text-[12px] font-semibold text-slate-600">{Math.round(zoom * 100)}%</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setZoom((z) => Math.min(ZOOM_MAX, Number((z + ZOOM_STEP).toFixed(2))))}
            title="Zoom in"
          >
            <Plus size={14} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setZoom(1)}
            title="Reset zoom"
          >
            <RotateCcw size={13} />
          </Button>
        </div>
        <Button type="button" variant="outline" className="gap-2 h-9 px-3 text-[13px]" onClick={() => window.print()}>
          <Printer size={14} />
          Print
        </Button>
        <Button type="button" variant="outline" className="gap-2 h-9 px-3 text-[13px]" onClick={handleDownloadPdf} disabled={exporting}>
          <Download size={14} />
          {exporting ? 'Preparing PDF...' : 'Download PDF'}
        </Button>
      </div>

      <div className="w-full rounded-2xl bg-slate-50/80 p-4 sm:p-8 border border-slate-100 overflow-x-auto print:bg-transparent print:p-0 print:border-0 print:overflow-visible">
        <ZoomStage zoom={zoom} landscape={landscape}>
          <div
            ref={contentRef}
            className={`w-full bg-white p-4 print:p-[6mm] ${exporting ? '' : 'shadow-sm border border-slate-200'} ${landscape ? 'print:max-w-[297mm]' : 'print:max-w-[210mm]'}`}
          >
            {children}
          </div>
        </ZoomStage>
      </div>

      <style>{`
        /* Not scoped to @media print: html2pdf's 'css' pagebreak mode reads
           this from the normal (screen) computed style when it slices the
           rasterized page into PDF pages, so it has to apply unconditionally
           — a table row (or the stacked lines inside one cell) must move to
           the next page as a whole instead of being cut mid-row. */
        table tr, table td { break-inside: avoid; page-break-inside: avoid; }

        @media print {
          @page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 0; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          /* Shrinks content wider than the page to fit its width (see
             ZoomStage) so it paginates top-to-bottom by row instead of
             tiling the horizontal overflow into extra pages left-to-right. */
          .print-fit-width { zoom: var(--print-zoom, 1); }
        }
      `}</style>
    </div>
  );
}

export default PrintShell;
