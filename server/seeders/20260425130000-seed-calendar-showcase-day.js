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

    const pickUserByEmail = (email) => users.find((u) => u.email === email)?.id || null;
    const fallbackUserByKeyword = (keyword) =>
      users.find((u) => String(u.email || '').toLowerCase().includes(keyword))?.id || null;

    const studentId =
      pickUserByEmail('student@uplb.edu.ph') ||
      fallbackUserByKeyword('student') ||
      users[0]?.id ||
      null;
    const staffId =
      pickUserByEmail('staff@uplb.edu.ph') ||
      fallbackUserByKeyword('staff') ||
      users[1]?.id ||
      users[0]?.id ||
      null;
    const adminId =
      pickUserByEmail('admin@uplb.edu.ph') ||
      fallbackUserByKeyword('admin') ||
      users[2]?.id ||
      users[0]?.id ||
      null;
    const researcher1Id =
      pickUserByEmail('researcher1@uplb.edu.ph') ||
      fallbackUserByKeyword('researcher1') ||
      users[3]?.id ||
      users[0]?.id ||
      null;
    const researcher2Id =
      pickUserByEmail('researcher2@uplb.edu.ph') ||
      fallbackUserByKeyword('researcher2') ||
      users[4]?.id ||
      users[0]?.id ||
      null;

    const pickEquipmentByName = (name) => equipment.find((e) => e.name === name)?.id || null;
    const pickRoomByName = (name) => rooms.find((r) => r.name === name)?.id || null;

    const laminarId = pickEquipmentByName('Laminar Flow Hood') || equipment[0]?.id || null;
    const autoclaveId = pickEquipmentByName('Autoclave') || equipment[1]?.id || equipment[0]?.id || null;
    const growthId = pickEquipmentByName('Growth Chamber') || equipment[2]?.id || equipment[0]?.id || null;
    const cultureAId = pickRoomByName('Culture Room A') || rooms[0]?.id || null;
    const prepRoomId = pickRoomByName('Preparation Room') || rooms[1]?.id || rooms[0]?.id || null;

    if (!users.length || !equipment.length || !rooms.length) {
      throw new Error(
        'SHOWCASE: requires at least 1 user, 1 equipment, and 1 room in the database before seeding.'
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

    const normalizeCodePart = (value) =>
      String(value || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 8);
    const normalizeRoomCode = (value) =>
      String(value || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9-]/g, '');
    const normalizeEquipmentCode = (value) =>
      String(value || '')
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');

    const resolveReferenceParts = async (resourceType, resourceId) => {
      const isEquipment = resourceType === 'equipment';
      const tableName = isEquipment ? 'Equipment' : 'Rooms';
      const fallbackGroup = isEquipment ? 'EQU' : 'ROM';
      const fallbackResource = String(resourceId).padStart(3, '0').slice(-3);

      const rows = await queryInterface.sequelize.query(
        isEquipment
          ? `SELECT "codeGroup", "resourceCode" FROM "${tableName}" WHERE id = :resourceId LIMIT 1`
          : `SELECT "resourceCode" FROM "${tableName}" WHERE id = :resourceId LIMIT 1`,
        {
          replacements: { resourceId },
          type: Sequelize.QueryTypes.SELECT,
        }
      );
      const record = rows[0] || {};

      return {
        codeGroup: normalizeCodePart(record.codeGroup) || fallbackGroup,
        resourceCode: isEquipment
          ? normalizeEquipmentCode(record.resourceCode) || fallbackResource
          : normalizeRoomCode(record.resourceCode) || fallbackResource,
      };
    };

    const nextReferenceCode = async (resourceType, resourceId, createdAt) => {
      const { codeGroup, resourceCode } = await resolveReferenceParts(resourceType, resourceId);
      const year = new Date(createdAt).getFullYear();
      const yearShort = String(year).slice(-2);
      const sequenceCodeGroup = resourceType === 'room' ? 'ROOM' : codeGroup;

      const nextRows = await queryInterface.sequelize.query(
        `INSERT INTO "BookingReferenceSequences"
          ("resourceType", "codeGroup", "resourceCode", "year", "lastNumber", "createdAt", "updatedAt")
         VALUES (:resourceType, :codeGroup, :resourceCode, :year, 1, NOW(), NOW())
         ON CONFLICT ("resourceType", "codeGroup", "resourceCode", "year")
         DO UPDATE SET
           "lastNumber" = "BookingReferenceSequences"."lastNumber" + 1,
           "updatedAt" = NOW()
         RETURNING "lastNumber"`,
        {
          replacements: { resourceType, codeGroup: sequenceCodeGroup, resourceCode, year },
          type: Sequelize.QueryTypes.SELECT,
        }
      );

      const nextNumber = Number(nextRows[0]?.lastNumber || 1);
      if (resourceType === 'room') {
        return `${resourceCode}-${String(nextNumber).padStart(3, '0')}-${yearShort}`;
      }
      return `${codeGroup}-${resourceCode}-${String(nextNumber).padStart(3, '0')}-${yearShort}`;
    };

    const insertBooking = async (row) => {
      const referenceCode = await nextReferenceCode(
        row.resourceType,
        row.resourceId,
        row.createdAt
      );
      const inserted = await queryInterface.sequelize.query(
        `INSERT INTO "Bookings" (
          "userId", "resourceType", "resourceId", "bookingType", "status",
          "startTime", "endTime", "purpose", "authorizationDocUrl",
          "equipmentRequestType", "loanReason", "loanWorkflowNote", "loanTransportPlan",
          "roomParticipantCount", "roomEquipmentNeeds", "roomSetupRequirements", "roomProgramDetails",
          "approvedByUserId", "approvedAt", "expiryAt",
          "contentionRole", "contentionDeadlineAt", "challengingBookingId",
          "createdAt", "updatedAt", "bookingThreadId", "referenceCode"
        ) VALUES (
          :userId, :resourceType, :resourceId, :bookingType, :status,
          :startTime, :endTime, :purpose, :authorizationDocUrl,
          :equipmentRequestType, :loanReason, :loanWorkflowNote, :loanTransportPlan,
          :roomParticipantCount, :roomEquipmentNeeds, :roomSetupRequirements, :roomProgramDetails,
          :approvedByUserId, :approvedAt, :expiryAt,
          :contentionRole, :contentionDeadlineAt, :challengingBookingId,
          :createdAt, :updatedAt, 0, :referenceCode
        ) RETURNING id`,
        {
          replacements: {
            ...row,
            referenceCode,
            contentionRole: row.contentionRole ?? null,
            contentionDeadlineAt: row.contentionDeadlineAt ?? null,
            challengingBookingId: row.challengingBookingId ?? null,
            equipmentRequestType:
              row.resourceType === 'equipment' ? row.equipmentRequestType ?? 'in_house' : null,
            loanReason: row.resourceType === 'equipment' ? row.loanReason ?? null : null,
            loanWorkflowNote: row.resourceType === 'equipment' ? row.loanWorkflowNote ?? null : null,
            loanTransportPlan: row.resourceType === 'equipment' ? row.loanTransportPlan ?? null : null,
            roomParticipantCount:
              row.resourceType === 'room' ? row.roomParticipantCount ?? null : null,
            roomEquipmentNeeds: row.resourceType === 'room' ? row.roomEquipmentNeeds ?? null : null,
            roomSetupRequirements:
              row.resourceType === 'room' ? row.roomSetupRequirements ?? null : null,
            roomProgramDetails: row.resourceType === 'room' ? row.roomProgramDetails ?? null : null,
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
      equipmentRequestType: 'loan',
      loanReason: 'SHOWCASE: urgent sterilization support outside PTCF',
      loanWorkflowNote: 'SHOWCASE: pre-run setup + post-run return checklist',
      loanTransportPlan: 'SHOWCASE: padded transport crate with sign-out log',
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
      equipmentRequestType: 'in_house',
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
      equipmentRequestType: 'in_house',
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
      equipmentRequestType: 'in_house',
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
      equipmentRequestType: 'in_house',
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
      equipmentRequestType: 'loan',
      loanReason: 'SHOWCASE: off-site growth condition comparison',
      loanWorkflowNote: 'SHOWCASE: daily temp/humidity logging protocol',
      loanTransportPlan: 'SHOWCASE: controlled van transport with shock monitor',
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
      equipmentRequestType: 'in_house',
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
      roomParticipantCount: 18,
      roomEquipmentNeeds: 'Projector, extension cords, marker set',
      roomSetupRequirements: 'U-shape seating, front demo table, drinking water',
      roomProgramDetails: 'SHOWCASE: tissue culture orientation session',
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
      roomParticipantCount: 6,
      roomEquipmentNeeds: 'Whiteboard only',
      roomSetupRequirements: 'Standard classroom layout',
      roomProgramDetails: 'SHOWCASE: evening prep huddle',
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
      roomParticipantCount: 10,
      roomEquipmentNeeds: 'Two prep benches, sink access, ice bucket',
      roomSetupRequirements: 'Bench labels + waste bins ready',
      roomProgramDetails: 'SHOWCASE: media preparation workshop',
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
      roomParticipantCount: 4,
      roomEquipmentNeeds: 'Bench access only',
      roomSetupRequirements: 'Minimal setup',
      roomProgramDetails: 'SHOWCASE: quick reagent prep',
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
      roomParticipantCount: 3,
      roomEquipmentNeeds: 'Storage rack check',
      roomSetupRequirements: 'No special setup',
      roomProgramDetails: 'SHOWCASE: end-of-day inventory',
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
