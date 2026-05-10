const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { getBenchmarksHandler } = require('../controllers/benchmarkController');

const router = express.Router();
router.use(verifyToken);

router.get('/', getBenchmarksHandler);

module.exports = router;
