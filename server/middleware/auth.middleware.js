"use strict";

const jwt = require("jsonwebtoken");
const { User } = require("../models");

function normalizeRole(role) {
  return String(role || "")
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

  jwt.verify(token, secret, async (err, payload) => {
    if (err) return res.status(401).json({ message: 'Invalid or expired token' });

    try {
      const user = await User.findByPk(payload.userId, { attributes: ["id"] });
      if (!user) {
        return res.status(401).json({
          message: "Session no longer matches this database. Sign in again (e.g. after a demo reset or re-seed).",
          code: "AUTH_USER_MISSING",
        });
      }
    } catch {
      return res.status(500).json({ message: "Authentication check failed" });
    }

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

