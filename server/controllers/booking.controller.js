const { Booking, User, Equipment, Room } = require('../models');
const { Op } = require('sequelize');
const { uploadToCloudinary } = require('../utils/cloudinary');
const {
  notifyBookingCreated,
  notifyBookingApproved,
  notifyBookingDenied,
  notifyBookingCancelled,
} = require('../utils/booking-notifications');

const getUserAccountType = (req) => req.user?.accountType || req.user?.role;

async function resolveResourceName(resourceType, resourceId) {
  try {
    if (resourceType === 'equipment') {
      const eq = await Equipment.findByPk(resourceId, { attributes: ['name'] });
      return eq?.name ?? `Equipment #${resourceId}`;
    }
    if (resourceType === 'room') {
      const rm = await Room.findByPk(resourceId, { attributes: ['name'] });
      return rm?.name ?? `Room #${resourceId}`;
    }
  } catch {
    // non-fatal
  }
  return `Resource #${resourceId}`;
}

const createBooking = async (req, res) => {
  try {
    const { resourceType, resourceId, bookingType, startTime, endTime, purpose } = req.body;
    const confirmOverlapOwn = req.body.confirmOverlapOwn === true || req.body.confirmOverlapOwn === 'true';
    const userId = req.user.id;

    // Handle optional file upload for authorization document
    let authorizationDocUrl = req.body.authorizationDocUrl || null;
    if (req.file) {
      authorizationDocUrl = await uploadToCloudinary(req.file.buffer, 'ptcf/authorization-docs');
    }

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

    if (!['available', 'in-use'].includes(resource.status)) {
      return res.status(400).json({ 
        error: `Cannot book ${resourceType}. Current status: ${resource.status}` 
      });
    }

    const conflicts = await Booking.findConflicts(resourceType, resourceId, start, end);

    // Split conflicts: user's own pencil bookings vs other bookings
    const ownPencilConflicts = conflicts.filter(c => c.userId === userId && c.bookingType === 'pencil');
    const otherConflicts = conflicts.filter(c => !(c.userId === userId && c.bookingType === 'pencil'));

    const formatConflicts = (list) => list.map(c => ({
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

    if (conflicts.length > 0) {
      if (bookingType === 'firm') {
        // Firm bookings cannot overlap with other users' bookings or other firm bookings
        if (otherConflicts.length > 0) {
          return res.status(409).json({
            error: 'Firm booking conflicts with existing bookings',
            conflicts: formatConflicts(otherConflicts)
          });
        }

        // Firm booking overlaps only user's own pencil bookings — require confirmation
        if (ownPencilConflicts.length > 0 && !confirmOverlapOwn) {
          return res.status(409).json({
            error: 'Firm booking overlaps your existing pencil booking(s). Confirm to proceed — overlapping pencil bookings will be cancelled.',
            requiresConfirmation: true,
            ownPencilConflicts: formatConflicts(ownPencilConflicts)
          });
        }
      }

      if (bookingType === 'pencil') {
        // Pencil bookings from the same user cannot overlap their own pencil bookings
        if (ownPencilConflicts.length > 0) {
          return res.status(409).json({
            error: 'You already have a pencil booking for this time slot',
            conflicts: formatConflicts(ownPencilConflicts)
          });
        }
      }
    }

    // If firm booking confirmed over own pencil bookings, auto-cancel them
    let cancelledPencilBookings = [];
    if (bookingType === 'firm' && ownPencilConflicts.length > 0 && confirmOverlapOwn) {
      for (const pencilBooking of ownPencilConflicts) {
        pencilBooking.status = 'cancelled';
        pencilBooking.staffRemark = 'Auto-cancelled: superseded by firm booking';
        await pencilBooking.save();
        cancelledPencilBookings.push(pencilBooking.id);
      }
    }

    const expiryAt = bookingType === 'pencil' 
      ? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
      : null;

    // Determine status (re-check conflicts excluding cancelled own pencil bookings)
    const remainingConflicts = otherConflicts;
    let status = 'penciled';
    if (remainingConflicts.length > 0) {
      status = 'contested';
    } else if (bookingType === 'firm') {
      status = 'pending_approval';
    }

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

    // Also mark existing penciled bookings as contested (both sides of overlap)
    if (status === 'contested') {
      const pencilConflictIds = otherConflicts
        .filter(c => c.status === 'penciled')
        .map(c => c.id);
      if (pencilConflictIds.length > 0) {
        await Booking.update(
          { status: 'contested' },
          { where: { id: { [Op.in]: pencilConflictIds } } }
        );
      }
    }

    const createdBooking = await Booking.findByPk(booking.id, {
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'email', 'accountType', 'userCategory']
      }]
    });

    const response = {
      booking: createdBooking,
      message: cancelledPencilBookings.length > 0
        ? `Booking created successfully. ${cancelledPencilBookings.length} overlapping pencil booking(s) were cancelled.`
        : remainingConflicts.length > 0 
          ? 'Booking created but conflicts with existing bookings. Status set to "contested".'
          : 'Booking created successfully'
    };

    if (cancelledPencilBookings.length > 0) {
      response.cancelledPencilBookings = cancelledPencilBookings;
    }

    if (remainingConflicts.length > 0) {
      response.conflicts = formatConflicts(remainingConflicts);
    }

    res.status(201).json(response);

    // Non-blocking email notification
    resolveResourceName(resourceType, resourceId).then((resourceName) => {
      notifyBookingCreated(createdBooking, resourceName).catch(() => {});
    });
  } catch (error) {
    console.error('Error creating booking:', error);
    res.status(500).json({ error: 'Failed to create booking' });
  }
};

