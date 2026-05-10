/**
 * Контролер інтерв'ю. Реалізує:
 *   POST  /api/interview/start      — створити сесію
 *   POST  /api/interview/message    — відправити повідомлення
 *   POST  /api/interview/complete   — завершити та проаналізувати
 *   GET   /api/interview            — список інтерв'ю користувача
 *   GET   /api/interview/:id        — повний транскрипт
 */

const { admin, db } = require('../config/firebase');
const { generateInterviewResponse, analyzeInterview } = require('../services/geminiService');
const { handleApiError } = require('../utils/errorHandler');

const FieldValue = admin.firestore.FieldValue;

// Локальна обгортка для збереження старої сигнатури викликів
const handleError = (res, err, prefix) => handleApiError(res, err, prefix);

/** Гарантуємо, що документ users/{uid} існує (створюємо при першому інтерв'ю). */
async function ensureUserDoc(user) {
  const ref = db.collection('users').doc(user.uid);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      email: user.email || null,
      displayName: user.name || null,
      photoURL: user.picture || null,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  return ref;
}

async function startInterview(req, res) {
  try {
    const { topic, mode = 'technical', vacancyText, cvSkills } = req.body;

    if (!['technical', 'softskills', 'vacancy', 'cv'].includes(mode)) {
      return res.status(400).json({ error: 'invalid mode' });
    }

    // Валідація залежно від режиму
    if (mode === 'cv') {
      if (!Array.isArray(cvSkills) || cvSkills.length === 0) {
        return res.status(400).json({ error: 'cvSkills must be a non-empty array' });
      }
    } else {
      if (!topic || typeof topic !== 'string') {
        return res.status(400).json({ error: 'topic is required' });
      }
    }
    if (mode === 'vacancy' && (!vacancyText || vacancyText.trim().length < 30)) {
      return res.status(400).json({ error: 'vacancyText too short (мін. 30 символів)' });
    }

    const userRef = await ensureUserDoc(req.user);

    // Для CV-режиму topic для Gemini — це масив скілів,
    // але у БД зберігаємо людський заголовок.
    const displayTopic = mode === 'cv'
      ? (topic && topic.trim() ? topic.trim() : `Інтерв'ю за резюме (${cvSkills.slice(0, 3).join(', ')}${cvSkills.length > 3 ? '…' : ''})`)
      : topic;

    const cfg = {
      mode,
      topic: mode === 'cv' ? cvSkills : topic,
      vacancyText,
    };

    const greeting = await generateInterviewResponse(
      cfg,
      [],
      `Привіт! Я готовий до інтерв'ю. Постав мені перше питання.`
    );

    const now = new Date().toISOString();
    const interviewData = {
      topic: displayTopic,
      mode,
      status: 'in-progress',
      createdAt: FieldValue.serverTimestamp(),
      messages: [{ role: 'assistant', content: greeting, timestamp: now }],
    };
    if (mode === 'vacancy') interviewData.vacancyText = vacancyText;
    if (mode === 'cv') interviewData.cvSkills = cvSkills;

    const interviewRef = await userRef.collection('interviews').add(interviewData);
    res.json({ interviewId: interviewRef.id, message: greeting });
  } catch (err) {
    handleError(res, err, '[startInterview]');
  }
}

async function sendMessage(req, res) {
  try {
    const { interviewId, message } = req.body;
    if (!interviewId || !message) {
      return res.status(400).json({ error: 'interviewId and message are required' });
    }

    const ref = db
      .collection('users').doc(req.user.uid)
      .collection('interviews').doc(interviewId);

    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Interview not found' });

    const data = snap.data();
    if (data.status !== 'in-progress') {
      return res.status(400).json({ error: 'Interview already completed' });
    }

    const now = new Date().toISOString();
    const history = data.messages || [];
    const cfg = {
      mode: data.mode || 'technical',
      topic: data.mode === 'cv' ? (data.cvSkills || []) : data.topic,
      vacancyText: data.vacancyText,
    };
    const aiResponse = await generateInterviewResponse(cfg, history, message);

    const updatedMessages = [
      ...history,
      { role: 'user', content: message, timestamp: now },
      { role: 'assistant', content: aiResponse, timestamp: new Date().toISOString() },
    ];

    await ref.update({ messages: updatedMessages });
    res.json({ message: aiResponse });
  } catch (err) {
    handleError(res, err, '[sendMessage]');
  }
}

