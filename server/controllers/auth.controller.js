'use strict';

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const { User } = require('../models');

function getEnvInt(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

async function register(req, res) {
  const { email, password, accountType, userCategory } = req.body || {};

  if (!email || typeof email !== 'string') {
    return res.status(400).json({ message: 'email is required' });
  }
  if (!password || typeof password !== 'string') {
    return res.status(400).json({ message: 'password is required' });
  }
  if (!accountType || typeof accountType !== 'string') {
    return res.status(400).json({ message: 'accountType is required' });
  }

  const saltRounds = getEnvInt('SALT_ROUNDS', 12);
  const emailNormalized = email.trim().toLowerCase();

  const existing = await User.findOne({ where: { email: emailNormalized } });
  if (existing) {
    return res.status(409).json({ message: 'Email already in use' });
  }

  const passwordHash = await bcrypt.hash(password, saltRounds);
  const user = await User.create({
    email: emailNormalized,
    passwordHash,
    accountType: accountType.trim(),
    userCategory: userCategory ? String(userCategory).trim() : null,
  });

  // Login-only JWT: do not issue a token here.
  return res.status(201).json({
    message: 'User registered',
    user: {
      id: user.id,
      email: user.email,
      accountType: user.accountType,
      userCategory: user.userCategory,
    },
  });
}

async function login(req, res) {
  const { email, password } = req.body || {};

  if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
    return res.status(400).json({ message: 'email and password are required' });
  }

  const emailNormalized = email.trim().toLowerCase();
  const user = await User.findOne({ where: { email: emailNormalized } });
  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return res.status(500).json({ message: 'JWT_SECRET not configured' });
  }

  const expiresIn = process.env.JWT_EXPIRES_IN || '1d';
  const token = jwt.sign(
    {
      userId: user.id,
      role: user.accountType,
      userCategory: user.userCategory,
    },
    secret,
    { expiresIn }
  );

  return res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      accountType: user.accountType,
      userCategory: user.userCategory,
    },
  });
}

module.exports = {
  register,
  login,
};

