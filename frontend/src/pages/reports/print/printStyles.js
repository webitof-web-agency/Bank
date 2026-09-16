export function formatMoney(value) {
  const num = Number(value || 0);
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
}

export function formatMoneyOrDash(value) {
  const num = Number(value || 0);
  if (!num) return '-';
  return formatMoney(num);
}

export function formatDMY(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return String(dateString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = date.toLocaleString('en-US', { month: 'short' });
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

export const th = 'border border-black px-2 py-1 text-center font-bold text-[11px] bg-slate-100';
export const td = 'border border-black px-2 py-1 text-right text-[11px] font-mono';
export const tdText = 'border border-black px-2 py-1 text-left text-[11px]';
export const tdCenter = 'border border-black px-2 py-1 text-center text-[11px]';
export const table = 'w-full border-collapse border border-black text-[11px] table-fixed';

// For wide multi-group tables (member/employee ledgers: 15+ data columns) —
// tighter padding and font, and every cell forced to one line (whitespace-nowrap)
// so amounts never wrap/overlap. The table is intentionally allowed to grow
// wider than the page — PrintShell's overflow-x-auto lets it scroll on screen,
// and the zoom control is there to shrink it back to fit visually.
export const thTight = 'border border-black px-1 py-1 text-center font-bold text-[9px] bg-slate-100 leading-tight whitespace-nowrap';
export const tdTight = 'border border-black px-1 py-1 text-right text-[9px] font-mono leading-tight whitespace-nowrap';
export const tdTextTight = 'border border-black px-1 py-1 text-left text-[9px] leading-tight whitespace-nowrap';
