import { emptyState } from './emptyState.js';
import { escapeHtml } from '../utils/helpers.js';

export function renderTable({ columns = [], rows = [], rowActions = [], emptyTitle = 'No data', emptyMessage = 'Nothing to show yet.', selectable = false }) {
  if (!rows.length) return emptyState(emptyTitle, emptyMessage);

  const selectHead = selectable ? '<th><input type="checkbox" data-action="toggle-all-rows"></th>' : '';
  const head = columns.map((column) => {
    const style = column.align ? ` style="text-align: ${column.align};"` : '';
    return `<th${style}>${escapeHtml(column.label)}</th>`;
  }).join('');
  const actionHead = rowActions.length ? '<th class="table-actions-cell">Actions</th>' : '';
  
  const body = rows.map((row) => {
    const selectCell = selectable ? `<td><input type="checkbox" class="row-selector-chk" data-id="${escapeHtml(row.id)}"></td>` : '';
    const cells = columns.map((column) => {
      const value = column.render ? column.render(row) : row[column.key];
      const style = column.align ? ` style="text-align: ${column.align};"` : '';
      return `<td data-label="${escapeHtml(column.label)}"${style}>${value ?? '-'}</td>`;
    }).join('');
    
    const actions = rowActions.length
      ? `<td class="table-actions-cell" data-label="Actions">${rowActions.map((action) => `
          <button class="icon-btn ${action.className || ''}" type="button" data-action="${escapeHtml(action.action)}" data-id="${escapeHtml(row.id)}" title="${escapeHtml(action.label)}">
            ${escapeHtml(action.icon || action.label)}
          </button>
        `).join('')}</td>`
      : '';
      
    return `<tr>${selectCell}${cells}${actions}</tr>`;
  }).join('');

  return `
    <div class="table-wrap">
      <table>
        <thead><tr>${selectHead}${head}${actionHead}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}
