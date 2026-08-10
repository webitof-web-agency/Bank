const {
  createUser,
  deleteUser,
  buildAccessProfile,
  listUsers,
  updateUser
} = require('../services/auth.service');

async function listController(req, res, next) {
  try {
    const rows = await listUsers(req.query.search || '');
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
    const user = await buildAccessProfile(req.params.id);
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
    const result = await updateUser(req.params.id, req.body || {});
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
    const ok = await deleteUser(req.params.id);
    if (!ok) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }
    res.json({ success: true, message: 'Deleted successfully' });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createController,
  deleteController,
  getController,
  listController,
  lookupController,
  updateController
};

