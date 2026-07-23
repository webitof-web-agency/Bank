import { escapeHtml } from '../utils/helpers.js';

export function openModal({ title = 'Details', body = '', footer = '', size = '' }) {
  const root = document.getElementById('modalRoot');
  const sizeClass = size ? `modal-${size}` : (body.includes('id="invoiceForm"') ? 'modal-lg' : 'modal-md');
  root.innerHTML = `
    <div class="modal-backdrop" data-action="close-modal"></div>
    <section class="modal ${sizeClass}" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      <header class="modal-header">
        <h2>${escapeHtml(title)}</h2>
        <button class="icon-btn close-modal-btn" type="button" data-action="close-modal" title="Close" style="min-width: 32px; width: 32px; height: 32px; font-size: 18px; line-height: 1; display: inline-flex; align-items: center; justify-content: center;">&times;</button>
      </header>
      <div class="modal-body">${body}</div>
      ${footer ? `<footer class="modal-footer">${footer}</footer>` : ''}
    </section>
  `;

  root.querySelectorAll('input, select, textarea').forEach((el) => {
    el.classList.toggle('has-value', el.value !== '');
  });
}

export function closeModal() {
  const root = document.getElementById('modalRoot');
  if (root) root.innerHTML = '';
}

export function bindModalEvents() {
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="close-modal"]')) closeModal();
  });
}
