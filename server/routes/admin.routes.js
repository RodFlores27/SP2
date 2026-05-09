'use strict';

const express = require('express');
const { authenticateToken, authorizeRoles } = require('../middleware/auth.middleware');
const {
  getAnalytics,
  exportAnalyticsCsv,
  listAuditLogs,
  listUsers,
  updateUserRole,
  deleteUser,
} = require('../controllers/admin.controller');

const router = express.Router();

router.use(authenticateToken, authorizeRoles(['system_admin']));

router.get('/users', listUsers);
router.patch('/users/:id/role', updateUserRole);
router.delete('/users/:id', deleteUser);
router.get('/analytics', getAnalytics);
router.get('/analytics/export.csv', exportAnalyticsCsv);
router.get('/audit-logs', listAuditLogs);

module.exports = router;
