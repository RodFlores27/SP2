'use strict';

/**
 * Deletes all Supabase Auth users in the configured Supabase project.
 *
 * Local:
 *   cd server
 *   npm run clear:supabase-auth
 *
 * Production requires explicit consent:
 *   $env:ALLOW_MVP_DEMO_RESET="1"
 *   $env:NODE_ENV="production"
 *   npm run clear:supabase-auth
 */

const resolvedEnv =
  process.env.NODE_ENV ||
  (process.env.ALLOW_MVP_DEMO_RESET === '1' ? 'production' : 'development');
const envFile = resolvedEnv === 'production' ? '.env.production' : '.env';

require('dotenv').config({ path: envFile });
require('dotenv').config();

const { clearSupabaseAuthUsers } = require('./supabase-auth-admin');

(async () => {
  const env = process.env.NODE_ENV || resolvedEnv;
  if (env === 'production' && process.env.ALLOW_MVP_DEMO_RESET !== '1') {
    console.error(
      'Refusing to clear Supabase Auth users: production requires ALLOW_MVP_DEMO_RESET=1.'
    );
    process.exit(1);
  }

  try {
    const result = await clearSupabaseAuthUsers();
    if (!result.skipped) {
      console.log(`Cleared ${result.deleted} Supabase Auth user(s).`);
    }
  } catch (error) {
    console.error('Supabase Auth clear failed:', error.message);
    process.exitCode = 1;
  }
})();
