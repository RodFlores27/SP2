const { Room } = require('../models');
const { uploadToCloudinary } = require('../utils/cloudinary');
const { AUDIT_EVENT_TYPES, recordAuditEvent } = require('../utils/audit-log');

const normalizeCode = (value) => String(value || '').trim().toUpperCase();

const getAllRooms = async (req, res) => {
  try {
    const rooms = await Room.findAll({
      order: [['createdAt', 'DESC']],
    });
    res.json(rooms);
  } catch (error) {
    console.error('Error fetching rooms:', error);
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
};

const getRoomById = async (req, res) => {
  try {
    const { id } = req.params;
    const room = await Room.findByPk(id);

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    res.json(room);
  } catch (error) {
    console.error('Error fetching room:', error);
    res.status(500).json({ error: 'Failed to fetch room' });
  }
};

const createRoom = async (req, res) => {
  try {
    const { name, description, location, capacity, status } = req.body;
    const codeGroup = normalizeCode(req.body.codeGroup);
    const resourceCode = normalizeCode(req.body.resourceCode);

    if (!name || !description || !location || !capacity || !codeGroup || !resourceCode) {
      return res.status(400).json({ 
        error: 'Missing required fields: name, description, location, capacity, code group, and resource code are required' 
      });
    }

    let imageUrl = null;
    if (req.file) {
      try {
        imageUrl = await uploadToCloudinary(req.file.buffer, 'rooms');
      } catch (uploadError) {
        console.error('Cloudinary upload error:', uploadError);
        return res.status(500).json({ error: 'Failed to upload image' });
      }
    }

    const room = await Room.create({
      name,
      description,
      location,
      capacity: parseInt(capacity),
      imageUrl,
      codeGroup,
      resourceCode,
      status: status || 'available',
    });

    res.status(201).json(room);
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
};

const updateRoom = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, location, capacity, status, removeImage } = req.body;
    const codeGroup = req.body.codeGroup !== undefined ? normalizeCode(req.body.codeGroup) : undefined;
    const resourceCode = req.body.resourceCode !== undefined ? normalizeCode(req.body.resourceCode) : undefined;

    const room = await Room.findByPk(id);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const previousRoom = room.toJSON();
    let imageUrl = room.imageUrl;
    
    if (removeImage === 'true' || removeImage === true) {
      imageUrl = null;
    }
    
    if (req.file) {
      try {
        imageUrl = await uploadToCloudinary(req.file.buffer, 'rooms');
      } catch (uploadError) {
        console.error('Cloudinary upload error:', uploadError);
        return res.status(500).json({ error: 'Failed to upload image' });
      }
    }

    await room.update({
      name: name || room.name,
      description: description || room.description,
      location: location || room.location,
      capacity: capacity ? parseInt(capacity) : room.capacity,
      codeGroup: codeGroup || room.codeGroup,
      resourceCode: resourceCode || room.resourceCode,
      status: status || room.status,
      imageUrl,
    });

    await recordAuditEvent({
      eventType: AUDIT_EVENT_TYPES.RESOURCE_ROOM_UPDATED,
      actorUserId: req.user.id,
      resourceType: 'room',
      resourceId: room.id,
      status: room.status,
      payload: {
        roomId: room.id,
        previous: previousRoom,
        current: room.toJSON(),
      },
    });

    res.json(room);
  } catch (error) {
    console.error('Error updating room:', error);
    res.status(500).json({ error: 'Failed to update room' });
  }
};

const deleteRoom = async (req, res) => {
  try {
    const { id } = req.params;

    const room = await Room.findByPk(id);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    await room.destroy();
    res.json({ message: 'Room deleted successfully' });
  } catch (error) {
    console.error('Error deleting room:', error);
    res.status(500).json({ error: 'Failed to delete room' });
  }
};

module.exports = {
  getAllRooms,
  getRoomById,
  createRoom,
  updateRoom,
  deleteRoom,
};