const getAllBookings = async (req, res) => {
  try {
    const userId = req.user.id;
    const userAccountType = getUserAccountType(req);
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
    const userAccountType = getUserAccountType(req);

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

const cancelBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userAccountType = getUserAccountType(req);

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
      return res.status(403).json({ error: 'Access denied. You can only cancel your own bookings.' });
    }

    if (['cancelled', 'denied', 'expired'].includes(booking.status)) {
      return res.status(400).json({ error: `Booking is already ${booking.status}` });
    }

    const now = new Date();
    const startTime = new Date(booking.startTime);
    const hoursUntilStart = (startTime - now) / (1000 * 60 * 60);

    if (hoursUntilStart < 24) {
      return res.status(400).json({ 
        error: 'Cannot cancel booking within 24 hours of start time',
        hoursUntilStart: hoursUntilStart.toFixed(2)
      });
    }

    booking.status = 'cancelled';
    await booking.save();

    res.json({
      message: 'Booking cancelled successfully',
      booking
    });

    // Non-blocking email notification
    const cancelledById = req.user.id;
    resolveResourceName(booking.resourceType, booking.resourceId).then((resourceName) => {
      notifyBookingCancelled(booking, resourceName, cancelledById).catch(() => {});
    });
  } catch (error) {
    console.error('Error cancelling booking:', error);
    res.status(500).json({ error: 'Failed to cancel booking' });
  }
};

const convertToFirm = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    if (!req.file) {
      return res.status(400).json({ 
        error: 'Authorization document is required when converting to firm booking' 
      });
    }

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

    if (booking.userId !== userId) {
      return res.status(403).json({ error: 'Access denied. You can only convert your own bookings.' });
    }

    if (booking.bookingType === 'firm') {
      return res.status(400).json({ error: 'Booking is already a firm booking' });
    }

    if (['cancelled', 'denied', 'expired'].includes(booking.status)) {
      return res.status(400).json({ 
        error: `Cannot convert ${booking.status} booking to firm` 
      });
    }

    const conflicts = await Booking.findConflicts(
      booking.resourceType, 
      booking.resourceId, 
      booking.startTime, 
      booking.endTime,
      booking.id
    );

    if (conflicts.length > 0) {
      return res.status(409).json({
        error: 'Cannot convert to firm booking due to conflicts with existing bookings',
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

    const authDocUrl = await uploadToCloudinary(req.file.buffer, 'ptcf/authorization-docs');

    booking.bookingType = 'firm';
    booking.status = 'pending_approval';
    booking.authorizationDocUrl = authDocUrl;
    booking.expiryAt = null;
    await booking.save();

    const updatedBooking = await Booking.findByPk(booking.id, {
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'email', 'accountType', 'userCategory']
      }]
    });

    res.json({
      message: 'Booking converted to firm successfully. Awaiting staff approval.',
      booking: updatedBooking
    });
  } catch (error) {
    console.error('Error converting booking to firm:', error);
    res.status(500).json({ error: 'Failed to convert booking to firm' });
  }
};

const approveBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const { staffRemark } = req.body;

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

    if (!['pending_approval', 'contested'].includes(booking.status)) {
      return res.status(400).json({ 
        error: `Cannot approve booking with status: ${booking.status}. Only pending_approval or contested bookings can be approved.` 
      });
    }

    booking.status = 'approved';
    if (staffRemark) {
      booking.staffRemark = staffRemark;
    }
    await booking.save();

    const updatedBooking = await Booking.findByPk(booking.id, {
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'email', 'accountType', 'userCategory']
      }]
    });

    res.json({
      message: 'Booking approved successfully',
      booking: updatedBooking
    });

    // Non-blocking email notification
    resolveResourceName(updatedBooking.resourceType, updatedBooking.resourceId).then((resourceName) => {
      notifyBookingApproved(updatedBooking, resourceName).catch(() => {});
    });
  } catch (error) {
    console.error('Error approving booking:', error);
    res.status(500).json({ error: 'Failed to approve booking' });
  }
};

const denyBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const { staffRemark } = req.body;

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

    if (['denied', 'cancelled', 'expired'].includes(booking.status)) {
      return res.status(400).json({ 
        error: `Booking is already ${booking.status}` 
      });
    }

    booking.status = 'denied';
    if (staffRemark) {
      booking.staffRemark = staffRemark;
    }
    await booking.save();

    const updatedBooking = await Booking.findByPk(booking.id, {
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'email', 'accountType', 'userCategory']
      }]
    });

    res.json({
      message: 'Booking denied',
      booking: updatedBooking
    });

    // Non-blocking email notification
    resolveResourceName(updatedBooking.resourceType, updatedBooking.resourceId).then((resourceName) => {
      notifyBookingDenied(updatedBooking, resourceName).catch(() => {});
    });
  } catch (error) {
    console.error('Error denying booking:', error);
    res.status(500).json({ error: 'Failed to deny booking' });
  }
};

const getAvailability = async (req, res) => {
  try {
    const { resourceType, resourceId, startDate, endDate } = req.query;

    const whereClause = {
      status: {
        [Op.notIn]: ['cancelled', 'denied', 'expired']
      }
    };

    if (resourceType) {
      if (!['equipment', 'room'].includes(resourceType)) {
        return res.status(400).json({ error: 'Invalid resourceType. Must be "equipment" or "room"' });
      }
      whereClause.resourceType = resourceType;
    }

    if (resourceId) {
      whereClause.resourceId = parseInt(resourceId, 10);
    }

    if (startDate) {
      const start = new Date(startDate);
      if (isNaN(start.getTime())) {
        return res.status(400).json({ error: 'Invalid startDate format' });
      }
      whereClause.endTime = { [Op.gte]: start };
    }

    if (endDate) {
      const end = new Date(endDate);
      if (isNaN(end.getTime())) {
        return res.status(400).json({ error: 'Invalid endDate format' });
      }
      whereClause.startTime = { 
        ...(whereClause.startTime || {}),
        [Op.lte]: end 
      };
    }

    const bookings = await Booking.findAll({
      where: whereClause,
      attributes: ['id', 'resourceType', 'resourceId', 'bookingType', 'status', 'startTime', 'endTime'],
      order: [['startTime', 'ASC']]
    });

    res.json(bookings);
  } catch (error) {
    console.error('Error fetching availability:', error);
    res.status(500).json({ error: 'Failed to fetch availability' });
  }
};

const getBookingConflicts = async (req, res) => {
  try {
    const { id } = req.params;

    const booking = await Booking.findByPk(id);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const conflicts = await Booking.findConflicts(
      booking.resourceType,
      booking.resourceId,
      booking.startTime,
      booking.endTime,
      booking.id
    );

    res.json(conflicts);
  } catch (error) {
    console.error('Error fetching booking conflicts:', error);
    res.status(500).json({ error: 'Failed to fetch booking conflicts' });
  }
};

module.exports = {
  createBooking,
  getAllBookings,
  getBookingById,
  getAvailability,
  cancelBooking,
  convertToFirm,
  approveBooking,
  denyBooking,
  getBookingConflicts
};
