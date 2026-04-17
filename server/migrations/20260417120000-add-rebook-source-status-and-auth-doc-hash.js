'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Bookings', 'rebookedFromStatus', {
      type: Sequelize.STRING,
      allowNull: true,
    });

    await queryInterface.addColumn('Bookings', 'authorizationDocHash', {
      type: Sequelize.STRING(64),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('Bookings', 'authorizationDocHash');
    await queryInterface.removeColumn('Bookings', 'rebookedFromStatus');
  },
};
