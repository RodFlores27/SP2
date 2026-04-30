"use strict";

const jwt = require("jsonwebtoken");
const { User } = require("../models");
const {
  createSupabaseAuthClient,
  isSupabaseAuthEnabled,
} = require("../utils/supabase-auth");

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

  if (isSupabaseAuthEnabled()) {
    return authenticateSupabaseToken(token, req, res, next);
  }

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

async function authenticateSupabaseToken(token, req, res, next) {
  try {
    const supabase = createSupabaseAuthClient();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user?.id) {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }

    const email = data.user.email ? String(data.user.email).trim().toLowerCase() : null;
    let user = await User.findOne({
      where: { supabaseAuthId: data.user.id },
      attributes: ['id', 'email', 'accountType', 'userCategory', 'supabaseAuthId'],
    });

    if (!user && email) {
      user = await User.findOne({
        where: { email },
        attributes: ['id', 'email', 'accountType', 'userCategory', 'supabaseAuthId'],
      });
      if (user && !user.supabaseAuthId) {
        user.supabaseAuthId = data.user.id;
        await user.save();
      }
    }

    if (!user) {
      return res.status(401).json({
        message: 'Session no longer matches this database. Sign in again (e.g. after a demo reset or re-seed).',
        code: 'AUTH_USER_MISSING',
      });
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.accountType,
      userCategory: user.userCategory,
      supabaseAuthId: data.user.id,
    };
    next();
  } catch (error) {
    return res.status(500).json({
      message: error.message || 'Authentication check failed',
    });
  }
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

