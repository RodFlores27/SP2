module.exports = {
  ...require('./producer'),
  ...require('./booking-events'),
  ...require('./notification-consumer'),
};
