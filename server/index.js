require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./docs/swagger.json');
const { devHttpErrorLog } = require('./middleware/dev-http-error-log.middleware');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());

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

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`API Documentation: http://localhost:${PORT}/api-docs`);
});

// DB connection
const { sequelize } = require('./models');

sequelize.authenticate()
  .then(() => {
    console.log('DB connection OK');
    require('./jobs/booking-expiry');
    const {
      connectKafkaProducer,
      isKafkaEnabled,
      startNotificationConsumer,
    } = require('./utils/kafka');
    if (isKafkaEnabled()) {
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
    } else {
      console.log('[kafka] Disabled (set KAFKA_ENABLED=true to enable)');
    }
  })
  .catch(err => console.error('DB connection error:', err));
