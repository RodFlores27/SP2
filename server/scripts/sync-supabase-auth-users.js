/**
 * Creates or updates Supabase Auth users for local demo Users rows.
 *
 * Required server/.env values:
 *   AUTH_PROVIDER=supabase
 *   SUPABASE_URL=...
 *   SUPABASE_ANON_KEY=...
 *   SUPABASE_SERVICE_ROLE_KEY=...
 *
 * Run after local users are seeded:
 *   cd server
 *   npm run sync:supabase-auth
 */
const resolvedEnv =
  process.env.NODE_ENV ||
  (process.env.ALLOW_MVP_DEMO_RESET === '1' ? 'production' : 'development');
const envFile = resolvedEnv === 'production' ? '.env.production' : '.env';

require('dotenv').config({ path: envFile });
require('dotenv').config();

const path = require('path');
const { User, sequelize } = require(path.join(__dirname, '..', 'models'));
const {
  createSupabaseAdminClient,
  isSupabaseAuthEnabled,
} = require('../utils/supabase-auth');
const { listAllAuthUsers } = require('./supabase-auth-admin');

const DEMO_PASSWORDS = {
  'student@uplb.edu.ph': 'password123',
  'staff@uplb.edu.ph': 'staff123',
  'admin@uplb.edu.ph': 'admin123',
  'researcher1@uplb.edu.ph': 'password123',
  'researcher2@uplb.edu.ph': 'password123',
};

const DEFAULT_PASSWORD = process.env.SUPABASE_DEMO_DEFAULT_PASSWORD || 'password123';

function passwordFor(email) {
  return DEMO_PASSWORDS[email] || DEFAULT_PASSWORD;
}

(async () => {
  if (!isSupabaseAuthEnabled()) {
    console.log('AUTH_PROVIDER is not "supabase"; skipping Supabase Auth sync.');
    return;
  }

  try {
    await sequelize.authenticate();
    const admin = createSupabaseAdminClient();
    const authUsers = await listAllAuthUsers(admin);
    const authByEmail = new Map(
      authUsers
        .filter((user) => user.email)
        .map((user) => [String(user.email).trim().toLowerCase(), user])
    );

    const users = await User.findAll({
      order: [['id', 'ASC']],
    });

    for (const user of users) {
      const email = String(user.email || '').trim().toLowerCase();
      if (!email) continue;

      let authUser = authByEmail.get(email);
      if (!authUser) {
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password: passwordFor(email),
          email_confirm: true,
        });
        if (error) throw error;
        authUser = data.user;
        console.log(`Created Supabase Auth user: ${email}`);
      } else {
        const { error } = await admin.auth.admin.updateUserById(authUser.id, {
          password: passwordFor(email),
          email_confirm: true,
        });
        if (error) throw error;
        console.log(`Updated Supabase Auth user password: ${email}`);
      }

      if (authUser?.id && user.supabaseAuthId !== authUser.id) {
        user.supabaseAuthId = authUser.id;
        if (user.passwordHash) user.passwordHash = null;
        await user.save();
        console.log(`Linked local User #${user.id} to Supabase Auth ${authUser.id}`);
      }
    }

    console.log('Supabase Auth sync complete.');
  } catch (error) {
    console.error('Supabase Auth sync failed:', error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
})();
