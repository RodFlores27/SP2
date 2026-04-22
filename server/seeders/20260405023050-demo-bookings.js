'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();
    
    // Helper function to create date at specific time
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
    
    const tomorrow = createDateAtTime(1, 9, 0); // 9:00 AM tomorrow
    const twoDaysLater = createDateAtTime(2, 9, 0); // 9:00 AM
    const threeDaysLater = createDateAtTime(3, 9, 0); // 9:00 AM
    const fourDaysLater = createDateAtTime(4, 9, 0); // 9:00 AM
    const fiveDaysLater = createDateAtTime(5, 9, 0); // 9:00 AM
    const sixDaysLater = createDateAtTime(6, 10, 0);
    const sevenDaysLater = createDateAtTime(7, 13, 0);

    // Get actual user IDs from database
    const users = await queryInterface.sequelize.query(
      'SELECT id, email FROM "Users" ORDER BY id ASC;',
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );
    
    const studentId = users.find(u => u.email === 'student@uplb.edu.ph')?.id;
    const staffId = users.find(u => u.email === 'staff@uplb.edu.ph')?.id;
    const adminId = users.find(u => u.email === 'admin@uplb.edu.ph')?.id;
    const researcher1Id = users.find(u => u.email === 'researcher1@uplb.edu.ph')?.id;

    if (!studentId || !staffId || !adminId || !researcher1Id) {
      throw new Error('Required users not found. Please run initial data seeder first.');
    }

    const equipment = await queryInterface.sequelize.query(
      'SELECT id, name FROM "Equipment" ORDER BY id ASC;',
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );

    const rooms = await queryInterface.sequelize.query(
      'SELECT id, name FROM "Rooms" ORDER BY id ASC;',
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );

    const laminarFlowHoodId = equipment.find(e => e.name === 'Laminar Flow Hood')?.id;
    const autoclaveId = equipment.find(e => e.name === 'Autoclave')?.id;
    const growthChamberId = equipment.find(e => e.name === 'Growth Chamber')?.id;
    const cultureRoomAId = rooms.find(r => r.name === 'Culture Room A')?.id;
    const preparationRoomId = rooms.find(r => r.name === 'Preparation Room')?.id;

    if (
      !laminarFlowHoodId ||
      !autoclaveId ||
      !growthChamberId ||
      !cultureRoomAId ||
      !preparationRoomId
    ) {
      throw new Error('Required equipment/rooms not found. Please run initial data seeder first.');
    }

    const bookingRows = [
      {
        userId: studentId,
        resourceType: 'equipment',
        resourceId: laminarFlowHoodId,
        bookingType: 'pencil',
        status: 'penciled',
        startTime: tomorrow,
        endTime: new Date(tomorrow.getTime() + 2 * 60 * 60 * 1000),
        purpose: 'Research experiment for plant tissue culture',
        authorizationDocUrl: null,
        approvedByUserId: null,
        approvedAt: null,
        expiryAt: computePencilExpiry(now, tomorrow),
        createdAt: now,
        updatedAt: now
      },
      {
        userId: staffId,
        resourceType: 'room',
        resourceId: cultureRoomAId,
        bookingType: 'firm',
        status: 'approved',
        startTime: twoDaysLater,
        endTime: new Date(twoDaysLater.getTime() + 4 * 60 * 60 * 1000),
        purpose: 'Lab session for CMSC 190 students',
        authorizationDocUrl: 'https://res.cloudinary.com/demo/sample.pdf',
        approvedByUserId: adminId,
        approvedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        expiryAt: null,
        createdAt: now,
        updatedAt: now
      },
      {
        userId: studentId,
        resourceType: 'equipment',
        resourceId: autoclaveId,
        bookingType: 'pencil',
        status: 'contested',
        startTime: threeDaysLater,
        endTime: new Date(threeDaysLater.getTime() + 3 * 60 * 60 * 1000),
        purpose: 'Testing new culture medium',
        authorizationDocUrl: null,
        approvedByUserId: null,
        approvedAt: null,
        expiryAt: computePencilExpiry(now, threeDaysLater),
        createdAt: now,
        updatedAt: now
      },
      {
        userId: adminId,
        resourceType: 'equipment',
        resourceId: autoclaveId,
        bookingType: 'pencil',
        status: 'penciled',
        startTime: new Date(threeDaysLater.getTime() + 1 * 60 * 60 * 1000),
        endTime: new Date(threeDaysLater.getTime() + 4 * 60 * 60 * 1000),
        purpose: 'Equipment calibration and testing',
        authorizationDocUrl: null,
        approvedByUserId: null,
        approvedAt: null,
        expiryAt: computePencilExpiry(now, new Date(threeDaysLater.getTime() + 1 * 60 * 60 * 1000)),
        createdAt: now,
        updatedAt: now
      },
      {
        userId: staffId,
        resourceType: 'room',
        resourceId: preparationRoomId,
        bookingType: 'firm',
        status: 'approved',
        startTime: fourDaysLater,
        endTime: new Date(fourDaysLater.getTime() + 6 * 60 * 60 * 1000),
        purpose: 'Workshop on tissue culture techniques',
        authorizationDocUrl: 'https://res.cloudinary.com/demo/authorization.pdf',
        approvedByUserId: adminId,
        approvedAt: new Date(now.getTime() - 90 * 60 * 1000),
        expiryAt: null,
        createdAt: now,
        updatedAt: now
      },
      {
        userId: studentId,
        resourceType: 'room',
        resourceId: cultureRoomAId,
        bookingType: 'pencil',
        status: 'penciled',
        startTime: fiveDaysLater,
        endTime: new Date(fiveDaysLater.getTime() + 2 * 60 * 60 * 1000),
        purpose: 'Thesis defense preparation',
        authorizationDocUrl: null,
        approvedByUserId: null,
        approvedAt: null,
        expiryAt: computePencilExpiry(now, fiveDaysLater),
        createdAt: now,
        updatedAt: now
      },
      {
        userId: studentId,
        resourceType: 'equipment',
        resourceId: growthChamberId,
        bookingType: 'firm',
        status: 'pending_approval',
        startTime: sixDaysLater,
        endTime: new Date(sixDaysLater.getTime() + 3 * 60 * 60 * 1000),
        purpose: 'Sterilized incubation run — awaiting staff approval',
        authorizationDocUrl: 'https://res.cloudinary.com/demo/sample.pdf',
        approvedByUserId: null,
        approvedAt: null,
        expiryAt: null,
        createdAt: now,
        updatedAt: now
      },
      {
        userId: researcher1Id,
        resourceType: 'equipment',
        resourceId: growthChamberId,
        bookingType: 'pencil',
        status: 'penciled',
        startTime: sevenDaysLater,
        endTime: new Date(sevenDaysLater.getTime() + 2 * 60 * 60 * 1000),
        purpose: 'Faculty pilot study — growth chamber time block',
        authorizationDocUrl: null,
        approvedByUserId: null,
        approvedAt: null,
        expiryAt: computePencilExpiry(now, sevenDaysLater),
        createdAt: now,
        updatedAt: now
      }
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
          type: Sequelize.QueryTypes.SELECT
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
  }
};
