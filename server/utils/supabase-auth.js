'use strict';

const { createClient } = require('@supabase/supabase-js');

function isSupabaseAuthEnabled() {
  return String(process.env.AUTH_PROVIDER || '').toLowerCase() === 'supabase';
}

function getSupabaseUrl() {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
}

function getSupabaseAnonKey() {
  return (
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    ''
  );
}

function getSupabaseServiceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

let authSettingsCache = null;
let authSettingsCacheExpiresAt = 0;

function assertSupabaseClientConfig({ requireServiceRole = false } = {}) {
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  const serviceRoleKey = getSupabaseServiceRoleKey();

  if (!url || !anonKey) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required for Supabase Auth');
  }
  if (requireServiceRole && !serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for this Supabase Auth operation');
  }
}

function createSupabaseAuthClient() {
  assertSupabaseClientConfig();
  return createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function createSupabaseAdminClient() {
  assertSupabaseClientConfig({ requireServiceRole: true });
  return createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function getSupabaseAuthSettings({ forceRefresh = false } = {}) {
  assertSupabaseClientConfig();

  const now = Date.now();
  if (!forceRefresh && authSettingsCache && authSettingsCacheExpiresAt > now) {
    return authSettingsCache;
  }

  const url = `${getSupabaseUrl().replace(/\/$/, '')}/auth/v1/settings`;
  const anonKey = getSupabaseAnonKey();
  const response = await fetch(url, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Unable to read Supabase Auth settings (${response.status})`);
  }

  authSettingsCache = await response.json();
  authSettingsCacheExpiresAt = now + 60_000;
  return authSettingsCache;
}

module.exports = {
  assertSupabaseClientConfig,
  createSupabaseAdminClient,
  createSupabaseAuthClient,
  getSupabaseAuthSettings,
  getSupabaseAnonKey,
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
  isSupabaseAuthEnabled,
};
