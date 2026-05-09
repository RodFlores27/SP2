'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('Rooms');
    if (!table.zone) {
      await queryInterface.addColumn('Rooms', 'zone', {
        type: Sequelize.STRING(64),
        allowNull: true,
      });
    }
    if (!table.ppe) {
      await queryInterface.addColumn('Rooms', 'ppe', {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const table = await queryInterface.describeTable('Rooms');
    if (table.ppe) {
      await queryInterface.removeColumn('Rooms', 'ppe');
    }
    if (table.zone) {
      await queryInterface.removeColumn('Rooms', 'zone');
    }
  },
};

