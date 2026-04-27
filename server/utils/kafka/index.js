module.exports = {
  ...require('./producer'),
  ...require('./booking-events'),
  ...require('./notification-consumer'),
  ...require('./audit-consumer'),
  ...require('./analytics-consumer'),
};
