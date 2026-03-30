'use strict';

const jwt = require('jsonwebtoken');

function normalizeRole(role) {
  return String(role || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing Bearer token' });
  }

  const token = authHeader.slice('Bearer '.length);
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return res.status(500).json({ message: 'JWT_SECRET not configured' });
  }

  jwt.verify(token, secret, (err, payload) => {
    if (err) return res.status(401).json({ message: 'Invalid or expired token' });

    req.user = {
      id: payload.userId,
      role: payload.role,
      userCategory: payload.userCategory,
    };
    next();
  });
}

function authorizeRoles(allowedRoles = []) {
  const normalizedAllowed = allowedRoles.map(normalizeRole);

  return (req, res, next) => {
    const role = normalizeRole(req.user && req.user.role);
    if (!role) return res.status(403).json({ message: 'No role found for user' });

    if (!normalizedAllowed.includes(role)) {
      return res.status(403).json({ message: 'Forbidden: insufficient role' });
    }

    next();
  };
}

module.exports = {
  authenticateToken,
  authorizeRoles,
  normalizeRole,
};

