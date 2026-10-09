import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, Minus, Plus, Printer, RotateCcw } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { getImageUrl } from '../../../api/api';
import { useSociety } from './useSociety';
import { formatDMY } from './printStyles';
import placeholderLogo from '../../../../assets/images/placeholder-logo.svg';

const ZOOM_MIN = 0.3;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;

const MM_TO_PX = 96 / 25.4;
const A4_MM = { portrait: { width: 210, height: 297 }, landscape: { width: 297, height: 210 } };
// Page margin on every side — the sheet padding on screen, @page margin in print.
const MARGIN_MM = 6;
const MARGIN_PX = MARGIN_MM * MM_TO_PX;
// Space between two sheets in the on-screen preview.
const SHEET_GAP_PX = 24;
const STAGE_BG = 'bg-slate-100';

const PageCountContext = createContext(1);
// The report's Print / Export permissions (Settings -> Roles), set by the
// report viewer. Download PDF counts as an export.
export const ReportActionsContext = createContext({ canPrint: true, canExport: true });

function formatPrintedAt(date) {
  const time = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  return `${formatDMY(date)} ${time.toUpperCase()}`;
}

// The unbreakable pieces of a report, in reading order: every table row,
// and every other block that has no table inside it. A page break only ever
// falls between two of these, so a row is never cut in half.
function collectAtoms(el, out) {
  for (const child of el.children) {
    if (child.tagName === 'TABLE') {
      for (const row of child.rows) out.push(row);
    } else if (child.querySelector('table')) {
      collectAtoms(child, out);
    } else {
      out.push(child);
    }
  }
  return out;
}

