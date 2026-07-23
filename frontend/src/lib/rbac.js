export function normalizeRoleIds(roles = []) {
  return roles.map((role) => role.id || role._id).filter(Boolean);
}

export function normalizePermissionCodes(permissions = []) {
  return permissions.map((permission) => permission.code || permission.id || permission).filter(Boolean);
}

export function mapUserForForm(user = {}) {
  return {
    ...user,
    roleIds: normalizeRoleIds(user.roles || [])
  };
}

export function mapRoleForForm(role = {}) {
  return {
    ...role,
    permissionCodes: normalizePermissionCodes(role.permissions || [])
  };
}

export function formatPermissionLabel(permission = {}) {
  return [permission.module, permission.action].filter(Boolean).join('.');
}

function normalizePermissionArray(input = []) {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input?.permissions)) return input.permissions;
  if (Array.isArray(input?.data?.permissions)) return input.data.permissions;
  if (Array.isArray(input?.items)) return input.items;
  if (Array.isArray(input?.groups)) {
    return input.groups.flatMap((group) => Array.isArray(group?.permissions) ? group.permissions : []);
  }
  return [];
}

export function groupPermissionsByModule(permissions = []) {
  const normalized = normalizePermissionArray(permissions);
  const grouped = normalized.reduce((acc, permission) => {
    const key = permission.module || 'general';
    if (!acc[key]) acc[key] = [];
    acc[key].push(permission);
    return acc;
  }, {});

  return Object.entries(grouped)
    .map(([module, items]) => ({
      module,
      items: items.sort((a, b) => String(a.action || '').localeCompare(String(b.action || ''), undefined, { numeric: true, sensitivity: 'base' }))
    }))
    .sort((a, b) => String(a.module).localeCompare(String(b.module), undefined, { numeric: true, sensitivity: 'base' }));
}
