'use strict';

function errorHandler(err, req, res, next) {
  // Log full trace to server console for debugging/diagnostics
  console.error('[Centralized Error Handler]:', err);

  if (res.headersSent) {
    return next(err);
  }

  const isProduction = process.env.NODE_ENV === 'production';

  // Check if it is a Sequelize/SQL/Database-related error
  const isDatabaseError = err.name && (
    err.name.startsWith('Sequelize') || 
    err.name.toLowerCase().includes('database') || 
    err.name.toLowerCase().includes('postgres') ||
    err.name.toLowerCase().includes('sql')
  );

  let statusCode = err.statusCode || err.status || 500;
  let errorMessage = err.message || 'Internal Server Error';
  let errorCode = err.code || 'INTERNAL_SERVER_ERROR';

  // Sanitize database/SQL and internal errors in production to avoid leaking structural info
  if (isProduction) {
    if (isDatabaseError) {
      // Separate database-specific error sanitization
      errorMessage = 'A database error occurred.';
      errorCode = 'DATABASE_ERROR';
      statusCode = 500;
    } else if (statusCode === 500) {
      // Generic 500 internal error sanitization
      errorMessage = 'An internal server error occurred.';
      errorCode = 'INTERNAL_SERVER_ERROR';
    }
  }

  const response = {
    error: errorMessage,
    code: errorCode,
  };

  // Leak stack details only during local development
  if (!isProduction) {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
}

module.exports = { errorHandler };
