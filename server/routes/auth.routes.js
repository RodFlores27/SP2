'use strict';

const express = require('express');

const {
  exchangeOAuth,
  login,
  refresh,
  register,
  resendEmailVerification,
  requestPasswordReset,
  startOAuth,
  updatePassword,
} = require('../controllers/auth.controller');
const { authenticateToken, authorizeRoles } = require('../middleware/auth.middleware');

const router = express.Router();
const rateLimit = require('express-rate-limit');

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many authentication attempts. Please try again after 15 minutes.',
    code: 'AUTH_RATE_LIMIT_EXCEEDED',
  },
});

// Login-only JWT:
// - POST /register creates the account but does NOT return a token.
// - POST /login validates credentials and returns a JWT.
router.post('/register', authRateLimiter, register);
router.post('/login', authRateLimiter, login);
router.post('/refresh', refresh);
router.post('/password-reset-request', requestPasswordReset);
router.post('/email-verification/resend', resendEmailVerification);
router.post('/oauth/start', startOAuth);
router.post('/oauth/exchange', exchangeOAuth);
router.post('/password', authenticateToken, updatePassword);

router.get('/me', authenticateToken, (req, res) => {
  return res.json({ user: req.user });
});

// Simple role-protected endpoints for Day 2 verification/testing.
router.get(
  '/staff-only',
  authenticateToken,
  authorizeRoles(['ptcf_staff', 'staff', 'system_admin', 'admin']),
  (req, res) => res.json({ message: 'Staff access granted', user: req.user })
);

router.get(
  '/admin-only',
  authenticateToken,
  authorizeRoles(['system_admin', 'admin']),
  (req, res) => res.json({ message: 'Admin access granted', user: req.user })
);

module.exports = router;

