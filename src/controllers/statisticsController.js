/**
 * Контролер аналітики:
 *   GET /api/statistics — агрегована описова статистика користувача
 */

const { db } = require('../config/firebase');
const { calculateUserStatistics } = require('../services/statisticsService');

async function getUserStatistics(req, res) {
  try {
    const snap = await db
      .collection('users').doc(req.user.uid)
      .collection('interviews').get();

    const interviews = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        topic: data.topic,
        status: data.status,
        completedAt: data.completedAt?.toDate().toISOString() || null,
        analysis: data.analysis || null,
      };
    });

    res.json(calculateUserStatistics(interviews));
  } catch (err) {
    console.error('[getUserStatistics]', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getUserStatistics };
