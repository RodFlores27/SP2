'use strict';

const {
  createSupabaseAdminClient,
  isSupabaseAuthEnabled,
} = require('../utils/supabase-auth');

async function listAllAuthUsers(admin) {
  const users = [];
  const perPage = 1000;
  let page = 1;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const pageUsers = data.users || [];
    users.push(...pageUsers);
    if (pageUsers.length < perPage) break;
    page += 1;
  }

  return users;
}

async function clearSupabaseAuthUsers({ logger = console } = {}) {
  if (!isSupabaseAuthEnabled()) {
    logger.log('AUTH_PROVIDER is not "supabase"; skipping Supabase Auth clear.');
    return { deleted: 0, skipped: true };
  }

  const admin = createSupabaseAdminClient();
  const users = await listAllAuthUsers(admin);

  for (const user of users) {
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw error;
    logger.log(`Deleted Supabase Auth user: ${user.email || user.id}`);
  }

  return { deleted: users.length, skipped: false };
}

module.exports = {
  clearSupabaseAuthUsers,
  listAllAuthUsers,
};
