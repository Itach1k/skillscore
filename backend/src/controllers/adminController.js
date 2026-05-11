/**
 * Admin-контролер. Дозволяє переглядати останні помилки сервера.
 * Доступ обмежений списком email у ADMIN_EMAILS (.env).
 */

const { getLogs, clearLogs } = require('../utils/errorLog');

function isAdmin(email) {
  const raw = process.env.ADMIN_EMAILS || '';
  const list = raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return list.length > 0 && list.includes(String(email || '').toLowerCase());
}

function getErrorLogs(req, res) {
  if (!isAdmin(req.user?.email)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const limit = parseInt(req.query.limit) || 100;
  res.json({ logs: getLogs(limit) });
}

function postClearLogs(req, res) {
  if (!isAdmin(req.user?.email)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  clearLogs();
  res.json({ success: true });
}

module.exports = { getErrorLogs, postClearLogs };
