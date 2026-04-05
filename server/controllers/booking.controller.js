const { Booking, User, Equipment, Room } = require('../models');
const { Op } = require('sequelize');

const createBooking = async (req, res) => {
  try {
    const { resourceType, resourceId, bookingType, startTime, endTime, purpose, authorizationDocUrl } = req.body;
    const userId = req.user.id;

    if (!resourceType || !resourceId || !bookingType || !startTime || !endTime) {
      return res.status(400).json({
        error: 'Missing required fields: resourceType, resourceId, bookingType, startTime, and endTime are required'
      });
    }

    if (!['equipment', 'room'].includes(resourceType)) {
      return res.status(400).json({ error: 'Invalid resourceType. Must be "equipment" or "room"' });
    }

    if (!['pencil', 'firm'].includes(bookingType)) {
      return res.status(400).json({ error: 'Invalid bookingType. Must be "pencil" or "firm"' });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Invalid date format for startTime or endTime' });
    }

    if (start >= end) {
      return res.status(400).json({ error: 'endTime must be after startTime' });
    }

    if (start < new Date()) {
      return res.status(400).json({ error: 'Cannot create booking in the past' });
    }

    let resource;
    if (resourceType === 'equipment') {
      resource = await Equipment.findByPk(resourceId);
    } else {
      resource = await Room.findByPk(resourceId);
    }

    if (!resource) {
      return res.status(404).json({ error: `${resourceType} not found` });
    }

    if (resource.status !== 'available') {
      return res.status(400).json({ 
        error: `Cannot book ${resourceType}. Current status: ${resource.status}` 
      });
    }

    const conflicts = await Booking.findConflicts(resourceType, resourceId, start, end);

    if (conflicts.length > 0) {
      if (bookingType === 'firm') {
        return res.status(409).json({
          error: 'Firm booking conflicts with existing bookings',
          conflicts: conflicts.map(c => ({
            id: c.id,
            bookingType: c.bookingType,
            status: c.status,
            startTime: c.startTime,
            endTime: c.endTime,
            user: {
              id: c.user.id,
              email: c.user.email
            }
          }))
        });
      }
    }

    const expiryAt = bookingType === 'pencil' 
      ? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
      : null;

    const status = conflicts.length > 0 ? 'contested' : 'penciled';

    const booking = await Booking.create({
      userId,
      resourceType,
      resourceId,
      bookingType,
      status,
      startTime: start,
      endTime: end,
      purpose,
      authorizationDocUrl,
      expiryAt
    });

    const createdBooking = await Booking.findByPk(booking.id, {
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'email', 'accountType', 'userCategory']
      }]
    });

    const response = {
      booking: createdBooking,
      message: conflicts.length > 0 
        ? 'Booking created but conflicts with existing bookings. Status set to "contested".'
        : 'Booking created successfully'
    };

    if (conflicts.length > 0) {
      response.conflicts = conflicts.map(c => ({
        id: c.id,
        bookingType: c.bookingType,
        status: c.status,
        startTime: c.startTime,
        endTime: c.endTime,
        user: {
          id: c.user.id,
          email: c.user.email
        }
      }));
    }

    res.status(201).json(response);
  } catch (error) {
    console.error('Error creating booking:', error);
    res.status(500).json({ error: 'Failed to create booking' });
  }
};

const getAllBookings = async (req, res) => {
  try {
    const userId = req.user.id;
    const userAccountType = req.user.accountType;
    const { status, resourceType } = req.query;

    const whereClause = {};

    if (userAccountType !== 'ptcf_staff' && userAccountType !== 'system_admin') {
      whereClause.userId = userId;
    }

    if (status) {
      whereClause.status = status;
    }

    if (resourceType) {
      if (!['equipment', 'room'].includes(resourceType)) {
        return res.status(400).json({ error: 'Invalid resourceType. Must be "equipment" or "room"' });
      }
      whereClause.resourceType = resourceType;
    }

    const bookings = await Booking.findAll({
      where: whereClause,
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'email', 'accountType', 'userCategory']
      }],
      order: [['startTime', 'DESC']]
    });

    res.json(bookings);
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
};

const getBookingById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userAccountType = req.user.accountType;

    const booking = await Booking.findByPk(id, {
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'email', 'accountType', 'userCategory']
      }]
    });

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    if (booking.userId !== userId && 
        userAccountType !== 'ptcf_staff' && 
        userAccountType !== 'system_admin') {
      return res.status(403).json({ error: 'Access denied. You can only view your own bookings.' });
    }

    res.json(booking);
  } catch (error) {
    console.error('Error fetching booking:', error);
    res.status(500).json({ error: 'Failed to fetch booking' });
  }
};

module.exports = {
  createBooking,
  getAllBookings,
  getBookingById
};
