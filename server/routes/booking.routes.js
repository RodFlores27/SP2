const express = require('express');
const { authenticateToken } = require('../middleware/auth.middleware');
const {
  createBooking,
  getAllBookings,
  getBookingById
} = require('../controllers/booking.controller');

const router = express.Router();

router.post('/', authenticateToken, createBooking);
router.get('/', authenticateToken, getAllBookings);
router.get('/:id', authenticateToken, getBookingById);

module.exports = router;
