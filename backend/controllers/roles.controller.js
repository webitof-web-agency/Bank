const {
  createRole,
  deleteRole,
  getRoleById,
  listRoles,
  updateRole,
  updateRolePermissions
} = require('../services/auth.service');

async function listController(req, res, next) {
  try {
    const rows = await listRoles(req.query.search || '');
    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
}

async function getController(req, res, next) {
  try {
    const role = await getRoleById(req.params.id);
    if (!role) {
      return res.status(404).json({ success: false, message: 'Role not found' });
    }
    res.json({ success: true, data: role });
  } catch (error) {
    next(error);
  }
}

async function createController(req, res, next) {
  try {
    const result = await createRole(req.body || {});
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

async function updateController(req, res, next) {
  try {
    const result = await updateRole(req.params.id, req.body || {});
    if (!result) {
      return res.status(404).json({ success: false, message: 'Role not found' });
    }
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

async function deleteController(req, res, next) {
  try {
    const ok = await deleteRole(req.params.id);
    if (!ok) {
      return res.status(404).json({ success: false, message: 'Role not found' });
    }
    res.json({ success: true, message: 'Deleted successfully' });
  } catch (error) {
    next(error);
  }
}

async function updatePermissionsController(req, res, next) {
  try {
    const permissionCodes = req.body?.permissionCodes || req.body?.permissions || [];
    const result = await updateRolePermissions(req.params.id, permissionCodes);
    if (!result) {
      return res.status(404).json({ success: false, message: 'Role not found' });
    }
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createController,
  deleteController,
  getController,
  listController,
  updateController,
  updatePermissionsController
};
