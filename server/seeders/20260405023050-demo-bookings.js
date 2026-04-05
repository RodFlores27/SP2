'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const twoDaysLater = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const fourDaysLater = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);
    const fiveDaysLater = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

    await queryInterface.bulkInsert('Bookings', [
      {
        userId: 1,
        resourceType: 'equipment',
        resourceId: 1,
        bookingType: 'pencil',
        status: 'penciled',
        startTime: tomorrow,
        endTime: new Date(tomorrow.getTime() + 2 * 60 * 60 * 1000),
        purpose: 'Research experiment for plant tissue culture',
        authorizationDocUrl: null,
        expiryAt: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
        createdAt: now,
        updatedAt: now
      },
      {
        userId: 2,
        resourceType: 'room',
        resourceId: 1,
        bookingType: 'firm',
        status: 'confirmed',
        startTime: twoDaysLater,
        endTime: new Date(twoDaysLater.getTime() + 4 * 60 * 60 * 1000),
        purpose: 'Lab session for CMSC 190 students',
        authorizationDocUrl: 'https://res.cloudinary.com/demo/sample.pdf',
        expiryAt: null,
        createdAt: now,
        updatedAt: now
      },
      {
        userId: 1,
        resourceType: 'equipment',
        resourceId: 2,
        bookingType: 'pencil',
        status: 'contested',
        startTime: threeDaysLater,
        endTime: new Date(threeDaysLater.getTime() + 3 * 60 * 60 * 1000),
        purpose: 'Testing new culture medium',
        authorizationDocUrl: null,
        expiryAt: new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000),
        createdAt: now,
        updatedAt: now
      },
      {
        userId: 3,
        resourceType: 'equipment',
        resourceId: 2,
        bookingType: 'pencil',
        status: 'contested',
        startTime: new Date(threeDaysLater.getTime() + 1 * 60 * 60 * 1000),
        endTime: new Date(threeDaysLater.getTime() + 4 * 60 * 60 * 1000),
        purpose: 'Equipment calibration and testing',
        authorizationDocUrl: null,
        expiryAt: new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000),
        createdAt: now,
        updatedAt: now
      },
      {
        userId: 2,
        resourceType: 'room',
        resourceId: 2,
        bookingType: 'firm',
        status: 'confirmed',
        startTime: fourDaysLater,
        endTime: new Date(fourDaysLater.getTime() + 6 * 60 * 60 * 1000),
        purpose: 'Workshop on tissue culture techniques',
        authorizationDocUrl: 'https://res.cloudinary.com/demo/authorization.pdf',
        expiryAt: null,
        createdAt: now,
        updatedAt: now
      },
      {
        userId: 1,
        resourceType: 'room',
        resourceId: 1,
        bookingType: 'pencil',
        status: 'penciled',
        startTime: fiveDaysLater,
        endTime: new Date(fiveDaysLater.getTime() + 2 * 60 * 60 * 1000),
        purpose: 'Thesis defense preparation',
        authorizationDocUrl: null,
        expiryAt: new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000),
        createdAt: now,
        updatedAt: now
      }
    ], {});
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('Bookings', null, {});
  }
};
