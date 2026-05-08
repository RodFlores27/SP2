'use strict';

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function validateRuntimeConfig(env = process.env) {
  const warnings = [];
  const errors = [];

  const isSupabaseAuth = String(env.AUTH_PROVIDER || '').toLowerCase() === 'supabase';
  const isProduction = String(env.NODE_ENV || '').toLowerCase() === 'production';

  if (!hasValue(env.FRONTEND_URL) && !hasValue(env.CLIENT_URL)) {
    warnings.push('FRONTEND_URL/CLIENT_URL is not set; email links may point to localhost fallback.');
  }

  if (!hasValue(env.RESEND_API_KEY)) {
    warnings.push('RESEND_API_KEY is not set; transactional emails will be skipped.');
  }
  if (!hasValue(env.RESEND_FROM_EMAIL)) {
    warnings.push('RESEND_FROM_EMAIL is not set; default sender will be used.');
  }

  if (!hasValue(env.CLOUDINARY_CLOUD_NAME) || !hasValue(env.CLOUDINARY_API_KEY) || !hasValue(env.CLOUDINARY_API_SECRET)) {
    warnings.push('Cloudinary credentials are incomplete; document uploads may fail.');
  }

  if (isSupabaseAuth) {
    if (!hasValue(env.SUPABASE_URL)) errors.push('SUPABASE_URL is required when AUTH_PROVIDER=supabase.');
    if (!hasValue(env.SUPABASE_ANON_KEY)) errors.push('SUPABASE_ANON_KEY is required when AUTH_PROVIDER=supabase.');
    if (!hasValue(env.SUPABASE_SERVICE_ROLE_KEY)) {
      errors.push('SUPABASE_SERVICE_ROLE_KEY is required when AUTH_PROVIDER=supabase.');
    }
  } else if (!hasValue(env.JWT_SECRET)) {
    warnings.push('JWT_SECRET is empty while AUTH_PROVIDER is not supabase.');
  }

  if (isProduction) {
    if (!hasValue(env.DATABASE_URL) && (!hasValue(env.DB_HOST) || !hasValue(env.DB_DATABASE) || !hasValue(env.DB_USERNAME))) {
      errors.push('DATABASE_URL or complete DB_* settings are required in production.');
    }
    if (String(env.JWT_SECRET || '').includes('dev_jwt_secret')) {
      warnings.push('JWT_SECRET appears to be a development secret.');
    }
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

module.exports = {
  validateRuntimeConfig,
};

