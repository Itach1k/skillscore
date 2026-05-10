const express = require('express');
const multer = require('multer');
const { verifyToken } = require('../middleware/auth');
const { analyzeCv } = require('../controllers/cvController');
const { SUPPORTED_TYPES } = require('../services/cvService');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (SUPPORTED_TYPES[file.mimetype]) cb(null, true);
    else cb(new Error('Підтримуються лише PDF та DOCX'));
  },
});

router.use(verifyToken);

// Обгортка для перетворення multer-помилок у JSON
router.post('/analyze', (req, res, next) => {
  upload.single('cv')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'Файл занадто великий. Максимум — 5MB.' });
      }
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, analyzeCv);

module.exports = router;
