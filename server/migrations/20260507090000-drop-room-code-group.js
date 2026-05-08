'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('Rooms');
    if (table.codeGroup) {
      await queryInterface.removeColumn('Rooms', 'codeGroup');
    }
  },

  async down(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('Rooms');
    if (!table.codeGroup) {
      await queryInterface.addColumn('Rooms', 'codeGroup', {
        type: Sequelize.STRING(64),
        allowNull: true,
      });
    }
  },
};

