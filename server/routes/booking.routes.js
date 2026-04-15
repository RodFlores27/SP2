const express = require('express');
const multer = require('multer');
const { authenticateToken, authorizeRoles } = require('../middleware/auth.middleware');
const {
  createBooking,
  getAllBookings,
  getBookingById,
  getAvailability,
  cancelBooking,
  convertToFirm,
  approveBooking,
  denyBooking,
  getBookingConflicts
} = require('../controllers/booking.controller');

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png'
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOC, DOCX, JPG, and PNG are allowed.'));
    }
  },
});

router.get('/availability', getAvailability);

router.post('/', authenticateToken, upload.single('authorizationDoc'), createBooking);
router.get('/', authenticateToken, getAllBookings);
router.get('/:id', authenticateToken, getBookingById);

router.patch('/:id/cancel', authenticateToken, cancelBooking);
router.patch('/:id/convert-to-firm', authenticateToken, upload.single('authorizationDoc'), convertToFirm);

router.patch('/:id/approve', authenticateToken, authorizeRoles(['ptcf_staff', 'system_admin']), approveBooking);
router.patch('/:id/deny', authenticateToken, authorizeRoles(['ptcf_staff', 'system_admin']), denyBooking);
router.get('/:id/conflicts', authenticateToken, authorizeRoles(['ptcf_staff', 'system_admin']), getBookingConflicts);

module.exports = router;