async function completeInterview(req, res) {
  try {
    const { interviewId } = req.body;
    if (!interviewId) return res.status(400).json({ error: 'interviewId is required' });

    const ref = db
      .collection('users').doc(req.user.uid)
      .collection('interviews').doc(interviewId);

    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Interview not found' });

    const data = snap.data();
    if (data.status === 'completed') {
      return res.json({ analysis: data.analysis });
    }

    if (!data.messages || data.messages.length < 3) {
      return res.status(400).json({ error: 'Інтерв\'ю занадто коротке для аналізу' });
    }

    const analysis = await analyzeInterview(data.topic, data.messages);

    await ref.update({
      status: 'completed',
      completedAt: FieldValue.serverTimestamp(),
      analysis,
    });

    res.json({ analysis });
  } catch (err) {
    handleError(res, err, '[completeInterview]');
  }
}

function serializeInterview(doc) {
  const d = doc.data();
  return {
    id: doc.id,
    topic: d.topic,
    mode: d.mode || 'technical',
    status: d.status,
    createdAt: d.createdAt?.toDate().toISOString() || null,
    completedAt: d.completedAt?.toDate().toISOString() || null,
    messages: d.messages || [],
    analysis: d.analysis || null,
    cvSkills: d.cvSkills || null,
  };
}

async function getInterviews(req, res) {
  try {
    const snap = await db
      .collection('users').doc(req.user.uid)
      .collection('interviews')
      .orderBy('createdAt', 'desc')
      .get();
    res.json({ interviews: snap.docs.map(serializeInterview) });
  } catch (err) {
    console.error('[getInterviews]', err);
    res.status(500).json({ error: err.message });
  }
}

async function getInterview(req, res) {
  try {
    const snap = await db
      .collection('users').doc(req.user.uid)
      .collection('interviews').doc(req.params.id)
      .get();
    if (!snap.exists) return res.status(404).json({ error: 'Not found' });
    res.json(serializeInterview(snap));
  } catch (err) {
    console.error('[getInterview]', err);
    res.status(500).json({ error: err.message });
  }
}

async function deleteInterview(req, res) {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ error: 'id is required' });

    const ref = db
      .collection('users').doc(req.user.uid)
      .collection('interviews').doc(id);

    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Not found' });

    await ref.delete();
    res.json({ success: true, deleted: 1 });
  } catch (err) {
    console.error('[deleteInterview]', err);
    res.status(500).json({ error: err.message });
  }
}

async function deleteAllInterviews(req, res) {
  try {
    const collRef = db
      .collection('users').doc(req.user.uid)
      .collection('interviews');

    const snap = await collRef.get();
    if (snap.empty) return res.json({ success: true, deleted: 0 });

    // Firestore обмежує batch до 500 операцій — обробляємо порціями.
    const docs = snap.docs;
    let deleted = 0;
    const BATCH_SIZE = 400;

    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      docs.slice(i, i + BATCH_SIZE).forEach((d) => batch.delete(d.ref));
      await batch.commit();
      deleted += Math.min(BATCH_SIZE, docs.length - i);
    }

    // Видаляємо також закешовану roadmap — вона стала неактуальною
    try {
      await db
        .collection('users').doc(req.user.uid)
        .collection('profile').doc('roadmap').delete();
    } catch { /* roadmap може не існувати — ігноруємо */ }

    res.json({ success: true, deleted });
  } catch (err) {
    console.error('[deleteAllInterviews]', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  startInterview, sendMessage, completeInterview,
  getInterviews, getInterview,
  deleteInterview, deleteAllInterviews,
};
