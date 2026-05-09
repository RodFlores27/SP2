const { Equipment } = require('../models');
const { uploadToCloudinary } = require('../utils/cloudinary');
const { AUDIT_EVENT_TYPES, recordAuditEvent } = require('../utils/audit-log');

const normalizeCode = (value) => String(value || '').trim().toUpperCase();
const normalizeEquipmentCode = (value) => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
const isValidCodeGroup = (value) => /^[A-Z0-9]{2,16}$/.test(value);
const isValidEquipmentResourceCode = (value) =>
  /^[A-Z0-9-]{2,64}$/.test(value) && !value.startsWith('-') && !value.endsWith('-') && !value.includes('--');

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
    const codeGroup = normalizeCode(req.body.codeGroup);
    const resourceCode = normalizeEquipmentCode(req.body.resourceCode);

    if (!name || !category || !description || !codeGroup || !resourceCode) {
      return res.status(400).json({ 
        error: 'Missing required fields: name, category, description, code group, and resource code are required' 
      });
    }
    if (!isValidCodeGroup(codeGroup)) {
      return res.status(400).json({ error: 'Code group must be 2-16 characters using letters and numbers only' });
    }
    if (!isValidEquipmentResourceCode(resourceCode)) {
      return res.status(400).json({
        error:
          'Equipment code must be 2-64 characters using letters, numbers, and hyphen (no leading, trailing, or repeated hyphens)',
      });
    }

    let imageUrl = null;
    if (req.file) {
      try {
        imageUrl = await uploadToCloudinary(req.file.buffer, 'equipment');
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
      codeGroup,
      resourceCode,
      status: status || 'available',
    });

    await recordAuditEvent({
      eventType: AUDIT_EVENT_TYPES.RESOURCE_EQUIPMENT_CREATED,
      actorUserId: req.user.id,
      resourceType: 'equipment',
      resourceId: equipment.id,
      status: equipment.status,
      payload: {
        equipmentId: equipment.id,
        current: equipment.toJSON(),
      },
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
    const { name, category, description, status, removeImage } = req.body;
    const codeGroup = req.body.codeGroup !== undefined ? normalizeCode(req.body.codeGroup) : undefined;
    const resourceCode = req.body.resourceCode !== undefined ? normalizeEquipmentCode(req.body.resourceCode) : undefined;
    if (codeGroup !== undefined && !isValidCodeGroup(codeGroup)) {
      return res.status(400).json({ error: 'Code group must be 2-16 characters using letters and numbers only' });
    }
    if (resourceCode !== undefined && !isValidEquipmentResourceCode(resourceCode)) {
      return res.status(400).json({
        error:
          'Equipment code must be 2-64 characters using letters, numbers, and hyphen (no leading, trailing, or repeated hyphens)',
      });
    }

    const equipment = await Equipment.findByPk(id);
    if (!equipment) {
      return res.status(404).json({ error: 'Equipment not found' });
    }

    const previousEquipment = equipment.toJSON();
    let imageUrl = equipment.imageUrl;
    
    if (removeImage === 'true') {
      imageUrl = null;
    }
    
    if (req.file) {
      try {
        imageUrl = await uploadToCloudinary(req.file.buffer, 'equipment');
      } catch (uploadError) {
        console.error('Cloudinary upload error:', uploadError);
        return res.status(500).json({ error: 'Failed to upload image' });
      }
    }

    await equipment.update({
      name: name || equipment.name,
      category: category || equipment.category,
      description: description || equipment.description,
      codeGroup: codeGroup || equipment.codeGroup,
      resourceCode: resourceCode || equipment.resourceCode,
      status: status || equipment.status,
      imageUrl,
    });

    await recordAuditEvent({
      eventType: AUDIT_EVENT_TYPES.RESOURCE_EQUIPMENT_UPDATED,
      actorUserId: req.user.id,
      resourceType: 'equipment',
      resourceId: equipment.id,
      status: equipment.status,
      payload: {
        equipmentId: equipment.id,
        previous: previousEquipment,
        current: equipment.toJSON(),
      },
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

    const deletedEquipment = equipment.toJSON();

    await equipment.destroy();

    await recordAuditEvent({
      eventType: AUDIT_EVENT_TYPES.RESOURCE_EQUIPMENT_DELETED,
      actorUserId: req.user.id,
      resourceType: 'equipment',
      resourceId: deletedEquipment.id,
      status: deletedEquipment.status || null,
      payload: {
        equipmentId: deletedEquipment.id,
        previous: deletedEquipment,
      },
    });

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
