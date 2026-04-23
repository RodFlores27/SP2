'use strict';

/** @param {import('sequelize').QueryInterface} queryInterface */
async function columnExists(queryInterface, tableName, columnName) {
  const [rows] = await queryInterface.sequelize.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = :t AND column_name = :c LIMIT 1`,
    { replacements: { t: tableName, c: columnName } }
  );
  return rows.length > 0;
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    if (await columnExists(queryInterface, 'Bookings', 'queuePosition')) {
      await queryInterface.removeColumn('Bookings', 'queuePosition');
    }
    if (await columnExists(queryInterface, 'Bookings', 'contentionGroupId')) {
      await queryInterface.removeColumn('Bookings', 'contentionGroupId');
    }
  },

  async down(queryInterface, Sequelize) {
    if (!(await columnExists(queryInterface, 'Bookings', 'contentionGroupId'))) {
      await queryInterface.addColumn('Bookings', 'contentionGroupId', {
        type: Sequelize.INTEGER,
        allowNull: true
      });
    }
    if (!(await columnExists(queryInterface, 'Bookings', 'queuePosition'))) {
      await queryInterface.addColumn('Bookings', 'queuePosition', {
        type: Sequelize.INTEGER,
        allowNull: true
      });
    }
  }
};
