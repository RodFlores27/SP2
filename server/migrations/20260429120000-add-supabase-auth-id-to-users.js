'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Users', 'supabaseAuthId', {
      type: Sequelize.UUID,
      allowNull: true,
    });

    await queryInterface.addIndex('Users', ['supabaseAuthId'], {
      name: 'users_supabase_auth_id_index',
      unique: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('Users', 'users_supabase_auth_id_index');
    await queryInterface.removeColumn('Users', 'supabaseAuthId');
  },
};
