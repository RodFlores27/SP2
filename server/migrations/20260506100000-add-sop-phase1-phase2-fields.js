'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const table = await queryInterface.describeTable('Bookings');

    if (!table.equipmentRequestType) {
      await queryInterface.addColumn('Bookings', 'equipmentRequestType', {
        type: Sequelize.ENUM('in_house', 'loan'),
        allowNull: true,
      });
    }
    if (!table.loanReason) {
      await queryInterface.addColumn('Bookings', 'loanReason', {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }
    if (!table.loanWorkflowNote) {
      await queryInterface.addColumn('Bookings', 'loanWorkflowNote', {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }
    if (!table.loanTransportPlan) {
      await queryInterface.addColumn('Bookings', 'loanTransportPlan', {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }
    if (!table.roomParticipantCount) {
      await queryInterface.addColumn('Bookings', 'roomParticipantCount', {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }
    if (!table.roomEquipmentNeeds) {
      await queryInterface.addColumn('Bookings', 'roomEquipmentNeeds', {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }
    if (!table.roomSetupRequirements) {
      await queryInterface.addColumn('Bookings', 'roomSetupRequirements', {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }
    if (!table.roomProgramDetails) {
      await queryInterface.addColumn('Bookings', 'roomProgramDetails', {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }

    await queryInterface.changeColumn('Equipment', 'resourceCode', {
      type: Sequelize.STRING(64),
      allowNull: true,
    });
    await queryInterface.changeColumn('Rooms', 'resourceCode', {
      type: Sequelize.STRING(64),
      allowNull: true,
    });
    await queryInterface.changeColumn('BookingReferenceSequences', 'resourceCode', {
      type: Sequelize.STRING(64),
      allowNull: false,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('BookingReferenceSequences', 'resourceCode', {
      type: Sequelize.STRING(16),
      allowNull: false,
    });
    await queryInterface.changeColumn('Rooms', 'resourceCode', {
      type: Sequelize.STRING(16),
      allowNull: true,
    });
    await queryInterface.changeColumn('Equipment', 'resourceCode', {
      type: Sequelize.STRING(16),
      allowNull: true,
    });

    await queryInterface.removeColumn('Bookings', 'roomProgramDetails');
    await queryInterface.removeColumn('Bookings', 'roomSetupRequirements');
    await queryInterface.removeColumn('Bookings', 'roomEquipmentNeeds');
    await queryInterface.removeColumn('Bookings', 'roomParticipantCount');
    await queryInterface.removeColumn('Bookings', 'loanTransportPlan');
    await queryInterface.removeColumn('Bookings', 'loanWorkflowNote');
    await queryInterface.removeColumn('Bookings', 'loanReason');
    await queryInterface.removeColumn('Bookings', 'equipmentRequestType');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_Bookings_equipmentRequestType";');
  },
};

