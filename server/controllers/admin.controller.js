'use strict';

const { User } = require('../models');

const ALLOWED_ROLES = ['regular_user', 'ptcf_staff', 'system_admin'];

const listUsers = async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: ['id', 'email', 'accountType', 'userCategory', 'createdAt'],
      order: [['createdAt', 'DESC']],
    });
    res.json(users);
  } catch (err) {
    console.error('Error listing users:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

const updateUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { accountType } = req.body;

    if (!accountType || !ALLOWED_ROLES.includes(accountType)) {
      return res.status(400).json({
        error: `Invalid accountType. Must be one of: ${ALLOWED_ROLES.join(', ')}`,
      });
    }

    const targetId = parseInt(id, 10);

    if (targetId === req.user.id) {
      return res.status(400).json({ error: 'You cannot change your own role' });
    }

    const user = await User.findByPk(targetId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.accountType = accountType;
    await user.save();

    res.json({
      message: 'User role updated successfully',
      user: {
        id: user.id,
        email: user.email,
        accountType: user.accountType,
        userCategory: user.userCategory,
      },
    });
  } catch (err) {
    console.error('Error updating user role:', err);
    res.status(500).json({ error: 'Failed to update user role' });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const targetId = parseInt(id, 10);

    if (targetId === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    const user = await User.findByPk(targetId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await user.destroy();

    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('Error deleting user:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
};

module.exports = { listUsers, updateUserRole, deleteUser };
