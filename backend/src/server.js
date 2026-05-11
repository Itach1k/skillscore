/**
 * SkillScope — точка входу Express-сервера.
 * Структура:
 *   /api/interview/*    — модуль ШІ-інтерв'ю (interviewRoutes)
 *   /api/statistics     — аналітичний модуль (statisticsRoutes)
 *   статика frontend/    — клієнтська частина (HTML/CSS/JS)
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

require('./config/firebase'); // ініціалізація Firebase Admin

const interviewRoutes = require('./routes/interviewRoutes');
const statisticsRoutes = require('./routes/statisticsRoutes');
const roadmapRoutes = require('./routes/roadmapRoutes');
const benchmarkRoutes = require('./routes/benchmarkRoutes');
const cvRoutes = require('./routes/cvRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_DIR = path.join(__dirname, '..', '..', 'frontend');

app.use(cors());
app.use(express.json({ limit: '5mb' }));

// API
app.use('/api/interview', interviewRoutes);
app.use('/api/statistics', statisticsRoutes);
app.use('/api/roadmap', roadmapRoutes);
app.use('/api/benchmarks', benchmarkRoutes);
app.use('/api/cv', cvRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

// Static frontend
app.use(express.static(FRONTEND_DIR));

// SPA-fallback на index.html для невідомих маршрутів (окрім /api/*)
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

// Глобальний обробник помилок
app.use((err, req, res, next) => {
  console.error('[Unhandled]', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 SkillScope server is running`);
  console.log(`   → http://localhost:${PORT}\n`);
});
