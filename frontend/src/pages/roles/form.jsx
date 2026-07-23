import { useMemo } from 'react';
import { Input } from '../../components/ui/Input';
import { Card } from '../../components/ui/Card';
import { groupPermissionsByModule } from '../../lib/rbac';

export function RoleForm({ value, permissions, onChange, onSubmit, onCancel, saving, isEdit }) {
  const grouped = useMemo(() => groupPermissionsByModule(permissions), [permissions]);
  const primary = 'var(--primary, #1661F6)';

  function toggle(code) {
    const current = new Set(value.permissionCodes || []);
    if (current.has(code)) current.delete(code);
    else current.add(code);
    onChange({ ...value, permissionCodes: [...current] });
  }

  function toggleModule(group) {
    const current = new Set(value.permissionCodes || []);
    const moduleCodes = group.items.map(item => item.code);
    const allSelected = moduleCodes.every(code => current.has(code));
    
    if (allSelected) {
      moduleCodes.forEach(code => current.delete(code));
    } else {
      moduleCodes.forEach(code => current.add(code));
    }
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
      {/* LEFT COLUMN */}
      <div className="w-full lg:w-1/3 flex flex-col gap-6 shrink-0 sticky top-6 self-start max-h-[calc(100vh-2rem)] overflow-y-auto pb-4" style={{ scrollbarWidth: 'none' }}>
        <Card className="flex flex-col gap-6 p-6 border border-slate-200 bg-white shadow-sm">
          <h3 className="text-[14px] font-bold text-slate-800 mb-2">Role Details</h3>
          
          <div>
            <label className="mb-2 block text-[13px] font-semibold text-slate-700">Role Name <span className="text-rose-500">*</span></label>
            <Input value={value.name || ''} onChange={(e) => onChange({ ...value, name: e.target.value })} placeholder="e.g. Sales Manager" required />
          </div>

          <div>
            <label className="mb-2 block text-[13px] font-semibold text-slate-700">Code <span className="text-rose-500">*</span></label>
            <Input value={value.code || ''} onChange={(e) => onChange({ ...value, code: e.target.value })} placeholder="e.g. sales-manager" required />
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
          <p className="text-[11px] text-slate-500 mb-4 leading-relaxed">Control which modules generate in-app alerts and email copies for this role.</p>
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

      {/* RIGHT COLUMN: PERMISSIONS */}
      <div className="w-full lg:w-2/3 flex flex-col gap-4">
        <Card className="p-6 border border-slate-200 bg-white shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-2">
            <h3 className="text-[14px] font-bold text-slate-800">Permissions Checklist</h3>
            <span className="text-[13px] font-medium text-[var(--primary,#1661F6)]">{(value.permissionCodes || []).length} Selected</span>
          </div>

          <div className="space-y-4 pb-4">
            {grouped.map((group) => {
              const moduleCodes = group.items.map(i => i.code);
              const isAllSelected = moduleCodes.every(c => (value.permissionCodes || []).includes(c));
              
              return (
                <Card key={group.module} className="border border-slate-200 bg-white shadow-sm overflow-hidden">
                  <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/50 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={() => toggleModule(group)}
                      className="w-4 h-4 rounded border-slate-300 cursor-pointer focus:ring-[var(--primary,#1661F6)]"
                      style={{ accentColor: primary }}
                    />
                    <p className="text-[14px] font-bold text-slate-800 capitalize">{group.module} Module</p>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-4 gap-x-6 p-4">
                    {group.items.map((permission) => {
                      const isChecked = (value.permissionCodes || []).includes(permission.code);
                      return (
                        <label key={permission.code} className="flex items-start gap-2.5 cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggle(permission.code)}
                            className="mt-0.5 w-4 h-4 rounded border-slate-300 cursor-pointer focus:ring-[var(--primary,#1661F6)]"
                            style={{ accentColor: primary }}
                          />
                          <div>
                            <p className="text-[13px] font-bold text-slate-800 group-hover:text-[var(--primary,#1661F6)] transition-colors leading-tight mb-1">{permission.name}</p>
                            <p className="text-[11px] text-slate-500 leading-snug">{permission.description}</p>
                          </div>
                        </label>
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
