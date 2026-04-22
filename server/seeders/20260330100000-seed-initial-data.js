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
      {
        email: 'researcher1@uplb.edu.ph',
        passwordHash: regularUserPassword,
        accountType: 'regular_user',
        userCategory: 'graduate_student',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        email: 'researcher2@uplb.edu.ph',
        passwordHash: regularUserPassword,
        accountType: 'regular_user',
        userCategory: 'faculty',
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

    const users = await queryInterface.sequelize.query(
      'SELECT id, email FROM "Users" ORDER BY id ASC;',
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );
    const equipment = await queryInterface.sequelize.query(
      'SELECT id, name FROM "Equipment" ORDER BY id ASC;',
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );
    const rooms = await queryInterface.sequelize.query(
      'SELECT id, name FROM "Rooms" ORDER BY id ASC;',
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );

    const studentId = users.find((u) => u.email === 'student@uplb.edu.ph')?.id;
    const staffId = users.find((u) => u.email === 'staff@uplb.edu.ph')?.id;
    const adminId = users.find((u) => u.email === 'admin@uplb.edu.ph')?.id;
    const laminarFlowHoodId = equipment.find((e) => e.name === 'Laminar Flow Hood')?.id;
    const cultureRoomAId = rooms.find((r) => r.name === 'Culture Room A')?.id;

    if (!studentId || !staffId || !adminId || !laminarFlowHoodId || !cultureRoomAId) {
      throw new Error('Required seed references for initial bookings were not found.');
    }

    const now = new Date();
    const createDateAtTime = (daysFromNow, hours, minutes = 0) => {
      const date = new Date(now);
      date.setDate(date.getDate() + daysFromNow);
      date.setHours(hours, minutes, 0, 0);
      return date;
    };
    const computePencilExpiry = (issuedAt, startTime) => {
      const byLifetime = new Date(issuedAt.getTime() + 3 * 24 * 60 * 60 * 1000);
      const byLockWindow = new Date(new Date(startTime).getTime() - 24 * 60 * 60 * 1000);
      return byLifetime < byLockWindow ? byLifetime : byLockWindow;
    };

    const pencilStart = createDateAtTime(2, 9, 0);
    const approvedStart = createDateAtTime(3, 13, 0);

    const bookingRows = [
      {
        userId: studentId,
        resourceType: 'equipment',
        resourceId: laminarFlowHoodId,
        bookingType: 'pencil',
        status: 'penciled',
        startTime: pencilStart,
        endTime: new Date(pencilStart.getTime() + 2 * 60 * 60 * 1000),
        purpose: 'Initial seeded pencil booking sample',
        authorizationDocUrl: null,
        approvedByUserId: null,
        approvedAt: null,
        expiryAt: computePencilExpiry(now, pencilStart),
        createdAt: now,
        updatedAt: now,
      },
      {
        userId: staffId,
        resourceType: 'room',
        resourceId: cultureRoomAId,
        bookingType: 'firm',
        status: 'approved',
        startTime: approvedStart,
        endTime: new Date(approvedStart.getTime() + 3 * 60 * 60 * 1000),
        purpose: 'Initial seeded approved firm booking sample',
        authorizationDocUrl: 'https://res.cloudinary.com/demo/sample.pdf',
        approvedByUserId: adminId,
        approvedAt: new Date(now.getTime() - 60 * 60 * 1000),
        expiryAt: null,
        createdAt: now,
        updatedAt: now,
      },
    ];

    for (const row of bookingRows) {
      const inserted = await queryInterface.sequelize.query(
        `INSERT INTO "Bookings" (
          "userId", "resourceType", "resourceId", "bookingType", "status",
          "startTime", "endTime", "purpose", "authorizationDocUrl",
          "approvedByUserId", "approvedAt", "expiryAt",
          "createdAt", "updatedAt", "bookingThreadId"
        ) VALUES (
          :userId, :resourceType, :resourceId, :bookingType, :status,
          :startTime, :endTime, :purpose, :authorizationDocUrl,
          :approvedByUserId, :approvedAt, :expiryAt,
          :createdAt, :updatedAt, 0
        ) RETURNING id`,
        {
          replacements: row,
          type: Sequelize.QueryTypes.SELECT,
        }
      );
      const id = inserted[0].id;
      await queryInterface.sequelize.query(
        `UPDATE "Bookings" SET "bookingThreadId" = :id WHERE id = :id`,
        { replacements: { id } }
      );
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('Bookings', null, {});
    await queryInterface.bulkDelete('Users', null, {});
    await queryInterface.bulkDelete('Equipment', null, {});
    await queryInterface.bulkDelete('Rooms', null, {});
  }
};