// Splits the report onto A4 sheets for the on-screen preview. The report is
// rendered once, as one flow; wherever a piece would run past the bottom of a
// sheet, it is pushed down (extra top padding on a row's cells, extra top
// margin on a block) to the top of the next sheet. White sheets are drawn
// behind the flow and covers over the gaps, so each sheet reads as its own
// page. Print and PDF don't use the pushes — they are cleared first and the
// browser / html2pdf paginate the plain flow at the same A4 size and margins.
function usePagination({ flowRef, fitRef, bodyRef, footerRef, landscape, zoomRef, suspendedRef }) {
  const [layout, setLayout] = useState({ pages: 1, covers: [], scale: 1, headers: [] });
  const pushesRef = useRef([]);
  const settledHeightRef = useRef(null);

  const clear = useCallback(() => {
    for (const { el, prop, value } of pushesRef.current.reverse()) el.style[prop] = value;
    pushesRef.current = [];
    settledHeightRef.current = null;
  }, []);

  const paginate = useCallback(() => {
    const flow = flowRef.current;
    const fit = fitRef.current;
    const body = bodyRef.current;
    if (!flow || !fit || !body || suspendedRef.current) return;
    clear();

    const page = A4_MM[landscape ? 'landscape' : 'portrait'];
    const pageContentWidthPx = (page.width - 2 * MARGIN_MM) * MM_TO_PX;
    // A report wider than the page (the ledgers' many columns) is shrunk to
    // the page width with CSS `zoom`, which reflows — on screen and in print
    // alike — so the sheet stays true A4 and paginates top-to-bottom. Its
    // natural width is its narrowest unbroken layout (min-content).
    fit.style.zoom = '1';
    fit.style.width = 'min-content';
    const scale = Math.max(1, fit.offsetWidth / pageContentWidthPx);
    fit.style.width = `${pageContentWidthPx * scale}px`;
    fit.style.zoom = String(1 / scale);
    const sheetHeight = page.height * MM_TO_PX;
    const pitch = sheetHeight + SHEET_GAP_PX;
    const contentStart = (index) => index * pitch + MARGIN_PX;
    const contentEnd = (index) => index * pitch + sheetHeight - MARGIN_PX;

    const zoom = zoomRef.current || 1;
    // Layout is read in one pass and written in one pass: interleaving a
    // style write with the next getBoundingClientRect would force the whole
    // report to re-layout once per page break, which on a long report (the
    // all-accounts Statement of Account, ~3000 rows) takes many seconds. A
    // push moves everything after it down by exactly its amount, so later
    // positions are the measured ones plus the pushes so far.
    const flowRect = flow.getBoundingClientRect();
    const box = (el) => {
      const rect = el.getBoundingClientRect();
      return { top: (rect.top - flowRect.top) / zoom, bottom: (rect.bottom - flowRect.top) / zoom, height: rect.height };
    };
    // The rule a bordered table draws above/below a row, so a row moved to a
    // new sheet keeps its top line and the last row on a sheet its bottom one.
    const edge = (row, side) => {
      if (row?.tagName !== 'TR' || !row.cells.length) return null;
      const style = getComputedStyle(row.cells[0]);
      const width = parseFloat(style[`border${side}Width`]) || 0;
      if (!width || style[`border${side}Style`] === 'none') return null;
      const table = row.closest('table').getBoundingClientRect();
      return {
        left: (table.left - flowRect.left) / zoom,
        width: table.width / zoom,
        border: `${Math.max(1, width)}px ${style[`border${side}Style`]} ${style[`border${side}Color`]}`
      };
    };

    // Read pass.
    const atoms = collectAtoms(body, []).map((el) => ({ el, ...box(el) })).filter((atom) => atom.height > 0);
    const pushes = [];
    const covers = [];
    let shift = 0;
    // Print repeats a table's header row at the top of every page the table
    // continues on, so a body row moved to a new sheet sits below a copy of
    // it here too — the preview then breaks exactly where print does.
    const headers = new Map();
    const headerOf = (row) => {
      const tableEl = row.tagName === 'TR' && row.parentElement?.tagName === 'TBODY' ? row.closest('table') : null;
      if (!tableEl?.tHead) return null;
      if (!headers.has(tableEl)) {
        const rect = tableEl.tHead.getBoundingClientRect();
        // The copy is laid out on its own, so pin every column to the width
        // it has in the report (from a body row with one cell per column);
        // otherwise an auto-width table's copied header drifts out of line.
        const columnCount = Math.max(...[...tableEl.rows].map((r) => [...r.cells].reduce((n, c) => n + c.colSpan, 0)));
        const sample = [...tableEl.tBodies].flatMap((body) => [...body.rows]).find((r) => r.cells.length === columnCount);
        const colgroup = sample
          ? `<colgroup>${[...sample.cells].map((c) => `<col style="width:${c.offsetWidth}px">`).join('')}</colgroup>`
          : (tableEl.querySelector('colgroup')?.outerHTML || '');
        headers.set(tableEl, {
          height: rect.height / zoom,
          left: (rect.left - flowRect.left) / zoom,
          cssWidth: tableEl.offsetWidth,
          html: `<table class="${tableEl.className}" style="table-layout:fixed;width:${tableEl.offsetWidth}px">${colgroup}${tableEl.tHead.outerHTML}</table>`
        });
      }
      return headers.get(tableEl);
    };
    const repeatedHeaders = [];

    let index = 0;
    let previous = null;
    let previousBottom = contentStart(0);
    for (const atom of atoms) {
      let top = atom.top + shift;
      let bottom = atom.bottom + shift;
      // A piece marked data-page-break-before always starts a new sheet
      // (e.g. one sheet per branch), unless it already heads one.
      const forcedBreak = atom.el.hasAttribute?.('data-page-break-before');
      if ((bottom > contentEnd(index) || forcedBreak) && top > contentStart(index) + 1) {
        const header = headerOf(atom.el);
        const amount = contentStart(index + 1) + (header ? header.height : 0) - top;
        pushes.push({ el: atom.el, amount });
        if (header) repeatedHeaders.push({ ...header, top: contentStart(index + 1) });
        covers.push({
          from: previousBottom,
          sheetEnd: index * pitch + sheetHeight,
          to: contentStart(index + 1),
          above: edge(previous, 'Bottom'),
          below: header ? null : edge(atom.el, 'Top')
        });
        index += 1;
        top += amount;
        bottom += amount;
        shift += amount;
      }
      // A single piece taller than a sheet can't be kept whole; let it run on.
      while (bottom > contentEnd(index)) index += 1;
      previous = atom.el;
      previousBottom = Math.max(previousBottom, bottom);
    }

    // "Printed on" sits at the foot of the last sheet.
    const footer = footerRef.current;
    if (footer) {
      const bottom = box(footer).bottom + shift;
      if (bottom > contentEnd(index)) index += 1;
      const room = contentEnd(index) - bottom;
      if (room > 0) pushes.push({ el: footer, amount: room });
    }

    // Current paddings/margins, still before any write.
    const writes = [];
    for (const { el, amount } of pushes) {
      // `amount` is in on-screen px; inside the zoomed box a CSS px is
      // 1/scale of that.
      const cssAmount = amount * scale;
      if (el.tagName === 'TR') {
        for (const cell of el.cells) {
          writes.push({ el: cell, prop: 'paddingTop', value: (parseFloat(getComputedStyle(cell).paddingTop) || 0) + cssAmount });
        }
      } else {
        writes.push({ el, prop: 'marginTop', value: (parseFloat(getComputedStyle(el).marginTop) || 0) + cssAmount });
      }
    }

    // Write pass.
    for (const { el, prop, value } of writes) {
      pushesRef.current.push({ el, prop, value: el.style[prop] });
      el.style[prop] = `${value}px`;
    }

    settledHeightRef.current = flow.offsetHeight;
    // Runs after every render, so only commit a layout that actually changed
    // — a fresh-but-equal object would re-render forever.
    const next = { pages: index + 1, covers, scale, headers: repeatedHeaders };
    setLayout((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
  }, [bodyRef, clear, fitRef, flowRef, footerRef, landscape, suspendedRef, zoomRef]);

  useLayoutEffect(() => {
    paginate();
  });

  useEffect(() => {
    const flow = flowRef.current;
    if (!flow || typeof ResizeObserver === 'undefined') return undefined;
    // Re-run when the report itself changes size (data, fonts, logo), but not
    // for the size change our own pushes just caused.
    const observer = new ResizeObserver(() => {
      if (flow.offsetHeight !== settledHeightRef.current) paginate();
    });
    observer.observe(flow);
    return () => observer.disconnect();
  }, [flowRef, paginate]);

  return { layout, paginate, clear };
}

function ZoomStage({ zoom, children }) {
  const innerRef = useRef(null);
  const [height, setHeight] = useState(null);

  useEffect(() => {
    const el = innerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setHeight(rect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The on-screen zoom control uses `transform`, which only repaints and
  // never changes layout, so it doesn't disturb pagination (fitting a wide
  // report to the page is usePagination's own CSS `zoom`).
  return (
    <div className="w-fit min-w-full print:!h-auto print:!w-auto print:block" style={{ height: height ? height * zoom : undefined }}>
      <div
        ref={innerRef}
        className="w-fit mx-auto print:!transform-none print:!w-full"
        style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
      >
        {children}
      </div>
    </div>
  );
}

export function PrintLetterhead({ title, meta }) {
  const society = useSociety();
  const pageCount = useContext(PageCountContext);
  const logoSrc = society.logoUrl ? getImageUrl(society.logoUrl) : placeholderLogo;
  const metaText = typeof meta === 'string' ? meta.replace(/Page 1 of 1/, `Page 1 of ${pageCount}`) : meta;

  return (
    <div className="mb-2">
      <div className="flex items-center justify-center gap-2 text-center">
        <img src={logoSrc} alt="" className="h-16 w-16 shrink-0 rounded-full object-cover" />
        <div>
          <h1 className="text-xl font-bold uppercase tracking-wide text-black">{society.name || 'Society Name'}</h1>
          {society.address ? <p className="text-[12px] font-semibold text-black">{society.address}</p> : null}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-end gap-3 border-b-2 border-black pb-1">
        <span />
        <h2 className="whitespace-nowrap text-center text-[13px] font-bold uppercase text-black">{title}</h2>
        <span className="text-right text-[11px] text-black">{metaText}</span>
      </div>
    </div>
  );
}

// Every report prints on A4 — portrait unless `landscape` (the wide ledgers).
// The preview shows the report split onto A4 sheets as it will print.
export function PrintShell({ headerActions, landscape = false, children }) {
  const { canPrint, canExport } = useContext(ReportActionsContext);
  const [zoom, setZoom] = useState(1);
  const [exporting, setExporting] = useState(false);
  // The preview shows one sheet at a time (0-based); print / PDF still get
  // every page.
  const [currentPage, setCurrentPage] = useState(0);
  const [pageInput, setPageInput] = useState('1');
  const [printedAt, setPrintedAt] = useState(() => new Date());
  const contentRef = useRef(null);
  const flowRef = useRef(null);
  const fitRef = useRef(null);
  const bodyRef = useRef(null);
  const footerRef = useRef(null);
  const zoomRef = useRef(zoom);
  const suspendedRef = useRef(false);
  zoomRef.current = zoom;

  const { layout, paginate, clear } = usePagination({ flowRef, fitRef, bodyRef, footerRef, landscape, zoomRef, suspendedRef });

  const page = A4_MM[landscape ? 'landscape' : 'portrait'];
  const sheetWidth = page.width * MM_TO_PX;
  const sheetHeight = page.height * MM_TO_PX;
  const pitch = sheetHeight + SHEET_GAP_PX;
  const totalHeight = layout.pages * pitch - SHEET_GAP_PX;
  const lastPage = Math.max(0, layout.pages - 1);
  const shownPage = Math.min(currentPage, lastPage);

  // A new report (or a re-pagination that leaves fewer sheets) never points
  // past the last sheet.
  useEffect(() => {
    if (currentPage > lastPage) setCurrentPage(lastPage);
  }, [currentPage, lastPage]);
  useEffect(() => {
    setPageInput(String(shownPage + 1));
  }, [shownPage]);

  const goToPage = useCallback((index) => {
    const target = Math.min(Math.max(0, index), lastPage);
    setCurrentPage(target);
    setPageInput(String(target + 1));
  }, [lastPage]);

  function jumpToTypedPage() {
    const typed = parseInt(pageInput, 10);
    if (Number.isFinite(typed)) goToPage(typed - 1);
    else setPageInput(String(shownPage + 1));
  }

  // Printing paginates the plain flow itself: drop the preview's pushes
  // before the browser lays out the print, restore them afterwards. Also
  // stamps the footer with the moment it is actually printed.
  useEffect(() => {
    const before = () => {
      suspendedRef.current = true;
      clear();
      setPrintedAt(new Date());
    };
    const after = () => {
      suspendedRef.current = false;
      paginate();
    };
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, [clear, paginate]);

  async function handleDownloadPdf() {
    if (!contentRef.current || exporting) return;
    suspendedRef.current = true;
    clear();
    if (fitRef.current) fitRef.current.style.zoom = '1';
    setExporting(true);
    setPrintedAt(new Date());
    const previousZoom = zoom;
    setZoom(1);
    // Let the reset-zoom render commit before html2canvas snapshots the DOM.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    try {
      const { default: html2pdf } = await import('html2pdf.js');
      const filenameBase = (document.title || 'report').trim().replace(/[^a-z0-9-_]+/gi, '-').toLowerCase() || 'report';
      await html2pdf()
        .set({
          margin: MARGIN_MM,
          filename: `${filenameBase}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: landscape ? 'landscape' : 'portrait' },
          pagebreak: { mode: ['css', 'legacy'], avoid: ['tr', 'td'] }
        })
        .from(flowRef.current)
        .toPdf()
        .get('pdf')
        .then((pdf) => {
          // "Page X of N" in the bottom margin of every PDF page.
          const total = pdf.internal.getNumberOfPages();
          const width = pdf.internal.pageSize.getWidth();
          const height = pdf.internal.pageSize.getHeight();
          pdf.setFontSize(7);
          for (let i = 1; i <= total; i += 1) {
            pdf.setPage(i);
            pdf.text(`Page ${i} of ${total}`, width - MARGIN_MM, height - MARGIN_MM / 3, { align: 'right' });
          }
        })
        .save();
    } finally {
      suspendedRef.current = false;
      setZoom(previousZoom);
      setExporting(false);
    }
  }

  return (
    <PageCountContext.Provider value={layout.pages}>
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
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => goToPage(0)} disabled={shownPage === 0} title="First page">
              <ChevronsLeft size={14} />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => goToPage(shownPage - 1)} disabled={shownPage === 0} title="Previous page">
              <ChevronLeft size={14} />
            </Button>
            <form
              className="flex items-center gap-1 px-1 text-[12px] font-semibold text-slate-600"
              onSubmit={(event) => { event.preventDefault(); jumpToTypedPage(); }}
            >
              <span>Page</span>
              <input
                type="number"
                min={1}
                max={layout.pages}
                value={pageInput}
                onChange={(event) => setPageInput(event.target.value)}
                onBlur={jumpToTypedPage}
                className="h-7 w-12 rounded-md border border-slate-200 px-1 text-center text-[12px] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                aria-label="Go to page"
                title="Type a page number and press Enter"
              />
              <span>of {layout.pages}</span>
            </form>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => goToPage(shownPage + 1)} disabled={shownPage >= lastPage} title="Next page">
              <ChevronRight size={14} />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => goToPage(lastPage)} disabled={shownPage >= lastPage} title="Last page">
              <ChevronsRight size={14} />
            </Button>
          </div>
          <span className="text-[12px] font-semibold text-slate-500">
            A4 {landscape ? 'landscape' : 'portrait'}
          </span>
          {canPrint ? (
            <Button type="button" variant="outline" className="gap-2 h-9 px-3 text-[13px]" onClick={() => window.print()}>
              <Printer size={14} />
              Print
            </Button>
          ) : null}
          {canExport ? (
            <Button type="button" variant="outline" className="gap-2 h-9 px-3 text-[13px]" onClick={handleDownloadPdf} disabled={exporting}>
              <Download size={14} />
              {exporting ? 'Preparing PDF...' : 'Download PDF'}
            </Button>
          ) : null}
        </div>

        <div className={`w-full rounded-2xl ${STAGE_BG} p-4 sm:p-8 border border-slate-200 overflow-x-auto print:bg-transparent print:p-0 print:border-0 print:overflow-visible`}>
          <ZoomStage zoom={zoom}>
            {/* A one-sheet window onto the paginated report: the full flow
                is laid out as before and shifted up to the current sheet. */}
            <div
              className="relative overflow-hidden print:!h-auto print:!w-auto print:!overflow-visible"
              style={exporting ? undefined : { width: sheetWidth, height: sheetHeight }}
            >
            <div
              ref={contentRef}
              className="relative print:!w-auto print:!h-auto print:!transform-none"
              style={{
                width: sheetWidth,
                height: exporting ? undefined : totalHeight,
                transform: exporting ? undefined : `translateY(${-shownPage * pitch}px)`
              }}
            >
              {!exporting && Array.from({ length: layout.pages }, (_, i) => (
                <div
                  key={`sheet-${i}`}
                  className="absolute inset-x-0 bg-white shadow-sm border border-slate-200 print:hidden"
                  style={{ top: i * pitch, height: sheetHeight }}
                />
              ))}

              <div
                ref={flowRef}
                className={`relative bg-transparent print:!p-0 print:!w-auto ${exporting ? 'bg-white' : ''}`}
                // Fixed at A4 width. For PDF, html2pdf applies the margin
                // itself, and gets the report at its full width (html2canvas
                // ignores CSS zoom) to fit onto the page.
                style={exporting
                  ? { padding: 0, width: (page.width - 2 * MARGIN_MM) * MM_TO_PX * layout.scale }
                  : { padding: MARGIN_PX, width: page.width * MM_TO_PX }}
              >
                {/* Width/zoom set by usePagination to fit a wide report. */}
                <div ref={fitRef}>
                  <div ref={bodyRef}>{children}</div>
                  <div ref={footerRef} className="pt-3 text-right text-[10px] text-black">
                    Printed on: {formatPrintedAt(printedAt)}
                  </div>
                </div>
              </div>

              {!exporting && layout.covers.map((cover, i) => (
                <div key={`cover-${i}`} className="print:hidden">
                  <div
                    className="absolute inset-x-0 z-10 bg-white"
                    style={{ top: cover.from, height: cover.sheetEnd - cover.from - 1 }}
                  >
                    {cover.above ? (
                      <div className="absolute top-0" style={{ left: cover.above.left, width: cover.above.width, borderTop: cover.above.border }} />
                    ) : null}
                  </div>
                  <div
                    className={`absolute -inset-x-px z-10 ${STAGE_BG}`}
                    style={{ top: cover.sheetEnd - 1, height: SHEET_GAP_PX + 2 }}
                  />
                  <div
                    className="absolute inset-x-0 z-10 bg-white"
                    style={{ top: cover.sheetEnd + SHEET_GAP_PX + 1, height: cover.to - cover.sheetEnd - SHEET_GAP_PX - 1 }}
                  >
                    {cover.below ? (
                      <div className="absolute bottom-0" style={{ left: cover.below.left, width: cover.below.width, borderBottom: cover.below.border }} />
                    ) : null}
                  </div>
                </div>
              ))}

              {/* Header row repeated at the top of each continued sheet, as print does. */}
              {!exporting && layout.headers.map((header, i) => (
                <div key={`header-${i}`} className="absolute z-20 print:hidden" style={{ top: header.top, left: header.left }}>
                  <div
                    style={{ width: header.cssWidth, zoom: 1 / layout.scale }}
                    // A copy of the report's own <thead> markup, measured above.
                    dangerouslySetInnerHTML={{ __html: header.html }}
                  />
                </div>
              ))}

              {/* Page number at the foot of every sheet, in the bottom margin. */}
              {!exporting && Array.from({ length: layout.pages }, (_, i) => (
                <div
                  key={`page-no-${i}`}
                  className="absolute z-20 text-[9px] text-black print:hidden"
                  style={{ top: i * pitch + sheetHeight - MARGIN_PX + 3, right: MARGIN_PX }}
                >
                  Page {i + 1} of {layout.pages}
                </div>
              ))}
            </div>
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
          [data-page-break-before] { break-before: page; page-break-before: always; }

          @media print {
            @page {
              size: A4 ${landscape ? 'landscape' : 'portrait'};
              margin: ${MARGIN_MM}mm;
              @bottom-right { content: "Page " counter(page) " of " counter(pages); font-size: 8px; color: #000; }
            }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        `}</style>
      </div>
    </PageCountContext.Provider>
  );
}

export default PrintShell;
