const express = require('express');
const multer = require('multer');
const { authenticateToken, authorizeRoles } = require('../middleware/auth.middleware');
const {
  getAllEquipment,
  getEquipmentById,
  createEquipment,
  updateEquipment,
  deleteEquipment,
} = require('../controllers/equipment.controller');

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.'));
    }
  },
});

router.get('/', getAllEquipment);
router.get('/:id', authenticateToken, getEquipmentById);
router.post(
  '/',
  authenticateToken,
  authorizeRoles(['ptcf_staff', 'system_admin']),
  upload.single('image'),
  createEquipment
);
router.put(
  '/:id',
  authenticateToken,
  authorizeRoles(['ptcf_staff', 'system_admin']),
  upload.single('image'),
  updateEquipment
);
router.delete(
  '/:id',
  authenticateToken,
  authorizeRoles(['ptcf_staff', 'system_admin']),
  deleteEquipment
);

module.exports = router;
