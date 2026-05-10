'use strict';

const { computePencilExpiryAt, computeContentionDeadline } = require('../utils/booking-rules');

/**
 * Seeds a full My Bookings showcase focused on admin@uplb.edu.ph.
 * Includes active + past entries and thread history examples.
 *
 * All rows use purpose prefix "SHOWCASE:MYBOOKINGS:" so down() can cleanly remove them.
 */
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

    if (!users.length || !equipment.length || !rooms.length) {
      throw new Error('MYBOOKINGS SHOWCASE: requires at least 1 user, 1 equipment, and 1 room.');
    }

    const pickUser = (email, fallbackIndex = 0) =>
      users.find((u) => u.email === email)?.id || users[fallbackIndex]?.id || users[0]?.id;
    const adminId = pickUser('admin@uplb.edu.ph', 0);
    const staffId = pickUser('staff@uplb.edu.ph', 1);
    const studentId = pickUser('student@uplb.edu.ph', 2);
    const researcher1Id = pickUser('researcher1@uplb.edu.ph', 3);

    const eqA = equipment[0]?.id;
    const eqB = equipment[1]?.id || equipment[0]?.id;
    const roomA = rooms[0]?.id;
    const roomB = rooms[1]?.id || rooms[0]?.id;

    const now = new Date();
    const dayOffset = 18; // keep separate from calendar showcase
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
      const referenceCode = await nextReferenceCode(row.resourceType, row.resourceId, row.createdAt);
      const inserted = await queryInterface.sequelize.query(
        `INSERT INTO "Bookings" (
          "userId", "resourceType", "resourceId", "bookingType", "status",
          "startTime", "endTime", "purpose", "authorizationDocUrl",
          "equipmentRequestType", "loanReason", "loanWorkflowNote", "loanTransportPlan",
          "roomParticipantCount", "roomEquipmentNeeds", "roomSetupRequirements", "roomProgramDetails",
          "staffRemark", "cancellationReason", "probableRebookDate",
          "rebookedFromBookingId", "rebookedFromStatus",
          "approvedByUserId", "deniedByUserId", "approvedAt", "expiryAt",
          "contentionRole", "contentionDeadlineAt", "challengingBookingId",
          "createdAt", "updatedAt", "bookingThreadId", "referenceCode"
        ) VALUES (
          :userId, :resourceType, :resourceId, :bookingType, :status,
          :startTime, :endTime, :purpose, :authorizationDocUrl,
          :equipmentRequestType, :loanReason, :loanWorkflowNote, :loanTransportPlan,
          :roomParticipantCount, :roomEquipmentNeeds, :roomSetupRequirements, :roomProgramDetails,
          :staffRemark, :cancellationReason, :probableRebookDate,
          :rebookedFromBookingId, :rebookedFromStatus,
          :approvedByUserId, :deniedByUserId, :approvedAt, :expiryAt,
          :contentionRole, :contentionDeadlineAt, :challengingBookingId,
          :createdAt, :updatedAt, 0, :referenceCode
        ) RETURNING id`,
        {
          replacements: {
            ...row,
            referenceCode,
            authorizationDocUrl: row.authorizationDocUrl ?? null,
            bookingType: row.bookingType ?? 'pencil',
            status: row.status ?? 'penciled',
            purpose: row.purpose ?? null,
            equipmentRequestType:
              row.resourceType === 'equipment' ? row.equipmentRequestType ?? 'in_house' : null,
            loanReason: row.resourceType === 'equipment' ? row.loanReason ?? null : null,
            loanWorkflowNote: row.resourceType === 'equipment' ? row.loanWorkflowNote ?? null : null,
            loanTransportPlan: row.resourceType === 'equipment' ? row.loanTransportPlan ?? null : null,
            roomParticipantCount: row.resourceType === 'room' ? row.roomParticipantCount ?? null : null,
            roomEquipmentNeeds: row.resourceType === 'room' ? row.roomEquipmentNeeds ?? null : null,
            roomSetupRequirements: row.resourceType === 'room' ? row.roomSetupRequirements ?? null : null,
            roomProgramDetails: row.resourceType === 'room' ? row.roomProgramDetails ?? null : null,
            staffRemark: row.staffRemark ?? null,
            cancellationReason: row.cancellationReason ?? null,
            probableRebookDate: row.probableRebookDate ?? null,
            rebookedFromBookingId: row.rebookedFromBookingId ?? null,
            rebookedFromStatus: row.rebookedFromStatus ?? null,
            approvedByUserId: row.approvedByUserId ?? null,
            deniedByUserId: row.deniedByUserId ?? null,
            approvedAt: row.approvedAt ?? null,
            expiryAt: row.expiryAt ?? null,
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

    // ACTIVE: free pencil in-house
    const a1Created = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    const a1Start = at(dayOffset, 8, 0);
    await insertBooking({
      userId: adminId,
      resourceType: 'equipment',
      resourceId: eqA,
      bookingType: 'pencil',
      status: 'penciled',
      startTime: a1Start,
      endTime: at(dayOffset, 9, 30),
      purpose: 'SHOWCASE:MYBOOKINGS: active free pencil in-house',
      equipmentRequestType: 'in_house',
      createdAt: a1Created,
      updatedAt: a1Created,
      expiryAt: computePencilExpiryAt(a1Created, a1Start),
    });

    // ACTIVE: pencil challenger
    const dCreated = new Date(now.getTime() - 7 * 60 * 60 * 1000);
    const dStart = at(dayOffset, 10, 0);
    const dEnd = at(dayOffset, 12, 0);
    const dExpiry = computePencilExpiryAt(dCreated, dStart);
    const dDeadline = computeContentionDeadline(dCreated, dStart, dExpiry);
    const defenderId = await insertBooking({
      userId: researcher1Id,
      resourceType: 'equipment',
      resourceId: eqB,
      bookingType: 'pencil',
      status: 'penciled',
      startTime: dStart,
      endTime: dEnd,
      purpose: 'SHOWCASE:MYBOOKINGS: helper defender (other user)',
      equipmentRequestType: 'in_house',
      contentionRole: 'defender',
      contentionDeadlineAt: dDeadline,
      createdAt: dCreated,
      updatedAt: dCreated,
      expiryAt: dExpiry,
    });
    const chCreated = new Date(now.getTime() - 6.5 * 60 * 60 * 1000);
    const chStart = at(dayOffset, 10, 30);
    await insertBooking({
      userId: adminId,
      resourceType: 'equipment',
      resourceId: eqB,
      bookingType: 'pencil',
      status: 'penciled',
      startTime: chStart,
      endTime: at(dayOffset, 11, 30),
      purpose: 'SHOWCASE:MYBOOKINGS: active challenger pencil',
      equipmentRequestType: 'in_house',
      contentionRole: 'challenger',
      challengingBookingId: defenderId,
      createdAt: chCreated,
      updatedAt: chCreated,
      expiryAt: computePencilExpiryAt(chCreated, chStart),
    });

    // ACTIVE: admin as defender + external challenger
    const adDefCreated = new Date(now.getTime() - 6.25 * 60 * 60 * 1000);
    const adDefStart = at(dayOffset, 12, 30);
    const adDefEnd = at(dayOffset, 14, 0);
    const adDefExpiry = computePencilExpiryAt(adDefCreated, adDefStart);
    const adDefDeadline = computeContentionDeadline(adDefCreated, adDefStart, adDefExpiry);
    const adminDefenderId = await insertBooking({
      userId: adminId,
      resourceType: 'equipment',
      resourceId: eqA,
      bookingType: 'pencil',
      status: 'penciled',
      startTime: adDefStart,
      endTime: adDefEnd,
      purpose: 'SHOWCASE:MYBOOKINGS: active admin defender pencil',
      equipmentRequestType: 'in_house',
      contentionRole: 'defender',
      contentionDeadlineAt: adDefDeadline,
      createdAt: adDefCreated,
      updatedAt: adDefCreated,
      expiryAt: adDefExpiry,
    });
    const adChCreated = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    const adChStart = at(dayOffset, 13, 0);
    await insertBooking({
      userId: studentId,
      resourceType: 'equipment',
      resourceId: eqA,
      bookingType: 'pencil',
      status: 'penciled',
      startTime: adChStart,
      endTime: at(dayOffset, 13, 30),
      purpose: 'SHOWCASE:MYBOOKINGS: helper challenger (other user) vs admin defender',
      equipmentRequestType: 'in_house',
      contentionRole: 'challenger',
      challengingBookingId: adminDefenderId,
      createdAt: adChCreated,
      updatedAt: adChCreated,
      expiryAt: computePencilExpiryAt(adChCreated, adChStart),
    });

    // ACTIVE: on-hold room pencil
    const holdCreated = new Date(now.getTime() - 5 * 60 * 60 * 1000);
    const holdStart = at(dayOffset, 13, 0);
    await insertBooking({
      userId: adminId,
      resourceType: 'room',
      resourceId: roomA,
      bookingType: 'pencil',
      status: 'on_hold',
      startTime: holdStart,
      endTime: at(dayOffset, 14, 0),
      purpose: 'SHOWCASE:MYBOOKINGS: active on-hold room pencil',
      roomParticipantCount: 5,
      roomEquipmentNeeds: 'Whiteboard, extension cord',
      roomSetupRequirements: 'Standard setup',
      roomProgramDetails: 'Quick planning huddle',
      createdAt: holdCreated,
      updatedAt: holdCreated,
      expiryAt: computePencilExpiryAt(holdCreated, holdStart),
    });

    // ACTIVE: pending approval loan firm
    const pendingCreated = new Date(now.getTime() - 4 * 60 * 60 * 1000);
    await insertBooking({
      userId: adminId,
      resourceType: 'equipment',
      resourceId: eqA,
      bookingType: 'firm',
      status: 'pending_approval',
      startTime: at(dayOffset, 15, 0),
      endTime: at(dayOffset, 16, 0),
      purpose: 'SHOWCASE:MYBOOKINGS: active pending firm loan',
      authorizationDocUrl: 'https://res.cloudinary.com/demo/sample.pdf',
      equipmentRequestType: 'loan',
      loanReason: 'Off-site run',
      loanWorkflowNote: 'Follow checklist',
      loanTransportPlan: 'Secured transport case',
      createdAt: pendingCreated,
      updatedAt: pendingCreated,
    });

    // ACTIVE: approved room firm
    const approvedCreated = new Date(now.getTime() - 4 * 60 * 60 * 1000);
    await insertBooking({
      userId: adminId,
      resourceType: 'room',
      resourceId: roomB,
      bookingType: 'firm',
      status: 'approved',
      startTime: at(dayOffset, 17, 0),
      endTime: at(dayOffset, 18, 30),
      purpose: 'SHOWCASE:MYBOOKINGS: active approved room firm',
      authorizationDocUrl: 'https://res.cloudinary.com/demo/sample.pdf',
      roomParticipantCount: 22,
      roomEquipmentNeeds: 'Projector and mic',
      roomSetupRequirements: 'U-shape',
      roomProgramDetails: 'Training session',
      approvedByUserId: staffId,
      approvedAt: new Date(now.getTime() - 3 * 60 * 60 * 1000),
      staffRemark: 'Approved for scheduled training.',
      createdAt: approvedCreated,
      updatedAt: approvedCreated,
    });

    // PAST: cancelled
    await insertBooking({
      userId: adminId,
      resourceType: 'equipment',
      resourceId: eqA,
      bookingType: 'firm',
      status: 'cancelled',
      startTime: at(dayOffset - 1, 8, 0),
      endTime: at(dayOffset - 1, 9, 0),
      purpose: 'SHOWCASE:MYBOOKINGS: past cancelled',
      equipmentRequestType: 'in_house',
      cancellationReason: 'Schedule moved',
      probableRebookDate: at(dayOffset + 1, 9, 0),
      createdAt: new Date(now.getTime() - 48 * 60 * 60 * 1000),
      updatedAt: new Date(now.getTime() - 12 * 60 * 60 * 1000),
    });

    // PAST: denied
    await insertBooking({
      userId: adminId,
      resourceType: 'equipment',
      resourceId: eqB,
      bookingType: 'firm',
      status: 'denied',
      startTime: at(dayOffset - 1, 10, 0),
      endTime: at(dayOffset - 1, 11, 0),
      purpose: 'SHOWCASE:MYBOOKINGS: past denied',
      authorizationDocUrl: 'https://res.cloudinary.com/demo/sample.pdf',
      equipmentRequestType: 'loan',
      loanReason: 'Field validation',
      loanWorkflowNote: 'Draft protocol',
      loanTransportPlan: 'Personal vehicle',
      staffRemark: 'Please provide updated workflow and handling plan.',
      deniedByUserId: staffId,
      createdAt: new Date(now.getTime() - 50 * 60 * 60 * 1000),
      updatedAt: new Date(now.getTime() - 20 * 60 * 60 * 1000),
    });

    // PAST: expired
    await insertBooking({
      userId: adminId,
      resourceType: 'room',
      resourceId: roomA,
      bookingType: 'pencil',
      status: 'expired',
      startTime: at(dayOffset - 1, 12, 0),
      endTime: at(dayOffset - 1, 13, 0),
      purpose: 'SHOWCASE:MYBOOKINGS: past expired',
      roomParticipantCount: 3,
      roomEquipmentNeeds: 'None',
      roomSetupRequirements: 'None',
      roomProgramDetails: 'Expired demo',
      staffRemark: 'Expired: pencil booking lifetime ended',
      createdAt: new Date(now.getTime() - 72 * 60 * 60 * 1000),
      updatedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      expiryAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
    });

    // PAST: displaced
    await insertBooking({
      userId: adminId,
      resourceType: 'equipment',
      resourceId: eqA,
      bookingType: 'pencil',
      status: 'displaced',
      startTime: at(dayOffset - 1, 14, 0),
      endTime: at(dayOffset - 1, 15, 0),
      purpose: 'SHOWCASE:MYBOOKINGS: past displaced',
      equipmentRequestType: 'in_house',
      staffRemark: 'Displaced: lost contention — did not convert to firm in time',
      createdAt: new Date(now.getTime() - 80 * 60 * 60 * 1000),
      updatedAt: new Date(now.getTime() - 18 * 60 * 60 * 1000),
    });

    // PAST: completed
    await insertBooking({
      userId: adminId,
      resourceType: 'room',
      resourceId: roomB,
      bookingType: 'firm',
      status: 'completed',
      startTime: at(dayOffset - 1, 16, 0),
      endTime: at(dayOffset - 1, 17, 0),
      purpose: 'SHOWCASE:MYBOOKINGS: past completed',
      authorizationDocUrl: 'https://res.cloudinary.com/demo/sample.pdf',
      roomParticipantCount: 8,
      roomEquipmentNeeds: 'Speaker',
      roomSetupRequirements: 'Rows',
      roomProgramDetails: 'Completed session',
      approvedByUserId: staffId,
      approvedAt: new Date(now.getTime() - 36 * 60 * 60 * 1000),
      createdAt: new Date(now.getTime() - 60 * 60 * 60 * 1000),
      updatedAt: new Date(now.getTime() - 6 * 60 * 60 * 1000),
    });

    // THREAD SHOWCASE: denied source + resubmitted pending approval (for history and rebook context)
    const threadDeniedId = await insertBooking({
      userId: adminId,
      resourceType: 'equipment',
      resourceId: eqB,
      bookingType: 'firm',
      status: 'denied',
      startTime: at(dayOffset - 1, 18, 0),
      endTime: at(dayOffset - 1, 19, 0),
      purpose: 'SHOWCASE:MYBOOKINGS: thread denied source',
      authorizationDocUrl: 'https://res.cloudinary.com/demo/sample.pdf',
      equipmentRequestType: 'loan',
      loanReason: 'Initial request',
      loanWorkflowNote: 'Initial workflow',
      loanTransportPlan: 'Initial transport',
      staffRemark: 'Please revise transport and workflow details.',
      deniedByUserId: staffId,
      createdAt: new Date(now.getTime() - 30 * 60 * 60 * 1000),
      updatedAt: new Date(now.getTime() - 28 * 60 * 60 * 1000),
    });

    const threadPendingIdRows = await queryInterface.sequelize.query(
      `INSERT INTO "Bookings" (
        "userId", "resourceType", "resourceId", "bookingType", "status",
        "startTime", "endTime", "purpose", "authorizationDocUrl",
        "equipmentRequestType", "loanReason", "loanWorkflowNote", "loanTransportPlan",
        "staffRemark", "rebookedFromBookingId", "rebookedFromStatus", "bookingThreadId",
        "createdAt", "updatedAt", "referenceCode"
      ) VALUES (
        :userId, 'equipment', :resourceId, 'firm', 'pending_approval',
        :startTime, :endTime, :purpose, :authorizationDocUrl,
        'loan', :loanReason, :loanWorkflowNote, :loanTransportPlan,
        NULL, :rebookedFromBookingId, 'denied', :bookingThreadId,
        :createdAt, :updatedAt, :referenceCode
      ) RETURNING id`,
      {
        replacements: {
          userId: adminId,
          resourceId: eqB,
          startTime: at(dayOffset, 19, 0),
          endTime: at(dayOffset, 20, 0),
          purpose: 'SHOWCASE:MYBOOKINGS: thread resubmitted pending',
          authorizationDocUrl: 'https://res.cloudinary.com/demo/sample.pdf',
          loanReason: 'Revised reason',
          loanWorkflowNote: 'Updated workflow with safeguards',
          loanTransportPlan: 'Updated transport plan with padded case',
          rebookedFromBookingId: threadDeniedId,
          bookingThreadId: threadDeniedId,
          createdAt: new Date(now.getTime() - 12 * 60 * 60 * 1000),
          updatedAt: new Date(now.getTime() - 12 * 60 * 60 * 1000),
          referenceCode: await nextReferenceCode('equipment', eqB, new Date(now.getTime() - 12 * 60 * 60 * 1000)),
        },
        type: Sequelize.QueryTypes.SELECT,
      }
    );

    // ensure source denied row belongs to same thread lineage
    await queryInterface.sequelize.query(
      `UPDATE "Bookings" SET "bookingThreadId" = :threadId WHERE id = :id`,
      { replacements: { threadId: threadDeniedId, id: threadDeniedId } }
    );
    await queryInterface.sequelize.query(
      `UPDATE "Bookings" SET "bookingThreadId" = :threadId WHERE id = :id`,
      { replacements: { threadId: threadDeniedId, id: threadPendingIdRows[0].id } }
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM "Bookings" WHERE purpose LIKE 'SHOWCASE:MYBOOKINGS:%'`
    );
  },
};
