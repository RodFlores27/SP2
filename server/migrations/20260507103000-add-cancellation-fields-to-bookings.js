'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('Bookings');
    if (!table.cancellationReason) {
      await queryInterface.addColumn('Bookings', 'cancellationReason', {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }
    if (!table.probableRebookDate) {
      await queryInterface.addColumn('Bookings', 'probableRebookDate', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('Bookings', 'probableRebookDate');
    await queryInterface.removeColumn('Bookings', 'cancellationReason');
  },
};

