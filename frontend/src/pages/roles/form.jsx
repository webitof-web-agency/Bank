import { Input } from '../../components/ui/Input';
import { Card } from '../../components/ui/Card';

const ACTION_TITLES = {
  create: 'Create',
  delete: 'Delete',
  edit: 'Edit',
  export: 'Export',
  print: 'Print',
  reverse: 'Reverse',
  view: 'View'
};

function formatActionTitle(action = '') {
  const key = String(action || '').trim().toLowerCase();
  return ACTION_TITLES[key] || key;
}

function collectPageCodes(page = {}) {
  return Array.isArray(page.permissions) ? page.permissions.map((permission) => permission.code).filter(Boolean) : [];
}

export function RoleForm({ value, groups = [], onChange, onSubmit, onCancel, saving, isEdit }) {
  const selectedCodes = new Set(value.permissionCodes || []);
  const primary = 'var(--primary, #1661F6)';

  function updateCodes(codes = []) {
    const current = new Set(value.permissionCodes || []);
    const allSelected = codes.length > 0 && codes.every((code) => current.has(code));

    if (allSelected) {
      codes.forEach((code) => current.delete(code));
    } else {
      codes.forEach((code) => current.add(code));
    }

    onChange({ ...value, permissionCodes: [...current] });
  }

  function togglePermission(code) {
    const current = new Set(value.permissionCodes || []);
    if (current.has(code)) current.delete(code);
    else current.add(code);
    onChange({ ...value, permissionCodes: [...current] });
  }

  const notificationsEnabled = value.payload?.notifications?.enabled || false;
  function toggleNotifications() {
    onChange({
      ...value,
      payload: {
        ...(value.payload || {}),
        notifications: {
          enabled: !notificationsEnabled
        }
      }
    });
  }

  return (
    <form id="role-form" className="flex flex-col lg:flex-row gap-6 h-full items-start" onSubmit={onSubmit}>
      <div className="w-full lg:w-1/3 flex flex-col gap-6 shrink-0 sticky top-6 self-start max-h-[calc(100vh-2rem)] overflow-y-auto pb-4" style={{ scrollbarWidth: 'none' }}>
        <Card className="flex flex-col gap-6 p-6 border border-slate-200 bg-white shadow-sm">
          <h3 className="text-[14px] font-bold text-slate-800 mb-2">Role Details</h3>

          <div>
            <label className="mb-2 block text-[13px] font-semibold text-slate-700">Role Name <span className="text-rose-500">*</span></label>
            <Input value={value.name || ''} onChange={(e) => onChange({ ...value, name: e.target.value })} placeholder="e.g. Cashier" required />
          </div>

          <div>
            <label className="mb-2 block text-[13px] font-semibold text-slate-700">Code <span className="text-rose-500">*</span></label>
            <Input value={value.code || ''} onChange={(e) => onChange({ ...value, code: e.target.value })} placeholder="e.g. cashier" required />
            <p className="mt-1.5 text-[11px] text-slate-500">Unique machine readable code.</p>
          </div>

          <div>
            <label className="mb-2 block text-[13px] font-semibold text-slate-700">Description</label>
            <textarea
              value={value.description || ''}
              onChange={(e) => onChange({ ...value, description: e.target.value })}
              placeholder="Role purpose..."
              className="w-full rounded-[var(--radius-input,0.75rem)] border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[var(--primary,#1661F6)] focus:outline-none focus:ring-1 focus:ring-[var(--primary,#1661F6)] min-h-[100px] resize-y"
            />
          </div>

          <div className="flex flex-col gap-3 text-[13px] font-medium text-slate-700">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={value.isActive !== false}
                onChange={(e) => onChange({ ...value, isActive: e.target.checked })}
                className="w-4 h-4 rounded border-slate-300 focus:ring-[var(--primary,#1661F6)]"
                style={{ accentColor: primary }}
              />
              Active Role
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={Boolean(value.isSystem)}
                onChange={(e) => onChange({ ...value, isSystem: e.target.checked })}
                className="w-4 h-4 rounded border-slate-300 focus:ring-[var(--primary,#1661F6)]"
                style={{ accentColor: primary }}
              />
              System Role
            </label>
          </div>
        </Card>

        <Card className="p-6 border border-slate-200 bg-white shadow-sm">
          <h4 className="text-[13px] font-bold text-slate-900 mb-1">Notification Preferences</h4>
          <p className="text-[11px] text-slate-500 mb-4 leading-relaxed">Control which pages generate in-app alerts and email copies for this role.</p>
          <label className="flex items-center gap-2.5 text-[13px] font-medium text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={notificationsEnabled}
              onChange={toggleNotifications}
              className="w-4 h-4 rounded border-slate-300 focus:ring-[var(--primary,#1661F6)]"
              style={{ accentColor: primary }}
            />
            Enable notifications
          </label>
        </Card>

        <div className="mt-2 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-[var(--radius-button,1rem)] px-4 py-2 text-[14px] font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-[var(--radius-button,1rem)] bg-[var(--primary,#1661F6)] px-6 py-2 text-[14px] font-semibold text-white shadow-sm transition hover:opacity-90 hover:shadow disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Saving...' : (isEdit ? 'Save Changes' : 'Create Role')}
          </button>
        </div>
      </div>

      <div className="w-full lg:w-2/3 flex flex-col gap-4">
        <Card className="p-6 border border-slate-200 bg-white shadow-sm flex flex-col">
          <div className="flex items-center justify-between gap-3 mb-4 border-b border-slate-100 pb-2">
            <div>
              <h3 className="text-[14px] font-bold text-slate-800">Section, Page & Action Permissions</h3>
              <p className="mt-1 text-[11px] text-slate-500">Expand a section, then pick the page and action permissions separately.</p>
            </div>
            <span className="text-[13px] font-medium text-[var(--primary,#1661F6)]">{(value.permissionCodes || []).length} Selected</span>
          </div>

          <div className="space-y-5 pb-4">
            {groups.map((section) => {
              const sectionPages = Array.isArray(section.pages) ? section.pages : [];
              const sectionCodes = sectionPages.flatMap((page) => collectPageCodes(page));
              const selectedSectionCount = sectionCodes.filter((code) => selectedCodes.has(code)).length;
              const isSectionSelected = sectionCodes.length > 0 && selectedSectionCount === sectionCodes.length;

              return (
                <Card key={section.key} className="border border-slate-200 bg-white shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/50 px-4 py-3">
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isSectionSelected}
                        onChange={() => updateCodes(sectionCodes)}
                        className="w-4 h-4 rounded border-slate-300 cursor-pointer focus:ring-[var(--primary,#1661F6)]"
                        style={{ accentColor: primary }}
                      />
                      <div>
                        <p className="text-[14px] font-bold text-slate-800">{section.label}</p>
                        <p className="text-[11px] text-slate-500">Section access for grouped pages</p>
                      </div>
                    </label>
                    <span className="text-[11px] font-medium text-slate-500">{selectedSectionCount}/{sectionCodes.length} selected</span>
                  </div>

                  <div className="space-y-3 p-4">
                    {sectionPages.map((page) => {
                      const pageCodes = collectPageCodes(page);
                      const selectedPageCount = pageCodes.filter((code) => selectedCodes.has(code)).length;
                      const isPageSelected = pageCodes.length > 0 && selectedPageCount === pageCodes.length;

                      return (
                        <Card key={page.key} className="border border-slate-200 bg-slate-50/20 shadow-none overflow-hidden">
                          <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3">
                            <label className="flex items-center gap-3 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={isPageSelected}
                                onChange={() => updateCodes(pageCodes)}
                                className="w-4 h-4 rounded border-slate-300 cursor-pointer focus:ring-[var(--primary,#1661F6)]"
                                style={{ accentColor: primary }}
                              />
                              <div>
                                <p className="text-[13px] font-bold text-slate-800">{page.label}</p>
                                <p className="text-[11px] text-slate-500">{page.description}</p>
                              </div>
                            </label>
                            <span className="text-[11px] font-medium text-slate-500">{selectedPageCount}/{pageCodes.length} selected</span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-6 p-4">
                            {Array.isArray(page.permissions) ? page.permissions.map((permission) => {
                              const isChecked = selectedCodes.has(permission.code);
                              return (
                                <label key={permission.code} className="flex items-start gap-2.5 cursor-pointer group">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => togglePermission(permission.code)}
                                    className="mt-0.5 w-4 h-4 rounded border-slate-300 cursor-pointer focus:ring-[var(--primary,#1661F6)]"
                                    style={{ accentColor: primary }}
                                  />
                                  <div>
                                    <p className="text-[13px] font-bold text-slate-800 group-hover:text-[var(--primary,#1661F6)] transition-colors leading-tight mb-1">{formatActionTitle(permission.action)}</p>
                                    <p className="text-[11px] text-slate-500 leading-snug">{page.description}</p>
                                  </div>
                                </label>
                              );
                            }) : null}
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </Card>
              );
            })}
          </div>
        </Card>
      </div>
    </form>
  );
}
