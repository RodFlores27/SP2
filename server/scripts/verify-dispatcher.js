require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { sequelize } = require('../models');

async function verify() {
  try {
    const [auditRows] = await sequelize.query('SELECT COUNT(*) as cnt FROM "AuditLogs"');
    console.log('AuditLog row count:', auditRows[0].cnt);

    const [analyticsRows] = await sequelize.query('SELECT COUNT(*) as cnt FROM "BookingAnalyticsEvents"');
    console.log('BookingAnalyticsEvent row count:', analyticsRows[0].cnt);

    const [recentAudit] = await sequelize.query(
      `SELECT "eventId", "eventType", "topic", "partition", "offset", "bookingId", "occurredAt"
       FROM "AuditLogs"
       ORDER BY "createdAt" DESC
       LIMIT 3`
    );
    console.log('\nMost recent AuditLog entries:');
    recentAudit.forEach(r => console.log(' ', JSON.stringify(r)));

    const [recentAnalytics] = await sequelize.query(
      `SELECT "eventId", "eventType", "topic", "partition", "offset", "bookingId", "occurredAt"
       FROM "BookingAnalyticsEvents"
       ORDER BY "createdAt" DESC
       LIMIT 3`
    );
    console.log('\nMost recent BookingAnalyticsEvent entries:');
    recentAnalytics.forEach(r => console.log(' ', JSON.stringify(r)));

    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
}

verify();
