'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const addColumnIfMissing = async (table, column, definition) => {
      const tableDefinition = await queryInterface.describeTable(table);
      if (!tableDefinition[column]) {
        await queryInterface.addColumn(table, column, definition);
      }
    };

    await addColumnIfMissing('Equipment', 'codeGroup', {
      type: Sequelize.STRING(16),
      allowNull: true,
    });
    await addColumnIfMissing('Equipment', 'resourceCode', {
      type: Sequelize.STRING(16),
      allowNull: true,
    });

    await addColumnIfMissing('Rooms', 'codeGroup', {
      type: Sequelize.STRING(16),
      allowNull: true,
    });
    await addColumnIfMissing('Rooms', 'resourceCode', {
      type: Sequelize.STRING(16),
      allowNull: true,
    });

    await addColumnIfMissing('Bookings', 'referenceCode', {
      type: Sequelize.STRING(64),
      allowNull: true,
    });

    await queryInterface.sequelize.query(`
      UPDATE "Equipment"
      SET "codeGroup" = 'STE', "resourceCode" = 'LFH'
      WHERE "name" = 'Laminar Flow Hood' AND "codeGroup" IS NULL AND "resourceCode" IS NULL;
    `);
    await queryInterface.sequelize.query(`
      UPDATE "Equipment"
      SET "codeGroup" = 'STE', "resourceCode" = 'AUT'
      WHERE "name" = 'Autoclave' AND "codeGroup" IS NULL AND "resourceCode" IS NULL;
    `);
    await queryInterface.sequelize.query(`
      UPDATE "Equipment"
      SET "codeGroup" = 'INC', "resourceCode" = 'GCH'
      WHERE "name" = 'Growth Chamber' AND "codeGroup" IS NULL AND "resourceCode" IS NULL;
    `);
    await queryInterface.sequelize.query(`
      UPDATE "Rooms"
      SET "codeGroup" = 'ICR', "resourceCode" = 'CRA'
      WHERE "name" = 'Culture Room A' AND "codeGroup" IS NULL AND "resourceCode" IS NULL;
    `);
    await queryInterface.sequelize.query(`
      UPDATE "Rooms"
      SET "codeGroup" = 'ICR', "resourceCode" = 'PRM'
      WHERE "name" = 'Preparation Room' AND "codeGroup" IS NULL AND "resourceCode" IS NULL;
    `);

    await queryInterface.createTable('BookingReferenceSequences', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      resourceType: {
        type: Sequelize.ENUM('equipment', 'room'),
        allowNull: false,
      },
      codeGroup: {
        type: Sequelize.STRING(16),
        allowNull: false,
      },
      resourceCode: {
        type: Sequelize.STRING(16),
        allowNull: false,
      },
      year: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      lastNumber: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.sequelize.query(`
      WITH resource_codes AS (
        SELECT 'equipment'::text AS "resourceType", id AS "resourceId", "codeGroup", "resourceCode"
        FROM "Equipment"
        WHERE "codeGroup" IS NOT NULL AND "resourceCode" IS NOT NULL
        UNION ALL
        SELECT 'room'::text AS "resourceType", id AS "resourceId", "codeGroup", "resourceCode"
        FROM "Rooms"
        WHERE "codeGroup" IS NOT NULL AND "resourceCode" IS NOT NULL
      ),
      numbered AS (
        SELECT
          b.id,
          rc."codeGroup",
          rc."resourceCode",
          EXTRACT(YEAR FROM b."startTime")::integer AS year,
          ROW_NUMBER() OVER (
            PARTITION BY rc."resourceType", rc."codeGroup", rc."resourceCode", EXTRACT(YEAR FROM b."startTime")::integer
            ORDER BY b."createdAt", b.id
          ) AS seq
        FROM "Bookings" b
        JOIN resource_codes rc
          ON rc."resourceType" = b."resourceType"::text
         AND rc."resourceId" = b."resourceId"
        WHERE b."referenceCode" IS NULL
      )
      UPDATE "Bookings" b
      SET "referenceCode" =
        numbered."codeGroup" || '-' ||
        numbered."resourceCode" || '-' ||
        LPAD(numbered.seq::text, 3, '0') || '-' ||
        RIGHT(numbered.year::text, 2)
      FROM numbered
      WHERE b.id = numbered.id;
    `);

    await queryInterface.sequelize.query(`
      WITH parsed AS (
        SELECT
          b."resourceType"::text AS "resourceType",
          SPLIT_PART(b."referenceCode", '-', 1) AS "codeGroup",
          SPLIT_PART(b."referenceCode", '-', 2) AS "resourceCode",
          EXTRACT(YEAR FROM b."startTime")::integer AS year,
          MAX(SPLIT_PART(b."referenceCode", '-', 3)::integer) AS "lastNumber"
        FROM "Bookings" b
        WHERE b."referenceCode" IS NOT NULL
        GROUP BY b."resourceType", SPLIT_PART(b."referenceCode", '-', 1), SPLIT_PART(b."referenceCode", '-', 2), EXTRACT(YEAR FROM b."startTime")::integer
      )
      INSERT INTO "BookingReferenceSequences" (
        "resourceType", "codeGroup", "resourceCode", year, "lastNumber", "createdAt", "updatedAt"
      )
      SELECT
        "resourceType"::"enum_BookingReferenceSequences_resourceType",
        "codeGroup",
        "resourceCode",
        year,
        "lastNumber",
        NOW(),
        NOW()
      FROM parsed;
    `);

    await queryInterface.addIndex('BookingReferenceSequences', {
      fields: ['resourceType', 'codeGroup', 'resourceCode', 'year'],
      unique: true,
      name: 'booking_reference_sequences_unique_scope',
    });
    await queryInterface.addIndex('Bookings', ['referenceCode'], {
      unique: true,
      name: 'bookings_reference_code_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('Bookings', 'bookings_reference_code_unique');
    await queryInterface.removeIndex(
      'BookingReferenceSequences',
      'booking_reference_sequences_unique_scope'
    );
    await queryInterface.dropTable('BookingReferenceSequences');
    await queryInterface.removeColumn('Bookings', 'referenceCode');
    await queryInterface.removeColumn('Rooms', 'resourceCode');
    await queryInterface.removeColumn('Rooms', 'codeGroup');
    await queryInterface.removeColumn('Equipment', 'resourceCode');
    await queryInterface.removeColumn('Equipment', 'codeGroup');
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_BookingReferenceSequences_resourceType";'
    );
  },
};
