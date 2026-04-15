const cliEnvIndex = process.argv.indexOf('--env');
const cliEnvValue = cliEnvIndex >= 0 ? process.argv[cliEnvIndex + 1] : null;
const resolvedEnv = process.env.NODE_ENV || cliEnvValue || 'development';
const envFile = resolvedEnv === 'production' ? '.env.production' : '.env';

require('dotenv').config({ path: envFile });
require('dotenv').config();

module.exports = {
  development: {
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 5432,
    dialect: process.env.DB_DIALECT || 'postgres',
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    },
  },
  production: {
    use_env_variable: 'DATABASE_URL',
    dialect: 'postgres',
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    },
    logging: false, // Disable SQL logging in production
  },
};
