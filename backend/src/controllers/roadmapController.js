/**
 * Контролер «Дорожньої карти» розвитку:
 *   GET  /api/roadmap        — повернути збережену roadmap (якщо є)
 *   POST /api/roadmap/generate — згенерувати нову roadmap на основі поточної статистики
 *
 * Зберігаємо в users/{uid}/profile/roadmap, щоб не витрачати квоту Gemini
 * на повторну генерацію при кожному заході в профіль.
 */

const { admin, db } = require('../config/firebase');
const { generateRoadmap } = require('../services/geminiService');
const { calculateUserStatistics } = require('../services/statisticsService');

const FieldValue = admin.firestore.FieldValue;

function handleError(res, err, prefix) {
  console.error(prefix, err);
  if (err.status === 429) {
    return res.status(429).json({
      error: 'Перевищено ліміт Gemini API. Спробуйте за хвилину або змініть GEMINI_MODEL у .env.',
    });
  }
  res.status(500).json({ error: err.message });
}

async function getRoadmap(req, res) {
  try {
    const ref = db
      .collection('users').doc(req.user.uid)
      .collection('profile').doc('roadmap');
    const snap = await ref.get();
    if (!snap.exists) return res.json({ roadmap: null });

    const data = snap.data();
    res.json({
      roadmap: data.content || null,
      generatedAt: data.generatedAt?.toDate().toISOString() || null,
      basedOnInterviews: data.basedOnInterviews || 0,
    });
  } catch (err) {
    handleError(res, err, '[getRoadmap]');
  }
}

async function postGenerateRoadmap(req, res) {
  try {
    // 1. Збираємо актуальну статистику
    const interviewsSnap = await db
      .collection('users').doc(req.user.uid)
      .collection('interviews').get();

    const interviews = interviewsSnap.docs.map((d) => {
      const data = d.data();
      return {
        status: data.status,
        topic: data.topic,
        completedAt: data.completedAt?.toDate().toISOString() || null,
        analysis: data.analysis || null,
      };
    });

    const stats = calculateUserStatistics(interviews);
    if (stats.totalInterviews === 0) {
      return res.status(400).json({
        error: 'Спочатку пройдіть хоча б одне інтерв\'ю для генерації roadmap.',
      });
    }

    const recentTopics = interviews
      .filter((i) => i.status === 'completed')
      .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))
      .slice(0, 5)
      .map((i) => i.topic);

    // 2. Генеруємо через Gemini
    const roadmap = await generateRoadmap(stats.byCriteria, recentTopics);

    // 3. Кешуємо
    await db
      .collection('users').doc(req.user.uid)
      .collection('profile').doc('roadmap')
      .set({
        content: roadmap,
        generatedAt: FieldValue.serverTimestamp(),
        basedOnInterviews: stats.totalInterviews,
      });

    res.json({
      roadmap,
      generatedAt: new Date().toISOString(),
      basedOnInterviews: stats.totalInterviews,
    });
  } catch (err) {
    handleError(res, err, '[generateRoadmap]');
  }
}

module.exports = { getRoadmap, postGenerateRoadmap };
