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

const FieldValue = admin.firestore.FieldValue;

/** Дружня обробка помилок від Gemini API. */
function handleError(res, err, prefix) {
  console.error(prefix, err);
  if (err.status === 429) {
    const retryInfo = err.errorDetails?.find((d) =>
      String(d['@type']).includes('RetryInfo')
    );
    const retryDelay = retryInfo?.retryDelay || '60s';
    return res.status(429).json({
      error: `Перевищено ліміт безкоштовного тиру Gemini API. Спробуйте через ${retryDelay}, ` +
        `або змініть GEMINI_MODEL у backend/.env на gemini-2.5-flash-lite (15 RPM / 1000 RPD).`,
    });
  }
  res.status(500).json({ error: err.message });
}

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
    const { topic, mode = 'technical', vacancyText } = req.body;
    if (!topic || typeof topic !== 'string') {
      return res.status(400).json({ error: 'topic is required' });
    }
    if (!['technical', 'softskills', 'vacancy'].includes(mode)) {
      return res.status(400).json({ error: 'invalid mode' });
    }
    if (mode === 'vacancy' && (!vacancyText || vacancyText.trim().length < 30)) {
      return res.status(400).json({ error: 'vacancyText too short (мін. 30 символів)' });
    }

    const userRef = await ensureUserDoc(req.user);
    const cfg = { mode, topic, vacancyText };

    const greeting = await generateInterviewResponse(
      cfg,
      [],
      `Привіт! Я готовий до інтерв'ю на тему «${topic}». Постав мені перше питання.`
    );

    const now = new Date().toISOString();
    const interviewData = {
      topic,
      mode,
      status: 'in-progress',
      createdAt: FieldValue.serverTimestamp(),
      messages: [{ role: 'assistant', content: greeting, timestamp: now }],
    };
    if (mode === 'vacancy') interviewData.vacancyText = vacancyText;

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
      topic: data.topic,
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

module.exports = { startInterview, sendMessage, completeInterview, getInterviews, getInterview };
