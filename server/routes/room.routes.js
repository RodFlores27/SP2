const express = require('express');
const multer = require('multer');
const { authenticateToken, authorizeRoles } = require('../middleware/auth.middleware');
const {
  getAllRooms,
  getRoomById,
  createRoom,
  updateRoom,
  deleteRoom,
} = require('../controllers/room.controller');

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

router.get('/', authenticateToken, getAllRooms);
router.get('/:id', authenticateToken, getRoomById);
router.post(
  '/',
  authenticateToken,
  authorizeRoles(['ptcf_staff', 'system_admin']),
  upload.single('image'),
  createRoom
);
router.put(
  '/:id',
  authenticateToken,
  authorizeRoles(['ptcf_staff', 'system_admin']),
  upload.single('image'),
  updateRoom
);
router.delete(
  '/:id',
  authenticateToken,
  authorizeRoles(['ptcf_staff', 'system_admin']),
  deleteRoom
);

module.exports = router;
