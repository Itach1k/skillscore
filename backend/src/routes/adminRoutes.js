const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { getErrorLogs, postClearLogs } = require('../controllers/adminController');

const router = express.Router();
router.use(verifyToken);

router.get('/logs', getErrorLogs);
router.post('/logs/clear', postClearLogs);

module.exports = router;
