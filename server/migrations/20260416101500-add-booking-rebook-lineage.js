'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Bookings', 'rebookedFromBookingId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'Bookings',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    await queryInterface.addColumn('Bookings', 'bookingThreadId', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    await queryInterface.sequelize.query(`
      UPDATE "Bookings"
      SET "bookingThreadId" = "id"
      WHERE "bookingThreadId" IS NULL
    `);

    await queryInterface.changeColumn('Bookings', 'bookingThreadId', {
      type: Sequelize.INTEGER,
      allowNull: false,
    });

    await queryInterface.addIndex('Bookings', ['rebookedFromBookingId'], {
      name: 'bookings_rebooked_from_index',
    });

    await queryInterface.addIndex('Bookings', ['bookingThreadId'], {
      name: 'bookings_thread_index',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('Bookings', 'bookings_thread_index');
    await queryInterface.removeIndex('Bookings', 'bookings_rebooked_from_index');
    await queryInterface.removeColumn('Bookings', 'bookingThreadId');
    await queryInterface.removeColumn('Bookings', 'rebookedFromBookingId');
  },
};
