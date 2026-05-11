/**
 * In-memory ring buffer для логування помилок (доступний через GET /api/admin/logs).
 * Не персистентний — після перезапуску сервера логи зникають.
 * Для production варто замінити на повноцінну систему логування (Winston + Sentry).
 */

const MAX_LOGS = 200;
const logs = [];

function pushLog(entry) {
  logs.push({
    timestamp: new Date().toISOString(),
    ...entry,
  });
  if (logs.length > MAX_LOGS) logs.shift();
}

function getLogs(limit = 100) {
  return logs.slice(-limit).reverse(); // найсвіжіші зверху
}

function clearLogs() {
  logs.length = 0;
}

module.exports = { pushLog, getLogs, clearLogs };
