const { Equipment } = require('../models');
const { uploadToCloudinary } = require('../utils/cloudinary');

const getAllEquipment = async (req, res) => {
  try {
    const equipment = await Equipment.findAll({
      order: [['createdAt', 'DESC']],
    });
    res.json(equipment);
  } catch (error) {
    console.error('Error fetching equipment:', error);
    res.status(500).json({ error: 'Failed to fetch equipment' });
  }
};

const getEquipmentById = async (req, res) => {
  try {
    const { id } = req.params;
    const equipment = await Equipment.findByPk(id);

    if (!equipment) {
      return res.status(404).json({ error: 'Equipment not found' });
    }

    res.json(equipment);
  } catch (error) {
    console.error('Error fetching equipment:', error);
    res.status(500).json({ error: 'Failed to fetch equipment' });
  }
};

const createEquipment = async (req, res) => {
  try {
    const { name, category, description, status } = req.body;

    if (!name || !category || !description) {
      return res.status(400).json({ 
        error: 'Missing required fields: name, category, and description are required' 
      });
    }

    let imageUrl = null;
    if (req.file) {
      try {
        imageUrl = await uploadToCloudinary(req.file.buffer, 'ptcf/equipment');
      } catch (uploadError) {
        console.error('Cloudinary upload error:', uploadError);
        return res.status(500).json({ error: 'Failed to upload image' });
      }
    }

    const equipment = await Equipment.create({
      name,
      category,
      description,
      imageUrl,
      status: status || 'available',
    });

    res.status(201).json(equipment);
  } catch (error) {
    console.error('Error creating equipment:', error);
    res.status(500).json({ error: 'Failed to create equipment' });
  }
};

const updateEquipment = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, category, description, status } = req.body;

    const equipment = await Equipment.findByPk(id);
    if (!equipment) {
      return res.status(404).json({ error: 'Equipment not found' });
    }

    let imageUrl = equipment.imageUrl;
    if (req.file) {
      try {
        imageUrl = await uploadToCloudinary(req.file.buffer, 'ptcf/equipment');
      } catch (uploadError) {
        console.error('Cloudinary upload error:', uploadError);
        return res.status(500).json({ error: 'Failed to upload image' });
      }
    }

    await equipment.update({
      name: name || equipment.name,
      category: category || equipment.category,
      description: description || equipment.description,
      status: status || equipment.status,
      imageUrl,
    });

    res.json(equipment);
  } catch (error) {
    console.error('Error updating equipment:', error);
    res.status(500).json({ error: 'Failed to update equipment' });
  }
};

const deleteEquipment = async (req, res) => {
  try {
    const { id } = req.params;

    const equipment = await Equipment.findByPk(id);
    if (!equipment) {
      return res.status(404).json({ error: 'Equipment not found' });
    }

    await equipment.destroy();
    res.json({ message: 'Equipment deleted successfully' });
  } catch (error) {
    console.error('Error deleting equipment:', error);
    res.status(500).json({ error: 'Failed to delete equipment' });
  }
};

module.exports = {
  getAllEquipment,
  getEquipmentById,
  createEquipment,
  updateEquipment,
  deleteEquipment,
};
