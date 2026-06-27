const path = require('path');
const cliEnvIndex = process.argv.indexOf('--env');
const cliEnvValue = cliEnvIndex >= 0 ? process.argv[cliEnvIndex + 1] : null;
const resolvedEnv = process.env.NODE_ENV || cliEnvValue || 'development';

if (resolvedEnv === 'production') {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env.production') });
  require('dotenv').config({ path: path.resolve(__dirname, '../../.env.production') });
}

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

module.exports = {
  development: {
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 5432,
    dialect: process.env.DB_DIALECT || 'postgres',
    dialectOptions:
      process.env.DB_SSL === 'false'
        ? {}
        : {
            ssl: {
              require: true,
              rejectUnauthorized: false,
            },
          },
    // Blank line after each SQL line for easier terminal scanning (set SEQUELIZE_LOGGING=false to disable).
    logging:
      process.env.SEQUELIZE_LOGGING === 'false'
        ? false
        : (sql) => {
            console.log(sql);
            console.log();
          },
  },
  production: process.env.DATABASE_URL
    ? {
        use_env_variable: 'DATABASE_URL',
        dialect: 'postgres',
        dialectOptions:
          process.env.DB_SSL === 'false'
            ? {}
            : {
                ssl: {
                  require: true,
                  rejectUnauthorized: false,
                },
              },
        logging: false, // Disable SQL logging in production
      }
    : {
        username: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE,
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT) || 5432,
        dialect: process.env.DB_DIALECT || 'postgres',
        dialectOptions:
          process.env.DB_SSL === 'false'
            ? {}
            : {
                ssl: {
                  require: true,
                  rejectUnauthorized: false,
                },
              },
        logging: false, // Disable SQL logging in production
      },
};
