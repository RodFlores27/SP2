'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const addColumnIfMissing = async (table, column, definition) => {
      const tableDefinition = await queryInterface.describeTable(table);
      if (!tableDefinition[column]) {
        await queryInterface.addColumn(table, column, definition);
      }
    };

    await addColumnIfMissing('Bookings', 'warning48SentAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await addColumnIfMissing('Bookings', 'warning24SentAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    const removeColumnIfPresent = async (table, column) => {
      const tableDefinition = await queryInterface.describeTable(table);
      if (tableDefinition[column]) {
        await queryInterface.removeColumn(table, column);
      }
    };

    await removeColumnIfPresent('Bookings', 'warning24SentAt');
    await removeColumnIfPresent('Bookings', 'warning48SentAt');
  },
};
