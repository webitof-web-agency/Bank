import { bindModalEvents, closeModal } from './components/modal.js';
import { bindSidebar } from './components/sidebar.js';
import { initRouter, route } from './router.js';
import { createSeedState, ensureStateShape } from './seed.js';
import { loadAllState } from './storage.js';
import { getState, setState } from './state.js';
import { showToast } from './utils/helpers.js';
import { checkAndGenerateRecurringInvoices, checkPaymentDueReminders } from './utils/automation.js';

function initApp() {
  const persistedState = loadAllState();
  setState(ensureStateShape(persistedState || createSeedState()), !persistedState);
  bindSidebar();
  bindModalEvents();
  bindGlobalEvents();
  checkAndGenerateRecurringInvoices();
  checkPaymentDueReminders();
  initRouter();
}

function bindGlobalEvents() {
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="toggle-sidebar"]')) {
      document.body.classList.toggle('sidebar-open');
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      document.body.classList.remove('sidebar-open');
      closeModal();
    }
  });

  document.addEventListener('input', (event) => {
    const el = event.target;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
      el.classList.toggle('has-value', el.value !== '');
    }

    const search = el.closest('#globalSearch');
    if (!search) return;
    const term = search.value.trim().toLowerCase();
    if (!term) return;
    const state = getState();
    const match = state.clients.find((client) => (
      `${client.name} ${client.companyName} ${client.email} ${client.mobile}`.toLowerCase().includes(term)
    ));
    if (match && event.inputType !== 'deleteContentBackward') {
      showToast(`Found ${match.companyName || match.name}. Open Clients to filter.`);
    }
  });

  document.addEventListener('change', (event) => {
    const el = event.target;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
      el.classList.toggle('has-value', el.value !== '');
    }
  });

  window.addEventListener('storage', () => {
    const persistedState = loadAllState();
    if (persistedState) setState(ensureStateShape(persistedState), false);
    route();
  });
}

initApp();
