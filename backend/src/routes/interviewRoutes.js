const express = require('express');
const { verifyToken } = require('../middleware/auth');
const c = require('../controllers/interviewController');

const router = express.Router();
router.use(verifyToken);

router.post('/start', c.startInterview);
router.post('/message', c.sendMessage);
router.post('/complete', c.completeInterview);
router.get('/', c.getInterviews);
router.delete('/all', c.deleteAllInterviews);  // важливо: /all має бути ПЕРЕД /:id
router.get('/:id', c.getInterview);
router.delete('/:id', c.deleteInterview);

module.exports = router;
