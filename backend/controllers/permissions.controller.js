const { getPermissionCatalog, getRolePermissionMatrix, listPermissions } = require('../services/auth.service');

async function listController(_req, res, next) {
  try {
    const data = await getPermissionCatalog();
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function groupsController(_req, res, next) {
  try {
    const data = await getPermissionCatalog();
    res.json({ success: true, data: data.groups || [] });
  } catch (error) {
    next(error);
  }
}

async function matrixController(_req, res, next) {
  try {
    const data = await getRolePermissionMatrix();
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function flatController(_req, res, next) {
  try {
    const data = await listPermissions();
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  flatController,
  groupsController,
  listController,
  matrixController
};
