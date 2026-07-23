import { escapeHtml, optionList, uid } from '../utils/helpers.js';

export function inputField({ label, name, value = '', type = 'text', required = false, min = '', step = '', placeholder = ' ', className = '' }) {
  const id = uid(`f-${name}`);
  return `
    <div class="field ${className}">
      <input type="${escapeHtml(type)}" name="${escapeHtml(name)}" id="${id}" value="${escapeHtml(value)}" ${required ? 'required' : ''} ${min !== '' ? `min="${escapeHtml(min)}"` : ''} ${step !== '' ? `step="${escapeHtml(step)}"` : ''} placeholder="${escapeHtml(placeholder)}">
      <label for="${id}">${escapeHtml(label)}${required ? ' *' : ''}</label>
    </div>
  `;
}

export function textareaField({ label, name, value = '', rows = 2, placeholder = ' ', className = '' }) {
  const id = uid(`f-${name}`);
  return `
    <div class="field ${className}">
      <textarea name="${escapeHtml(name)}" id="${id}" rows="${rows}" placeholder="${escapeHtml(placeholder)}">${escapeHtml(value)}</textarea>
      <label for="${id}">${escapeHtml(label)}</label>
    </div>
  `;
}

export function selectField({ label, name, options = [], value = '', required = false, className = '' }) {
  const id = uid(`f-${name}`);
  return `
    <div class="field ${className}">
      <select name="${escapeHtml(name)}" id="${id}" ${required ? 'required' : ''}>
        <option value="" disabled hidden ${value === '' ? 'selected' : ''}>Select</option>
        ${optionList(options, value)}
      </select>
      <label for="${id}">${escapeHtml(label)}${required ? ' *' : ''}</label>
    </div>
  `;
}

export function checkboxField({ label, name, checked = false, className = '' }) {
  const id = uid(`f-${name}`);
  return `
    <label class="checkbox-field ${className}" for="${id}">
      <input type="checkbox" name="${escapeHtml(name)}" id="${id}" ${checked ? 'checked' : ''}>
      <span>${escapeHtml(label)}</span>
    </label>
  `;
}

export function formActions(primaryLabel = 'Save', cancelRoute = '') {
  return `
    <div class="form-actions">
      ${cancelRoute ? `<a class="btn btn-secondary" href="${escapeHtml(cancelRoute)}">Cancel</a>` : ''}
      <button class="btn btn-primary" type="submit">${escapeHtml(primaryLabel)}</button>
    </div>
  `;
}
