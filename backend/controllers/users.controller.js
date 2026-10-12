const {
  createUser,
  deleteUser,
  restoreUser,
  buildAccessProfile,
  getStaffProfile,
  listStaffWithoutLogin,
  listUsers,
  staffCodeFromId,
  updateStaff,
  updateUser,
  withoutBootstrapAdmin
} = require('../services/auth.service');
const { paginateRows, wantsPaging } = require('../utils/paginate');

// Logins first, then staff who have no login yet (see listStaffWithoutLogin).
async function listController(req, res, next) {
  try {
    const search = req.query.search || '';
    const rows = [...withoutBootstrapAdmin(await listUsers(search)), ...await listStaffWithoutLogin(search)];
    if (wantsPaging(req.query)) {
      const summarize = (list) => ({
        active: list.filter((row) => row.isActive !== false && String(row.status || 'Active').toLowerCase() !== 'inactive').length,
        assigned: list.filter((row) => (row.roles || []).length > 0).length
      });
      return res.json({ success: true, ...paginateRows(rows, { ...req.query, search: '' }, { summarize }) });
    }
    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
}

async function lookupController(req, res, next) {
  try {
    const rows = await listUsers(req.query.search || '');
    const data = rows
      .filter((user) => user?.isActive !== false)
      .map((user) => ({
        id: user.id,
        code: user.code,
        fullName: user.fullName,
        name: user.name,
        username: user.username,
        email: user.email,
        mobileNo: user.mobileNo,
        address: user.address,
        gender: user.gender,
        branchCode: user.branchCode,
        designation: user.designation,
        status: user.status,
        isActive: user.isActive,
        roles: user.roles || []
      }));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

async function getController(req, res, next) {
  try {
    const staffCode = staffCodeFromId(req.params.id);
    const user = staffCode ? await getStaffProfile(staffCode) : await buildAccessProfile(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
}

async function createController(req, res, next) {
  try {
    const result = await createUser(req.body || {});
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

async function updateController(req, res, next) {
  try {
    const staffCode = staffCodeFromId(req.params.id);
    const result = staffCode
      ? await updateStaff(staffCode, req.body || {})
      : await updateUser(req.params.id, req.body || {});
    if (!result) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

async function deleteController(req, res, next) {
  try {
    if (staffCodeFromId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'This employee has no login to delete.' });
    }
    const ok = await deleteUser(req.params.id);
    if (!ok) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }
    res.json({ success: true, message: 'Deleted successfully' });
  } catch (error) {
    next(error);
  }
}

async function restoreController(req, res, next) {
  try {
    const ok = await restoreUser(req.params.id);
    if (!ok) {
      return res.status(404).json({ success: false, message: 'Deleted employee not found' });
    }
    res.json({ success: true, message: 'Restored successfully' });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createController,
  deleteController,
  restoreController,
  getController,
  listController,
  lookupController,
  updateController
};

