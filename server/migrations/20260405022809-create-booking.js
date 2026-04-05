'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Bookings', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      resourceType: {
        type: Sequelize.ENUM('equipment', 'room'),
        allowNull: false
      },
      resourceId: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      bookingType: {
        type: Sequelize.ENUM('pencil', 'firm'),
        allowNull: false,
        defaultValue: 'pencil'
      },
      status: {
        type: Sequelize.ENUM('penciled', 'confirmed', 'contested', 'approved', 'denied', 'cancelled', 'expired'),
        allowNull: false,
        defaultValue: 'penciled'
      },
      startTime: {
        type: Sequelize.DATE,
        allowNull: false
      },
      endTime: {
        type: Sequelize.DATE,
        allowNull: false
      },
      purpose: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      authorizationDocUrl: {
        type: Sequelize.STRING,
        allowNull: true
      },
      expiryAt: {
        type: Sequelize.DATE,
        allowNull: true
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    await queryInterface.addIndex('Bookings', ['resourceType', 'resourceId'], {
      name: 'bookings_resource_index'
    });

    await queryInterface.addIndex('Bookings', ['startTime', 'endTime'], {
      name: 'bookings_time_range_index'
    });

    await queryInterface.addIndex('Bookings', ['userId'], {
      name: 'bookings_user_index'
    });

    await queryInterface.addIndex('Bookings', ['status'], {
      name: 'bookings_status_index'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Bookings');
  }
};
