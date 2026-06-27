const path = require('path');
if (process.env.NODE_ENV === 'production') {
  require('dotenv').config({ path: path.resolve(__dirname, '.env.production') });
  require('dotenv').config({ path: path.resolve(__dirname, '../.env.production') });
}
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./docs/swagger.json');
const { devHttpErrorLog } = require('./middleware/dev-http-error-log.middleware');
const kafkaConfig = require('./config/kafka');
const { validateRuntimeConfig } = require('./config/runtime-check');

const app = express();
const PORT = process.env.PORT || 4000;

app.set('trust proxy', 1);

// Configure CORS
const isProduction = process.env.NODE_ENV === 'production';
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : (isProduction
      ? [process.env.FRONTEND_URL].filter(Boolean)
      : [process.env.FRONTEND_URL || 'http://localhost:5173', 'http://localhost:5173', 'http://127.0.0.1:5173']
    );

if (isProduction && allowedOrigins.length === 0) {
  console.warn(
    '[CORS] WARNING: Running in production mode but no CORS origins are configured via CORS_ORIGIN or FRONTEND_URL. All cross-origin browser requests will be blocked.'
  );
}

app.use(
  cors({ 
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, postman)
      if (!origin) return callback(null, true);

      const isAllowed = allowedOrigins.some((allowed) => {
        if (allowed === '*') return true;
        return allowed === origin;
      });

      if (isAllowed) {
        callback(null, true);
      } else {
        console.warn('[CORS Blocked] Request origin: ' + origin);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  })
);

// Configure Helmet with secure CSP headers compatible with Swagger UI
const helmet = require('helmet');
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "res.cloudinary.com"],
        connectSrc: ["'self'"],
      },
    },
  })
);

const httpLogStream = {
  write(message) {
    const m = typeof message === 'string' ? message : String(message);
    process.stdout.write(m.endsWith('\n') ? `${m}\n` : `${m}\n\n`);
  },
};
app.use(
  morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev', {
    stream: httpLogStream,
  })
);
app.use(express.json());
app.use(devHttpErrorLog);

// Swagger API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Routes
const authRoutes = require('./routes/auth.routes');
const equipmentRoutes = require('./routes/equipment.routes');
const roomRoutes = require('./routes/room.routes');
const bookingRoutes = require('./routes/booking.routes');
const adminRoutes = require('./routes/admin.routes');

app.use('/api/auth', authRoutes);
app.use('/api/equipment', equipmentRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'PTCF server is running' });
});

// Centralized error handling middleware
const { errorHandler } = require('./middleware/error-handler');
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`API Documentation: http://localhost:${PORT}/api-docs`);
});

// DB connection
const { sequelize } = require('./models');

sequelize.authenticate()
  .then(() => {
    console.log('DB connection OK');
    const runtime = validateRuntimeConfig();
    if (runtime.warnings.length > 0) {
      runtime.warnings.forEach((warning) => {
        console.warn(`[runtime] Warning: ${warning}`);
      });
    }
    if (!runtime.valid) {
      runtime.errors.forEach((error) => {
        console.error(`[runtime] Config error: ${error}`);
      });
      console.warn(
        '[runtime] Invalid configuration detected. Server will continue running in degraded mode where possible.'
      );
    }
    require('./jobs/booking-expiry');
    const {
      connectKafkaProducer,
      isKafkaEnabled,
      startAuditConsumer,
      startAnalyticsConsumer,
      startNotificationConsumer,
    } = require('./utils/kafka');
    if (isKafkaEnabled()) {
      const validation = kafkaConfig.validateKafkaConfig();
      console.log(`[kafka] Mode: ${validation.mode}`);
      console.log(`[kafka] SSL CA configured: ${kafkaConfig.sslCaConfigured ? 'yes' : 'no'}`);
      if (validation.warnings.length > 0) {
        validation.warnings.forEach((warning) => {
          console.warn(`[kafka] Warning: ${warning}`);
        });
      }
      if (!validation.valid) {
        validation.errors.forEach((error) => {
          console.error(`[kafka] Config error: ${error}`);
        });
        console.warn(
          '[kafka] Invalid configuration detected. Booking writes will continue, but Kafka side effects are starting in degraded mode.'
        );
      }
      connectKafkaProducer().then((result) => {
        if (!result.connected) {
          console.warn('[kafka] Server continuing without Kafka producer connection');
        }
      });
      startNotificationConsumer().then((result) => {
        if (!result.connected) {
          console.warn('[kafka:notification] Server continuing without notification consumer');
        }
      });
      startAuditConsumer().then((result) => {
        if (!result.connected) {
          console.warn('[kafka:audit] Server continuing without audit consumer');
        }
      });
      startAnalyticsConsumer().then((result) => {
        if (!result.connected) {
          console.warn('[kafka:analytics] Server continuing without analytics consumer');
        }
      });
    } else {
      console.log('[events] Kafka disabled \u2014 using in-process event dispatcher');
      const dispatcher = require('./utils/event-dispatcher');
      const { processAuditEvent } = require('./utils/kafka/audit-consumer');
      const { processAnalyticsEvent } = require('./utils/kafka/analytics-consumer');

      dispatcher.on('booking-event', async (event) => {
        // Promise.allSettled so one handler failure never blocks the other.
        const [auditResult, analyticsResult] = await Promise.allSettled([
          processAuditEvent(event),
          processAnalyticsEvent(event),
        ]);

        if (auditResult.status === 'rejected') {
          console.error('[events:audit] Handler threw unexpectedly:', auditResult.reason);
        }
        if (analyticsResult.status === 'rejected') {
          console.error('[events:analytics] Handler threw unexpectedly:', analyticsResult.reason);
        }
      });

      console.log('[events] In-process handlers registered: audit, analytics');
    }
  })
  .catch(err => console.error('DB connection error:', err));
