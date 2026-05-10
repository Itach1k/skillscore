const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { getRoadmap, postGenerateRoadmap } = require('../controllers/roadmapController');

const router = express.Router();
router.use(verifyToken);

router.get('/', getRoadmap);
router.post('/generate', postGenerateRoadmap);

module.exports = router;
