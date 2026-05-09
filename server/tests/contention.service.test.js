'use strict';

const assert = require('assert');
const contention = require('../services/contention.service');

function makeBookingRow({
  id,
  userId = id + 100,
  status = 'penciled',
  bookingType = 'pencil',
  contentionRole = null,
  challengingBookingId = null,
  startTime = '2030-01-01T10:00:00.000Z',
  expiryAt = '2030-01-01T09:00:00.000Z',
}) {
  return {
    id,
    userId,
    status,
    bookingType,
    contentionRole,
    challengingBookingId,
    startTime: new Date(startTime),
    expiryAt: new Date(expiryAt),
    async save() {
      return this;
    },
  };
}

function createBookingStub(defender, challenger, existingChallenger = null) {
  return {
    async findByPk(id) {
      if (id === defender.id) return defender;
      if (id === challenger.id) return challenger;
      if (existingChallenger && id === existingChallenger.id) return existingChallenger;
      return null;
    },
    async findOne({ where }) {
      if (
        existingChallenger &&
        where.challengingBookingId === defender.id &&
        where.contentionRole === 'challenger' &&
        where.status === 'penciled'
      ) {
        return existingChallenger;
      }
      return null;
    }
  };
}

async function expectRejectsActiveLock(fn, label) {
  let threw = false;
  try {
    await fn();
  } catch (e) {
    threw = true;
    assert.strictEqual(e.code, 'ACTIVE_CONTENTION_LOCKED', `${label}: expected ACTIVE_CONTENTION_LOCKED`);
    assert.strictEqual(e.statusCode, 409, `${label}: expected 409`);
  }
  assert.strictEqual(threw, true, `${label}: expected function to throw`);
}

async function run() {
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };

  {
    const defender = makeBookingRow({ id: 1 });
    const challenger = makeBookingRow({ id: 2, contentionRole: 'challenger', challengingBookingId: 99 });
    const Booking = createBookingStub(defender, challenger);
    await expectRejectsActiveLock(
      () =>
        contention.startContention(
          { defenderBooking: defender, challengerBooking: challenger },
          { transaction, Booking }
        ),
      'pre-engaged challenger'
    );
  }

  {
    const defender = makeBookingRow({ id: 1 });
    const challenger = makeBookingRow({ id: 2 });
    const existingChallenger = makeBookingRow({
      id: 3,
      userId: 777,
      contentionRole: 'challenger',
      challengingBookingId: 1,
    });
    const Booking = createBookingStub(defender, challenger, existingChallenger);
    await expectRejectsActiveLock(
      () =>
        contention.startContention(
          { defenderBooking: defender, challengerBooking: challenger },
          { transaction, Booking }
        ),
      'existing challenger already linked'
    );
  }

  console.log('contention.service tests passed');
}

run().catch((e) => {
  console.error('contention.service tests failed');
  console.error(e);
  process.exit(1);
});

