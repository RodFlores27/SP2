const { Room } = require('../models');
const { uploadToCloudinary } = require('../utils/cloudinary');

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

    if (!name || !description || !location || !capacity) {
      return res.status(400).json({ 
        error: 'Missing required fields: name, description, location, and capacity are required' 
      });
    }

    let imageUrl = null;
    if (req.file) {
      try {
        imageUrl = await uploadToCloudinary(req.file.buffer, 'ptcf/rooms');
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
    const { name, description, location, capacity, status } = req.body;

    const room = await Room.findByPk(id);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    let imageUrl = room.imageUrl;
    if (req.file) {
      try {
        imageUrl = await uploadToCloudinary(req.file.buffer, 'ptcf/rooms');
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
      status: status || room.status,
      imageUrl,
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
