'use strict';

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const { User } = require('../models');
const { sendEmail } = require('../utils/email');
const {
  createSupabaseAdminClient,
  createSupabaseAuthClient,
  getSupabaseAuthSettings,
  isSupabaseAuthEnabled,
} = require('../utils/supabase-auth');

function getEnvInt(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

async function register(req, res) {
  if (isSupabaseAuthEnabled()) {
    return registerWithSupabase(req, res);
  }

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
  if (isSupabaseAuthEnabled()) {
    return loginWithSupabase(req, res);
  }

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

function serializeUser(user) {
  return {
    id: user.id,
    email: user.email,
    accountType: user.accountType,
    userCategory: user.userCategory,
    supabaseAuthId: user.supabaseAuthId || null,
  };
}

function getAuthRedirectUrl(fallbackPath = '/') {
  const raw =
    process.env.SUPABASE_AUTH_REDIRECT_URL ||
    process.env.CLIENT_URL ||
    '';
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (fallbackPath && fallbackPath !== '/') {
      url.pathname = fallbackPath;
    }
    return url.toString();
  } catch {
    return raw;
  }
}

function buildAuthEmailHtml({ title, introHtml, ctaLabel, actionLink, outroHtml = '' }) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family: sans-serif; background: #f9fafb; padding: 24px; color: #111;">
  <div style="max-width: 560px; margin: 0 auto; background: #fff; border-radius: 8px; border: 1px solid #e5e7eb; padding: 32px;">
    <h2 style="margin-top: 0; color: #1e3a5f;">PTCF Reservation System</h2>
    <h3 style="color: #374151;">${title}</h3>
    ${introHtml}
    <p><a href="${actionLink}" style="color:#2563eb;font-weight:600;">${ctaLabel}</a></p>
    ${outroHtml}
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
    <p style="font-size: 12px; color: #9ca3af;">
      This is an automated message from the PTCF Reservation System. Please do not reply to this email.
    </p>
  </div>
</body>
</html>`;
}

async function generateSupabaseAuthLink(params) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.generateLink(params);
  if (error) throw error;
  const actionLink = data?.properties?.action_link;
  if (!actionLink) {
    throw new Error(`Supabase did not return an action link for ${params.type}`);
  }
  return {
    actionLink,
    user: data?.user || null,
  };
}

async function createSupabaseAuthUser(email, password, emailRedirectTo) {
  const { actionLink, user } = await generateSupabaseAuthLink({
    type: 'signup',
    email,
    password,
    options: emailRedirectTo ? { emailRedirectTo } : undefined,
  });

  await sendSignupVerificationEmailViaResend(email, actionLink, 'created');

  return user;
}

async function findSupabaseAuthUserByEmail(admin, email) {
  const normalized = String(email || '').trim().toLowerCase();
  const perPage = 1000;
  let page = 1;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const found = (data.users || []).find(
      (user) => String(user.email || '').trim().toLowerCase() === normalized
    );
    if (found) return found;
    if ((data.users || []).length < perPage) return null;
    page += 1;
  }
}

async function sendSignupVerificationEmailViaResend(email, actionLink, mode = 'created') {
  const isResend = mode === 'resend';
  await sendEmail({
    to: email,
    subject: isResend ? '[PTCF] Confirm your account' : '[PTCF] Confirm your account',
    html: buildAuthEmailHtml({
      title: isResend ? 'Confirm your account' : 'Confirm your account',
      introHtml: isResend
        ? '<p>You asked for a new verification link for your PTCF Reservation System account.</p><p>Use the link below to confirm your email address and activate your access:</p>'
        : '<p>Your account has been created. Confirm your email address to activate your access to the PTCF Reservation System.</p>',
      ctaLabel: 'Confirm your email',
      actionLink,
      outroHtml:
        '<p>If you did not request this email, you can ignore it.</p>',
    }),
    text: isResend
      ? `PTCF Reservation System\n\nYou asked for a new verification link for your account.\n\nConfirm your email:\n${actionLink}\n\nIf you did not request this email, you can ignore it.`
      : `PTCF Reservation System\n\nYour account has been created. Confirm your email address to activate your access.\n\nConfirm your email:\n${actionLink}\n\nIf you did not request this account, you can ignore this email.`,
    throwOnError: true,
  });
}

async function resendSignupVerificationEmail(email, emailRedirectTo) {
  const { actionLink } = await generateSupabaseAuthLink({
    type: 'signup',
    email,
    options: emailRedirectTo ? { emailRedirectTo } : undefined,
  });
  await sendSignupVerificationEmailViaResend(email, actionLink, 'resend');
}

async function sendPasswordResetEmailViaResend(email, redirectTo) {
  const { actionLink } = await generateSupabaseAuthLink({
    type: 'recovery',
    email,
    options: redirectTo ? { redirectTo } : undefined,
  });

  await sendEmail({
    to: email,
    subject: '[PTCF] Restore your account password',
    html: buildAuthEmailHtml({
      title: 'Restore your account',
      introHtml:
        '<p>We found a previously deleted account using this email address and started the restoration process.</p><p>To finish restoring access, choose a new password using the link below:</p>',
      ctaLabel: 'Reset your password',
      actionLink,
      outroHtml:
        '<p>If you did not request this, you can ignore this email.</p>',
    }),
    text: `PTCF Reservation System\n\nWe found a previously deleted account using this email address and started the restoration process.\n\nTo finish restoring access, choose a new password using this link:\n${actionLink}\n\nIf you did not request this, you can ignore this email.`,
    throwOnError: true,
  });
}

async function sendForgotPasswordEmailViaResend(email, redirectTo) {
  const { actionLink } = await generateSupabaseAuthLink({
    type: 'recovery',
    email,
    options: redirectTo ? { redirectTo } : undefined,
  });

  await sendEmail({
    to: email,
    subject: '[PTCF] Reset your password',
    html: buildAuthEmailHtml({
      title: 'Reset your password',
      introHtml:
        '<p>We received a request to reset the password for your PTCF Reservation System account.</p><p>Use the link below to set a new password:</p>',
      ctaLabel: 'Reset your password',
      actionLink,
      outroHtml:
        '<p>If you did not request this, you can ignore this email.</p>',
    }),
    text: `PTCF Reservation System\n\nWe received a request to reset the password for your account.\n\nReset your password:\n${actionLink}\n\nIf you did not request this, you can ignore this email.`,
    throwOnError: true,
  });
}

async function registerWithSupabase(req, res) {
  const { email, password, accountType, userCategory } = req.body || {};

  if (!email || typeof email !== 'string') {
    return res.status(400).json({ message: 'email is required' });
  }
  if (!password || typeof password !== 'string') {
    return res.status(400).json({ message: 'password is required' });
  }
  if (accountType && accountType !== 'regular_user') {
    return res.status(403).json({
      message: 'Public registration is only available for regular users. Staff and admin accounts must be assigned by an admin.',
    });
  }
  if (!userCategory || typeof userCategory !== 'string') {
    return res.status(400).json({ message: 'userCategory is required' });
  }

  const emailNormalized = email.trim().toLowerCase();
  const emailRedirectTo = getAuthRedirectUrl('/login?verified=1');

  const existing = await User.findOne({ where: { email: emailNormalized } });
  if (existing) {
    return res.status(409).json({ message: 'Email already in use' });
  }

  try {
    const deletedProfile = await User.findOne({
      where: { email: emailNormalized },
      paranoid: false,
    });

    const admin = createSupabaseAdminClient();
    let supabaseUser = await findSupabaseAuthUserByEmail(admin, emailNormalized);
    let emailSent = false;
    let restored = false;
    let restorationRequiresPasswordReset = false;

    if (supabaseUser && !deletedProfile?.deletedAt) {
      return res.status(409).json({
        message: 'An authentication account already exists for this email. Use login, password reset, or Google sign-in.',
      });
    }

    if (!supabaseUser) {
      supabaseUser = await createSupabaseAuthUser(emailNormalized, password, emailRedirectTo);
      emailSent = true;
    }

    if (!supabaseUser?.id) {
      return res.status(502).json({
        message: 'Supabase Auth did not return a user id. Check email confirmation settings.',
      });
    }

    let user;
    if (deletedProfile?.deletedAt) {
      if (!emailSent) {
        await sendPasswordResetEmailViaResend(
          emailNormalized,
          process.env.SUPABASE_PASSWORD_RESET_REDIRECT_URL || null
        );
        emailSent = true;
        restorationRequiresPasswordReset = true;
      }
      await deletedProfile.restore();
      deletedProfile.supabaseAuthId = supabaseUser.id;
      deletedProfile.passwordHash = null;
      deletedProfile.accountType = 'regular_user';
      deletedProfile.userCategory = String(userCategory).trim();
      await deletedProfile.save();
      user = deletedProfile;
      restored = true;
    } else {
      user = await User.create({
        email: emailNormalized,
        supabaseAuthId: supabaseUser.id,
        passwordHash: null,
        accountType: 'regular_user',
        userCategory: String(userCategory).trim(),
      });
    }

    const message = restored
      ? (restorationRequiresPasswordReset
          ? 'Account restoration started. Check your email for a password reset link, then log in.'
          : 'Account restored. Check your email for a verification link, then log in.')
      : (emailSent
          ? 'User registered. Check your email for a verification link before logging in.'
          : 'User registered. You can log in now.');

    return res.status(201).json({
      message,
      user: serializeUser(user),
    });
  } catch (error) {
    const message = error.message || 'Supabase registration failed';
    const status = /already|registered|exists/i.test(message) ? 409 : 502;
    return res.status(status).json({ message });
  }
}

async function loginWithSupabase(req, res) {
  const { email, password } = req.body || {};

  if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
    return res.status(400).json({ message: 'email and password are required' });
  }

  const emailNormalized = email.trim().toLowerCase();

  try {
    const supabase = createSupabaseAuthClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: emailNormalized,
      password,
    });

    if (error) {
      const authMessage = String(error.message || '');
      if (/email not confirmed|not confirmed|email.*verify|verify your email/i.test(authMessage)) {
        return res.status(403).json({
          message: 'Email not confirmed. Please verify your email before logging in.',
          code: 'AUTH_EMAIL_NOT_CONFIRMED',
        });
      }
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const supabaseUser = data.user;
    const accessToken = data.session?.access_token;
    const refreshToken = data.session?.refresh_token;

    if (!supabaseUser?.id || !accessToken) {
      return res.status(401).json({ message: 'Supabase session was not issued' });
    }

    let user = await User.findOne({
      where: { supabaseAuthId: supabaseUser.id },
      paranoid: false,
    });
    if (!user) {
      user = await User.findOne({
        where: { email: emailNormalized },
        paranoid: false,
      });
      if (user && !user.deletedAt) {
        user.supabaseAuthId = supabaseUser.id;
        if (user.passwordHash) user.passwordHash = null;
        await user.save();
      }
    }

    if (user?.deletedAt) {
      return res.status(403).json({
        message: 'This account was deleted. Register again to reactivate it, or contact an administrator if this was a mistake.',
        code: 'AUTH_PROFILE_DELETED',
      });
    }

    if (!user) {
      return res.status(401).json({
        message: 'No active app profile is linked to this account. Register again or contact an administrator.',
        code: 'AUTH_PROFILE_MISSING',
      });
    }

    return res.json({
      token: accessToken,
      refreshToken,
      authProvider: 'supabase',
      user: serializeUser(user),
    });
  } catch (error) {
    return res.status(502).json({
      message: error.message || 'Supabase login failed',
    });
  }
}

async function refresh(req, res) {
  if (!isSupabaseAuthEnabled()) {
    return res.status(400).json({ message: 'Refresh is only available in Supabase Auth mode' });
  }

  const { refreshToken } = req.body || {};
  if (!refreshToken || typeof refreshToken !== 'string') {
    return res.status(400).json({ message: 'refreshToken is required' });
  }

  try {
    const supabase = createSupabaseAuthClient();
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data.session?.access_token || !data.user?.id) {
      return res.status(401).json({ message: 'Invalid or expired refresh token' });
    }

    const email = data.user.email ? String(data.user.email).trim().toLowerCase() : null;
    const user = await User.findOne({
      where: { supabaseAuthId: data.user.id },
      paranoid: false,
    }) || (email ? await User.findOne({ where: { email }, paranoid: false }) : null);

    if (user?.deletedAt) {
      return res.status(403).json({
        message: 'This account was deleted. Register again to reactivate it, or contact an administrator if this was a mistake.',
        code: 'AUTH_PROFILE_DELETED',
      });
    }

    if (!user) {
      return res.status(401).json({
        message: 'No active app profile is linked to this account. Register again or contact an administrator.',
        code: 'AUTH_PROFILE_MISSING',
      });
    }

    if (!user.supabaseAuthId) {
      user.supabaseAuthId = data.user.id;
      await user.save();
    }

    return res.json({
      token: data.session.access_token,
      refreshToken: data.session.refresh_token,
      authProvider: 'supabase',
      user: serializeUser(user),
    });
  } catch (error) {
    return res.status(502).json({
      message: error.message || 'Supabase token refresh failed',
    });
  }
}

async function requestPasswordReset(req, res) {
  if (!isSupabaseAuthEnabled()) {
    return res.status(400).json({ message: 'Password reset is only available in Supabase Auth mode' });
  }

  const { email, redirectTo } = req.body || {};
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ message: 'email is required' });
  }

  const emailNormalized = email.trim().toLowerCase();
  const configuredRedirect =
    redirectTo ||
    process.env.SUPABASE_PASSWORD_RESET_REDIRECT_URL ||
    process.env.CLIENT_PASSWORD_RESET_URL ||
    process.env.CLIENT_URL;

  try {
    const admin = createSupabaseAdminClient();
    const supabaseUser = await findSupabaseAuthUserByEmail(admin, emailNormalized);
    if (supabaseUser?.id) {
      await sendForgotPasswordEmailViaResend(emailNormalized, configuredRedirect || null);
    }

    // Keep the response generic so the endpoint does not become an account-enumeration oracle.
    return res.json({
      message: 'If that email is registered, a password reset link will be sent.',
    });
  } catch (error) {
    return res.status(502).json({
      message: error.message || 'Password reset request failed',
    });
  }
}

async function updatePassword(req, res) {
  if (!isSupabaseAuthEnabled()) {
    return res.status(400).json({ message: 'Password updates are only available in Supabase Auth mode' });
  }

  const { password } = req.body || {};
  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ message: 'password must be at least 6 characters' });
  }

  const supabaseUserId = req.user?.supabaseAuthId || req.user?.id;
  if (!supabaseUserId) {
    return res.status(401).json({ message: 'Supabase Auth user is not linked to this profile' });
  }

  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.auth.admin.updateUserById(supabaseUserId, {
      password,
    });

    if (error) {
      return res.status(502).json({ message: error.message || 'Password update failed' });
    }

    return res.json({ message: 'Password updated successfully' });
  } catch (error) {
    return res.status(502).json({
      message: error.message || 'Password update failed',
    });
  }
}

async function resendEmailVerification(req, res) {
  if (!isSupabaseAuthEnabled()) {
    return res.status(400).json({ message: 'Email verification resend is only available in Supabase Auth mode' });
  }

  const { email, redirectTo } = req.body || {};
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ message: 'email is required' });
  }

  const emailNormalized = email.trim().toLowerCase();
  const emailRedirectTo = redirectTo || getAuthRedirectUrl('/login?verified=1');

  try {
    const admin = createSupabaseAdminClient();
    const supabaseUser = await findSupabaseAuthUserByEmail(admin, emailNormalized);
    const emailConfirmedAt = supabaseUser?.email_confirmed_at || supabaseUser?.confirmed_at || null;

    if (supabaseUser?.id && !emailConfirmedAt) {
      await resendSignupVerificationEmail(emailNormalized, emailRedirectTo || null);
    }

    return res.json({
      message: 'If that email is pending verification, a new verification link will be sent.',
    });
  } catch (error) {
    return res.status(502).json({
      message: error.message || 'Verification email resend failed',
    });
  }
}

function getAllowedOAuthProvider(provider) {
  const normalized = String(provider || '').trim().toLowerCase();
  if (normalized === 'google') return 'google';
  return null;
}

async function isOAuthProviderEnabled(provider) {
  const settings = await getSupabaseAuthSettings();
  return Boolean(settings?.external?.[provider]);
}

async function startOAuth(req, res) {
  if (!isSupabaseAuthEnabled()) {
    return res.status(400).json({ message: 'OAuth is only available in Supabase Auth mode' });
  }

  const { provider, redirectTo } = req.body || {};
  const oauthProvider = getAllowedOAuthProvider(provider);
  if (!oauthProvider) {
    return res.status(400).json({ message: 'Unsupported OAuth provider. Use google.' });
  }

  const oauthRedirectTo = redirectTo || getAuthRedirectUrl('/oauth/callback');

  try {
    const providerEnabled = await isOAuthProviderEnabled(oauthProvider);
    if (!providerEnabled) {
      return res.status(400).json({
        message: `${oauthProvider} OAuth is not enabled in this Supabase project. Enable it in Supabase Dashboard > Authentication > Sign In / Providers before trying again.`,
      });
    }

    const supabase = createSupabaseAuthClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: oauthProvider,
      options: oauthRedirectTo ? { redirectTo: oauthRedirectTo } : undefined,
    });

    if (error || !data?.url) {
      return res.status(502).json({ message: error?.message || 'Unable to start OAuth flow' });
    }

    return res.json({ url: data.url, provider: oauthProvider });
  } catch (error) {
    return res.status(502).json({
      message: error.message || 'Unable to start OAuth flow',
    });
  }
}

async function exchangeOAuth(req, res) {
  if (!isSupabaseAuthEnabled()) {
    return res.status(400).json({ message: 'OAuth exchange is only available in Supabase Auth mode' });
  }

  const { accessToken, refreshToken } = req.body || {};
  if (!accessToken || typeof accessToken !== 'string') {
    return res.status(400).json({ message: 'accessToken is required' });
  }

  try {
    const supabase = createSupabaseAuthClient();
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error || !data?.user?.id) {
      return res.status(401).json({ message: 'Invalid or expired OAuth access token' });
    }

    const supabaseUser = data.user;
    const emailNormalized = String(supabaseUser.email || '').trim().toLowerCase();
    if (!emailNormalized) {
      return res.status(400).json({ message: 'OAuth user does not include an email address' });
    }

    let user = await User.findOne({
      where: { supabaseAuthId: supabaseUser.id },
      paranoid: false,
    });
    if (!user) {
      user = await User.findOne({
        where: { email: emailNormalized },
        paranoid: false,
      });
    }

    if (!user) {
      user = await User.create({
        email: emailNormalized,
        supabaseAuthId: supabaseUser.id,
        passwordHash: null,
        accountType: 'regular_user',
        userCategory: 'external',
      });
    } else if (user.deletedAt) {
      await user.restore();
      user.supabaseAuthId = supabaseUser.id;
      user.passwordHash = null;
      user.accountType = user.accountType || 'regular_user';
      user.userCategory = user.userCategory || 'external';
      await user.save();
    } else if (!user.supabaseAuthId) {
      user.supabaseAuthId = supabaseUser.id;
      if (user.passwordHash) user.passwordHash = null;
      await user.save();
    }

    return res.json({
      token: accessToken,
      refreshToken: refreshToken || null,
      authProvider: 'supabase',
      user: serializeUser(user),
    });
  } catch (error) {
    return res.status(502).json({
      message: error.message || 'OAuth exchange failed',
    });
  }
}

module.exports = {
  exchangeOAuth,
  resendEmailVerification,
  requestPasswordReset,
  refresh,
  register,
  login,
  startOAuth,
  updatePassword,
};

