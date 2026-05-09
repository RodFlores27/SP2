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
    const { name, description, location, zone, ppe, capacity, status } = req.body;
    const resourceCode = normalizeCode(req.body.resourceCode);

    if (!name || !description || !location || !capacity || !resourceCode) {
      return res.status(400).json({ 
        error: 'Missing required fields: name, description, location, capacity, and room code are required' 
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
      zone: String(zone || '').trim() || null,
      ppe: String(ppe || '').trim() || null,
      capacity: parseInt(capacity),
      imageUrl,
      resourceCode,
      status: status || 'available',
    });

    await recordAuditEvent({
      eventType: AUDIT_EVENT_TYPES.RESOURCE_ROOM_CREATED,
      actorUserId: req.user.id,
      resourceType: 'room',
      resourceId: room.id,
      status: room.status,
      payload: {
        roomId: room.id,
        current: room.toJSON(),
      },
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
    const { name, description, location, zone, ppe, capacity, status, removeImage } = req.body;
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
      zone: zone !== undefined ? String(zone).trim() || null : room.zone,
      ppe: ppe !== undefined ? String(ppe).trim() || null : room.ppe,
      capacity: capacity ? parseInt(capacity) : room.capacity,
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

    const deletedRoom = room.toJSON();

    await room.destroy();

    await recordAuditEvent({
      eventType: AUDIT_EVENT_TYPES.RESOURCE_ROOM_DELETED,
      actorUserId: req.user.id,
      resourceType: 'room',
      resourceId: deletedRoom.id,
      status: deletedRoom.status || null,
      payload: {
        roomId: deletedRoom.id,
        previous: deletedRoom,
      },
    });

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
