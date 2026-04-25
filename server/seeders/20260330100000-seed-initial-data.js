'use strict';

const bcrypt = require('bcrypt');
const { computePencilExpiryAt, computeContentionDeadline } = require('../utils/booking-rules');

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
    const researcher1Id = users.find((u) => u.email === 'researcher1@uplb.edu.ph')?.id;
    const researcher2Id = users.find((u) => u.email === 'researcher2@uplb.edu.ph')?.id;
    const laminarFlowHoodId = equipment.find((e) => e.name === 'Laminar Flow Hood')?.id;
    const autoclaveId = equipment.find((e) => e.name === 'Autoclave')?.id;
    const growthChamberId = equipment.find((e) => e.name === 'Growth Chamber')?.id;
    const cultureRoomAId = rooms.find((r) => r.name === 'Culture Room A')?.id;
    const preparationRoomId = rooms.find((r) => r.name === 'Preparation Room')?.id;

    if (
      !studentId ||
      !staffId ||
      !adminId ||
      !researcher1Id ||
      !researcher2Id ||
      !laminarFlowHoodId ||
      !autoclaveId ||
      !growthChamberId ||
      !cultureRoomAId ||
      !preparationRoomId
    ) {
      throw new Error('Required seed references for initial bookings were not found.');
    }

    const now = new Date();
    const createDateAtTime = (daysFromNow, hours, minutes = 0) => {
      const date = new Date(now);
      date.setDate(date.getDate() + daysFromNow);
      date.setHours(hours, minutes, 0, 0);
      return date;
    };

    const insertBooking = async (row) => {
      const inserted = await queryInterface.sequelize.query(
        `INSERT INTO "Bookings" (
          "userId", "resourceType", "resourceId", "bookingType", "status",
          "startTime", "endTime", "purpose", "authorizationDocUrl",
          "approvedByUserId", "approvedAt", "expiryAt",
          "contentionRole", "contentionDeadlineAt", "challengingBookingId",
          "createdAt", "updatedAt", "bookingThreadId"
        ) VALUES (
          :userId, :resourceType, :resourceId, :bookingType, :status,
          :startTime, :endTime, :purpose, :authorizationDocUrl,
          :approvedByUserId, :approvedAt, :expiryAt,
          :contentionRole, :contentionDeadlineAt, :challengingBookingId,
          :createdAt, :updatedAt, 0
        ) RETURNING id`,
        {
          replacements: {
            ...row,
            contentionRole: row.contentionRole ?? null,
            contentionDeadlineAt: row.contentionDeadlineAt ?? null,
            challengingBookingId: row.challengingBookingId ?? null,
          },
          type: Sequelize.QueryTypes.SELECT,
        }
      );
      const id = inserted[0].id;
      await queryInterface.sequelize.query(
        `UPDATE "Bookings" SET "bookingThreadId" = :id WHERE id = :id`,
        { replacements: { id } }
      );
      return id;
    };

    const pencilStart = createDateAtTime(2, 9, 0);
    const approvedStart = createDateAtTime(3, 13, 0);

    await insertBooking({
      userId: studentId,
      resourceType: 'equipment',
      resourceId: laminarFlowHoodId,
      bookingType: 'pencil',
      status: 'penciled',
      startTime: pencilStart,
      endTime: new Date(pencilStart.getTime() + 2 * 60 * 60 * 1000),
      purpose: 'Baseline sample — free pencil (no contention)',
      authorizationDocUrl: null,
      approvedByUserId: null,
      approvedAt: null,
      expiryAt: computePencilExpiryAt(now, pencilStart),
      createdAt: now,
      updatedAt: now,
    });

    await insertBooking({
      userId: staffId,
      resourceType: 'room',
      resourceId: cultureRoomAId,
      bookingType: 'firm',
      status: 'approved',
      startTime: approvedStart,
      endTime: new Date(approvedStart.getTime() + 3 * 60 * 60 * 1000),
      purpose: 'Baseline sample — approved firm booking',
      authorizationDocUrl: 'https://res.cloudinary.com/demo/sample.pdf',
      approvedByUserId: adminId,
      approvedAt: new Date(now.getTime() - 60 * 60 * 1000),
      expiryAt: null,
      createdAt: now,
      updatedAt: now,
    });

    // Pencil contention (1v1): researcher1 = defender, student = challenger (Autoclave)
    const researcher1DefIssued = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const studentChalIssued = new Date(now.getTime() - 1 * 60 * 60 * 1000);
    const defWindowStart = createDateAtTime(5, 10, 0);
    const defWindowEnd = createDateAtTime(5, 13, 0);
    const chalStart = createDateAtTime(5, 11, 0);
    const chalEnd = createDateAtTime(5, 12, 0);
    const defenderExpiry = computePencilExpiryAt(researcher1DefIssued, defWindowStart);
    const defenderDeadline = computeContentionDeadline(
      researcher1DefIssued,
      defWindowStart,
      defenderExpiry
    );

    const defenderBookingId = await insertBooking({
      userId: researcher1Id,
      resourceType: 'equipment',
      resourceId: autoclaveId,
      bookingType: 'pencil',
      status: 'penciled',
      startTime: defWindowStart,
      endTime: defWindowEnd,
      purpose: 'Seed: defender — log in as researcher1@uplb.edu.ph to see defender notice',
      authorizationDocUrl: null,
      approvedByUserId: null,
      approvedAt: null,
      expiryAt: defenderExpiry,
      contentionRole: 'defender',
      contentionDeadlineAt: defenderDeadline,
      challengingBookingId: null,
      createdAt: researcher1DefIssued,
      updatedAt: researcher1DefIssued,
    });

    await insertBooking({
      userId: studentId,
      resourceType: 'equipment',
      resourceId: autoclaveId,
      bookingType: 'pencil',
      status: 'penciled',
      startTime: chalStart,
      endTime: chalEnd,
      purpose: 'Seed: challenger — log in as student@uplb.edu.ph to see challenger notice',
      authorizationDocUrl: null,
      approvedByUserId: null,
      approvedAt: null,
      expiryAt: computePencilExpiryAt(studentChalIssued, chalStart),
      contentionRole: 'challenger',
      contentionDeadlineAt: null,
      challengingBookingId: defenderBookingId,
      createdAt: studentChalIssued,
      updatedAt: studentChalIssued,
    });

    // Pending firm (student) + on-hold pencil (researcher2), same window — firm card shows on-hold warning
    const firmOnHoldStart = createDateAtTime(7, 9, 0);
    const firmOnHoldEnd = createDateAtTime(7, 12, 0);
    await insertBooking({
      userId: studentId,
      resourceType: 'equipment',
      resourceId: growthChamberId,
      bookingType: 'firm',
      status: 'pending_approval',
      startTime: firmOnHoldStart,
      endTime: firmOnHoldEnd,
      purpose: 'Seed: pending firm overlapping on-hold pencil',
      authorizationDocUrl: 'https://res.cloudinary.com/demo/sample.pdf',
      approvedByUserId: null,
      approvedAt: null,
      expiryAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const onHoldOverlapIssued = new Date(now.getTime() - 30 * 60 * 1000);
    await insertBooking({
      userId: researcher2Id,
      resourceType: 'equipment',
      resourceId: growthChamberId,
      bookingType: 'pencil',
      status: 'on_hold',
      startTime: firmOnHoldStart,
      endTime: firmOnHoldEnd,
      purpose: 'Seed: on-hold pencil — log in as researcher2@uplb.edu.ph; overlaps student pending firm',
      authorizationDocUrl: null,
      approvedByUserId: null,
      approvedAt: null,
      expiryAt: computePencilExpiryAt(onHoldOverlapIssued, firmOnHoldStart),
      createdAt: onHoldOverlapIssued,
      updatedAt: onHoldOverlapIssued,
    });

    // On-hold pencil (student) overlapping pending firm (staff) — valid on-hold blocker
    const firmBlockStart = createDateAtTime(8, 10, 0);
    const firmBlockEnd = createDateAtTime(8, 15, 0);
    const onHoldStudentStart = createDateAtTime(8, 11, 0);
    const onHoldStudentEnd = createDateAtTime(8, 14, 0);
    await insertBooking({
      userId: staffId,
      resourceType: 'room',
      resourceId: preparationRoomId,
      bookingType: 'firm',
      status: 'pending_approval',
      startTime: firmBlockStart,
      endTime: firmBlockEnd,
      purpose: 'Seed: pending firm overlapping student on-hold pencil',
      authorizationDocUrl: 'https://res.cloudinary.com/demo/sample.pdf',
      approvedByUserId: null,
      approvedAt: null,
      expiryAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const studentHoldIssued = new Date(now.getTime() - 20 * 60 * 1000);
    await insertBooking({
      userId: studentId,
      resourceType: 'room',
      resourceId: preparationRoomId,
      bookingType: 'pencil',
      status: 'on_hold',
      startTime: onHoldStudentStart,
      endTime: onHoldStudentEnd,
      purpose: 'Seed: on-hold pencil with overlapping firm — student@uplb.edu.ph',
      authorizationDocUrl: null,
      approvedByUserId: null,
      approvedAt: null,
      expiryAt: computePencilExpiryAt(studentHoldIssued, onHoldStudentStart),
      createdAt: studentHoldIssued,
      updatedAt: studentHoldIssued,
    });

    // --- Calendar month-view grouping demo (Autoclave): two separate 1v1 pairs, one time cluster ---
    // Month view should show two "Contention (1/1)" aggregate blocks (defender+challenger each), not one merged group.
    const calDemoDay = 9;
    const gIssued1 = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const gIssued2 = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const gIssued3 = new Date(now.getTime() - 1 * 60 * 60 * 1000);
    const gIssued4 = new Date(now.getTime() - 30 * 60 * 1000);

    const gDefAStart = createDateAtTime(calDemoDay, 8, 0);
    const gDefAEnd = createDateAtTime(calDemoDay, 14, 0);
    const gChAStart = createDateAtTime(calDemoDay, 9, 0);
    const gChAEnd = createDateAtTime(calDemoDay, 12, 0);
    const gDefBStart = createDateAtTime(calDemoDay, 11, 0);
    const gDefBEnd = createDateAtTime(calDemoDay, 17, 0);
    const gChBStart = createDateAtTime(calDemoDay, 13, 0);
    const gChBEnd = createDateAtTime(calDemoDay, 16, 0);

    const gExpA = computePencilExpiryAt(gIssued1, gDefAStart);
    const gExpB = computePencilExpiryAt(gIssued3, gDefBStart);
    const gDeadA = computeContentionDeadline(gIssued1, gDefAStart, gExpA);
    const gDeadB = computeContentionDeadline(gIssued3, gDefBStart, gExpB);

    const groupDefAId = await insertBooking({
      userId: researcher1Id,
      resourceType: 'equipment',
      resourceId: autoclaveId,
      bookingType: 'pencil',
      status: 'penciled',
      startTime: gDefAStart,
      endTime: gDefAEnd,
      purpose: 'DEMO: Autoclave pair A (defender) — calendar grouping: two 1v1 blocks same day',
      authorizationDocUrl: null,
      approvedByUserId: null,
      approvedAt: null,
      expiryAt: gExpA,
      contentionRole: 'defender',
      contentionDeadlineAt: gDeadA,
      challengingBookingId: null,
      createdAt: gIssued1,
      updatedAt: gIssued1,
    });

    await insertBooking({
      userId: studentId,
      resourceType: 'equipment',
      resourceId: autoclaveId,
      bookingType: 'pencil',
      status: 'penciled',
      startTime: gChAStart,
      endTime: gChAEnd,
      purpose: 'DEMO: Autoclave pair A (challenger vs # above)',
      authorizationDocUrl: null,
      approvedByUserId: null,
      approvedAt: null,
      expiryAt: computePencilExpiryAt(gIssued2, gChAStart),
      contentionRole: 'challenger',
      contentionDeadlineAt: null,
      challengingBookingId: groupDefAId,
      createdAt: gIssued2,
      updatedAt: gIssued2,
    });

    const groupDefBId = await insertBooking({
      userId: researcher2Id,
      resourceType: 'equipment',
      resourceId: autoclaveId,
      bookingType: 'pencil',
      status: 'penciled',
      startTime: gDefBStart,
      endTime: gDefBEnd,
      purpose: 'DEMO: Autoclave pair B (defender) — separate contention block from pair A',
      authorizationDocUrl: null,
      approvedByUserId: null,
      approvedAt: null,
      expiryAt: gExpB,
      contentionRole: 'defender',
      contentionDeadlineAt: gDeadB,
      challengingBookingId: null,
      createdAt: gIssued3,
      updatedAt: gIssued3,
    });

    await insertBooking({
      userId: staffId,
      resourceType: 'equipment',
      resourceId: autoclaveId,
      bookingType: 'pencil',
      status: 'penciled',
      startTime: gChBStart,
      endTime: gChBEnd,
      purpose: 'DEMO: Autoclave pair B (challenger vs # above)',
      authorizationDocUrl: null,
      approvedByUserId: null,
      approvedAt: null,
      expiryAt: computePencilExpiryAt(gIssued4, gChBStart),
      contentionRole: 'challenger',
      contentionDeadlineAt: null,
      challengingBookingId: groupDefBId,
      createdAt: gIssued4,
      updatedAt: gIssued4,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('Bookings', null, {});
    await queryInterface.bulkDelete('Users', null, {});
    await queryInterface.bulkDelete('Equipment', null, {});
    await queryInterface.bulkDelete('Rooms', null, {});
  }
};
