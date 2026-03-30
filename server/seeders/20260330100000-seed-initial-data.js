'use strict';

const bcrypt = require('bcrypt');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const saltRounds = 12;

    // Hash passwords for test users
    const regularUserPassword = await bcrypt.hash('password123', saltRounds);
    const staffPassword = await bcrypt.hash('staff123', saltRounds);
    const adminPassword = await bcrypt.hash('admin123', saltRounds);

    // Seed 3 test users (one per role)
    await queryInterface.bulkInsert('Users', [
      {
        email: 'student@uplb.edu.ph',
        passwordHash: regularUserPassword,
        accountType: 'regular_user',
        userCategory: 'student',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        email: 'staff@uplb.edu.ph',
        passwordHash: staffPassword,
        accountType: 'ptcf_staff',
        userCategory: 'lab_technician',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        email: 'admin@uplb.edu.ph',
        passwordHash: adminPassword,
        accountType: 'system_admin',
        userCategory: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ], {});

    // Seed 3 equipment rows
    await queryInterface.bulkInsert('Equipment', [
      {
        name: 'Laminar Flow Hood',
        category: 'Sterilization Equipment',
        description: 'Class II Biological Safety Cabinet for sterile tissue culture work',
        imageUrl: null,
        status: 'available',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        name: 'Autoclave',
        category: 'Sterilization Equipment',
        description: 'High-pressure steam sterilizer for media and glassware',
        imageUrl: null,
        status: 'available',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        name: 'Growth Chamber',
        category: 'Incubation Equipment',
        description: 'Temperature and light-controlled chamber for plant tissue culture',
        imageUrl: null,
        status: 'available',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ], {});

    // Seed 2 room rows
    await queryInterface.bulkInsert('Rooms', [
      {
        name: 'Culture Room A',
        description: 'Primary tissue culture laboratory with laminar flow hoods',
        location: 'ICropS Building, 2nd Floor',
        capacity: 8,
        status: 'available',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        name: 'Preparation Room',
        description: 'Media preparation and sterilization area',
        location: 'ICropS Building, 2nd Floor',
        capacity: 4,
        status: 'available',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ], {});
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('Users', null, {});
    await queryInterface.bulkDelete('Equipment', null, {});
    await queryInterface.bulkDelete('Rooms', null, {});
  }
};
