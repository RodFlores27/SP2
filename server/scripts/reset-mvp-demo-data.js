/**
 * Wipes MVP application data: Bookings, Users, Equipment, Rooms.
 * Clears Sequelize CLI seed history (SequelizeData) when present so `db:seed:all` can run again.
 * Does not modify SequelizeMeta (migrations).
 *
 * Local (uses .env with DB_* or DATABASE_URL if NODE_ENV=production):
 *   cd server && npm run reset:mvp-demo
 *
 * Production Supabase (requires explicit consent flag):
 *   # PowerShell
 *   cd server
 *   $env:ALLOW_MVP_DEMO_RESET="1"
 *   npm run reset:mvp-demo
 *   npx sequelize-cli db:migrate --env production
 *   npx sequelize-cli db:seed:all --env production
 *
 *   # CMD
 *   cd server
 *   set ALLOW_MVP_DEMO_RESET=1
 *   npm run reset:mvp-demo
 *   npx sequelize-cli db:migrate --env production
 *   npx sequelize-cli db:seed:all --env production
 */
const resolvedEnv =
  process.env.NODE_ENV ||
  (process.env.ALLOW_MVP_DEMO_RESET === '1' ? 'production' : 'development');
const envFile = resolvedEnv === 'production' ? '.env.production' : '.env';

require('dotenv').config({ path: envFile });
require('dotenv').config();

const path = require('path');
const { sequelize } = require(path.join(__dirname, '..', 'models'));

function isUndefinedTable(err) {
  const code = err?.parent?.code || err?.original?.code;
  return code === '42P01';
}

(async () => {
  const env = process.env.NODE_ENV || resolvedEnv;
  if (env === 'production' && process.env.ALLOW_MVP_DEMO_RESET !== '1') {
    console.error(
      'Refusing to reset: production requires ALLOW_MVP_DEMO_RESET=1 (and DATABASE_URL).'
    );
    process.exit(1);
  }

  try {
    await sequelize.authenticate();

    await sequelize.transaction(async (transaction) => {
      await sequelize.query('DELETE FROM "Bookings"', { transaction });
      await sequelize.query('DELETE FROM "Users"', { transaction });
      await sequelize.query('DELETE FROM "Equipment"', { transaction });
      await sequelize.query('DELETE FROM "Rooms"', { transaction });
    });

    try {
      await sequelize.query('DELETE FROM "SequelizeData"');
      console.log('Cleared SequelizeData (seed history).');
    } catch (err) {
      if (!isUndefinedTable(err)) throw err;
      console.log('SequelizeData table not found — skipping seed history clear.');
    }

    console.log('MVP demo reset complete.');
    console.log('Next: npx sequelize-cli db:seed:all --env production');
    console.log('  (or --env development for local DB)');
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
})();
