const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { getUserStatistics } = require('../controllers/statisticsController');

const router = express.Router();
router.use(verifyToken);

router.get('/', getUserStatistics);

module.exports = router;
