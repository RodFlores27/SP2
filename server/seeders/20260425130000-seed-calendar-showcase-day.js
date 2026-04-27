'use strict';

const { computePencilExpiryAt, computeContentionDeadline } = require('../utils/booking-rules');

/**
 * One calendar day, many resources, every visual type the /bookings/availability
 * view can return (non-terminal rows only: cancelled/denied/expired/displaced/completed
 * are excluded and will not appear on the calendar).
 *
 * All rows use purpose "SHOWCASE: ..." so `down` can remove this seed alone.
 */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
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

    const laminarId = equipment.find((e) => e.name === 'Laminar Flow Hood')?.id;
    const autoclaveId = equipment.find((e) => e.name === 'Autoclave')?.id;
    const growthId = equipment.find((e) => e.name === 'Growth Chamber')?.id;
    const cultureAId = rooms.find((r) => r.name === 'Culture Room A')?.id;
    const prepRoomId = rooms.find((r) => r.name === 'Preparation Room')?.id;

    if (
      !studentId ||
      !staffId ||
      !adminId ||
      !researcher1Id ||
      !researcher2Id ||
      !laminarId ||
      !autoclaveId ||
      !growthId ||
      !cultureAId ||
      !prepRoomId
    ) {
      throw new Error(
        'SHOWCASE: need users, equipment, and rooms. Run: npm run seed:foundation:local (or 20260330100000-seed-initial-data).'
      );
    }

    const now = new Date();
    // Place showcase one week after initial-data demo windows (latest initial demo day is day 9).
    const dayOffset = 16;

    const at = (daysFromNow, h, m = 0) => {
      const d = new Date(now);
      d.setDate(d.getDate() + daysFromNow);
      d.setHours(h, m, 0, 0);
      return d;
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

    // --- Laminar: free pencil, approved firm, pending firm (three distinct visual types) ---
    const lamPencilIssued = new Date(now.getTime() - 5 * 60 * 60 * 1000);
    const lam1Start = at(dayOffset, 6, 0);
    const lam1End = at(dayOffset, 7, 30);
    await insertBooking({
      userId: studentId,
      resourceType: 'equipment',
      resourceId: laminarId,
      bookingType: 'pencil',
      status: 'penciled',
      startTime: lam1Start,
      endTime: lam1End,
      purpose: 'SHOWCASE: free pencil (no contention)',
      authorizationDocUrl: null,
      approvedByUserId: null,
      approvedAt: null,
      expiryAt: computePencilExpiryAt(lamPencilIssued, lam1Start),
      createdAt: lamPencilIssued,
      updatedAt: lamPencilIssued,
    });

    const lamFirmApprStart = at(dayOffset, 8, 0);
    const lamFirmApprEnd = at(dayOffset, 9, 0);
    await insertBooking({
      userId: staffId,
      resourceType: 'equipment',
      resourceId: laminarId,
      bookingType: 'firm',
      status: 'approved',
      startTime: lamFirmApprStart,
      endTime: lamFirmApprEnd,
      purpose: 'SHOWCASE: firm approved (green)',
      authorizationDocUrl: 'https://res.cloudinary.com/demo/sample.pdf',
      approvedByUserId: adminId,
      approvedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      expiryAt: null,
      createdAt: now,
      updatedAt: now,
    });

    const lamFirmPendStart = at(dayOffset, 9, 30);
    const lamFirmPendEnd = at(dayOffset, 10, 30);
    await insertBooking({
      userId: studentId,
      resourceType: 'equipment',
      resourceId: laminarId,
      bookingType: 'firm',
      status: 'pending_approval',
      startTime: lamFirmPendStart,
      endTime: lamFirmPendEnd,
      purpose: 'SHOWCASE: firm pending (amber dashed)',
      authorizationDocUrl: 'https://res.cloudinary.com/demo/sample.pdf',
      approvedByUserId: null,
      approvedAt: null,
      expiryAt: null,
      createdAt: now,
      updatedAt: now,
    });

    // --- Autoclave: two independent 1v1 pairs, same day but non-overlapping windows (strict 1v1-safe) ---
    const t1 = new Date(now.getTime() - 4 * 60 * 60 * 1000);
    const t2 = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const t3 = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const t4 = new Date(now.getTime() - 1 * 60 * 60 * 1000);

    const aDef1s = at(dayOffset, 11, 0);
    const aDef1e = at(dayOffset, 15, 0);
    const aCh1s = at(dayOffset, 11, 30);
    const aCh1e = at(dayOffset, 13, 0);
    const aDef2s = at(dayOffset, 16, 0);
    const aDef2e = at(dayOffset, 20, 0);
    const aCh2s = at(dayOffset, 16, 30);
    const aCh2e = at(dayOffset, 18, 0);

    const exp1 = computePencilExpiryAt(t1, aDef1s);
    const exp2 = computePencilExpiryAt(t3, aDef2s);
    const dline1 = computeContentionDeadline(t1, aDef1s, exp1);
    const dline2 = computeContentionDeadline(t3, aDef2s, exp2);

    const shDefA = await insertBooking({
      userId: researcher1Id,
      resourceType: 'equipment',
      resourceId: autoclaveId,
      bookingType: 'pencil',
      status: 'penciled',
      startTime: aDef1s,
      endTime: aDef1e,
      purpose: 'SHOWCASE: 1v1 pair A defender',
      authorizationDocUrl: null,
      approvedByUserId: null,
      approvedAt: null,
      expiryAt: exp1,
      contentionRole: 'defender',
      contentionDeadlineAt: dline1,
      challengingBookingId: null,
      createdAt: t1,
      updatedAt: t1,
    });
    await insertBooking({
      userId: studentId,
      resourceType: 'equipment',
      resourceId: autoclaveId,
      bookingType: 'pencil',
      status: 'penciled',
      startTime: aCh1s,
      endTime: aCh1e,
      purpose: 'SHOWCASE: 1v1 pair A challenger',
      authorizationDocUrl: null,
      approvedByUserId: null,
      approvedAt: null,
      expiryAt: computePencilExpiryAt(t2, aCh1s),
      contentionRole: 'challenger',
      contentionDeadlineAt: null,
      challengingBookingId: shDefA,
      createdAt: t2,
      updatedAt: t2,
    });

    const shDefB = await insertBooking({
      userId: researcher2Id,
      resourceType: 'equipment',
      resourceId: autoclaveId,
      bookingType: 'pencil',
      status: 'penciled',
      startTime: aDef2s,
      endTime: aDef2e,
      purpose: 'SHOWCASE: 1v1 pair B defender',
      authorizationDocUrl: null,
      approvedByUserId: null,
      approvedAt: null,
      expiryAt: exp2,
      contentionRole: 'defender',
      contentionDeadlineAt: dline2,
      challengingBookingId: null,
      createdAt: t3,
      updatedAt: t3,
    });
    await insertBooking({
      userId: staffId,
      resourceType: 'equipment',
      resourceId: autoclaveId,
      bookingType: 'pencil',
      status: 'penciled',
      startTime: aCh2s,
      endTime: aCh2e,
      purpose: 'SHOWCASE: 1v1 pair B challenger',
      authorizationDocUrl: null,
      approvedByUserId: null,
      approvedAt: null,
      expiryAt: computePencilExpiryAt(t4, aCh2s),
      contentionRole: 'challenger',
      contentionDeadlineAt: null,
      challengingBookingId: shDefB,
      createdAt: t4,
      updatedAt: t4,
    });

    // --- Growth: pending firm + on_hold pencil (same window) -> two rows, not merged in month view ---
    const grFirmS = at(dayOffset, 10, 0);
    const grFirmE = at(dayOffset, 13, 0);
    await insertBooking({
      userId: studentId,
      resourceType: 'equipment',
      resourceId: growthId,
      bookingType: 'firm',
      status: 'pending_approval',
      startTime: grFirmS,
      endTime: grFirmE,
      purpose: 'SHOWCASE: firm pending (blocks on-hold demo below)',
      authorizationDocUrl: 'https://res.cloudinary.com/demo/sample.pdf',
      approvedByUserId: null,
      approvedAt: null,
      expiryAt: null,
      createdAt: now,
      updatedAt: now,
    });
    const grHoldIssued = new Date(now.getTime() - 45 * 60 * 1000);
    await insertBooking({
      userId: researcher2Id,
      resourceType: 'equipment',
      resourceId: growthId,
      bookingType: 'pencil',
      status: 'on_hold',
      startTime: grFirmS,
      endTime: grFirmE,
      purpose: 'SHOWCASE: on-hold pencil (dashed amber)',
      authorizationDocUrl: null,
      approvedByUserId: null,
      approvedAt: null,
      expiryAt: computePencilExpiryAt(grHoldIssued, grFirmS),
      createdAt: grHoldIssued,
      updatedAt: grHoldIssued,
    });

    // --- Culture Room A: approved firm + separate free pencil later in the day ---
    const cuApprS = at(dayOffset, 16, 0);
    const cuApprE = at(dayOffset, 18, 0);
    await insertBooking({
      userId: staffId,
      resourceType: 'room',
      resourceId: cultureAId,
      bookingType: 'firm',
      status: 'approved',
      startTime: cuApprS,
      endTime: cuApprE,
      purpose: 'SHOWCASE: room — firm approved',
      authorizationDocUrl: 'https://res.cloudinary.com/demo/sample.pdf',
      approvedByUserId: adminId,
      approvedAt: new Date(now.getTime() - 1 * 60 * 60 * 1000),
      expiryAt: null,
      createdAt: now,
      updatedAt: now,
    });
    const cuPencilIssued = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const cuFreeS = at(dayOffset, 19, 0);
    const cuFreeE = at(dayOffset, 20, 0);
    await insertBooking({
      userId: researcher1Id,
      resourceType: 'room',
      resourceId: cultureAId,
      bookingType: 'pencil',
      status: 'penciled',
      startTime: cuFreeS,
      endTime: cuFreeE,
      purpose: 'SHOWCASE: room — free pencil (evening, no overlap with firm above)',
      authorizationDocUrl: null,
      approvedByUserId: null,
      approvedAt: null,
      expiryAt: computePencilExpiryAt(cuPencilIssued, cuFreeS),
      createdAt: cuPencilIssued,
      updatedAt: cuPencilIssued,
    });

    // --- Prep Room: pending firm + on_hold + free pencil (no overlap) ---
    const prFirmS = at(dayOffset, 7, 0);
    const prFirmE = at(dayOffset, 10, 0);
    await insertBooking({
      userId: studentId,
      resourceType: 'room',
      resourceId: prepRoomId,
      bookingType: 'firm',
      status: 'pending_approval',
      startTime: prFirmS,
      endTime: prFirmE,
      purpose: 'SHOWCASE: prep room — firm pending',
      authorizationDocUrl: 'https://res.cloudinary.com/demo/sample.pdf',
      approvedByUserId: null,
      approvedAt: null,
      expiryAt: null,
      createdAt: now,
      updatedAt: now,
    });
    const prHoldIssued = new Date(now.getTime() - 30 * 60 * 1000);
    await insertBooking({
      userId: researcher2Id,
      resourceType: 'room',
      resourceId: prepRoomId,
      bookingType: 'pencil',
      status: 'on_hold',
      startTime: prFirmS,
      endTime: at(dayOffset, 9, 0),
      purpose: 'SHOWCASE: prep room — on-hold (subset of firm window)',
      authorizationDocUrl: null,
      approvedByUserId: null,
      approvedAt: null,
      expiryAt: computePencilExpiryAt(prHoldIssued, prFirmS),
      createdAt: prHoldIssued,
      updatedAt: prHoldIssued,
    });
    const prFreeIssued = new Date(now.getTime() - 1 * 60 * 60 * 1000);
    const prFreeS = at(dayOffset, 20, 0);
    const prFreeE = at(dayOffset, 21, 30);
    await insertBooking({
      userId: researcher1Id,
      resourceType: 'room',
      resourceId: prepRoomId,
      bookingType: 'pencil',
      status: 'penciled',
      startTime: prFreeS,
      endTime: prFreeE,
      purpose: 'SHOWCASE: prep room — free pencil (late)',
      authorizationDocUrl: null,
      approvedByUserId: null,
      approvedAt: null,
      expiryAt: computePencilExpiryAt(prFreeIssued, prFreeS),
      createdAt: prFreeIssued,
      updatedAt: prFreeIssued,
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`DELETE FROM "Bookings" WHERE purpose LIKE 'SHOWCASE:%'`);
  }
};
