/**
 * Спільний обробник помилок від Gemini API.
 * Формує адекватні повідомлення для користувача залежно від ситуації:
 *   - 429 + малий retryDelay  → RPM burst, варто почекати
 *   - 429 + великий retryDelay → денний ліміт (RPD)
 *   - враховує поточну модель і не пропонує перейти на ту саму
 */

function parseRetryDelay(retryStr) {
  if (!retryStr) return null;
  const m = String(retryStr).match(/(\d+(?:\.\d+)?)s/);
  return m ? parseFloat(m[1]) : null;
}

function buildQuotaMessage(err) {
  const retryInfo = err.errorDetails?.find((d) =>
    String(d['@type']).includes('RetryInfo')
  );
  const delaySec = parseRetryDelay(retryInfo?.retryDelay);
  const delayStr = retryInfo?.retryDelay || '60s';

  const currentModel = (process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite').toLowerCase();
  const onLiteAlready = currentModel.includes('flash-lite');

  // delay > 90s ≈ це денний ліміт (RPD reset до півночі за PT)
  const isLikelyDaily = delaySec !== null && delaySec > 90;

  if (isLikelyDaily) {
    return `Вичерпано денний ліміт Gemini API на безкоштовному тарифі ` +
      `(${onLiteAlready ? '1000 запитів/добу' : '250–1000 запитів/добу'}). ` +
      `Ліміт скинеться о 10:00 за київським часом (північ за тихоокеанським). ` +
      `Альтернатива — увімкнути білінг у Google Cloud для збільшення квоти.`;
  }

  // RPM burst — короткочасне перевищення
  const wait = delaySec ? `~${Math.ceil(delaySec)} сек` : delayStr;
  const advice = onLiteAlready
    ? 'Ви вже на найгенерознішій безкоштовній моделі. Просто почекайте і повторіть дію.'
    : `Можна перейти на «gemini-2.5-flash-lite» у backend/.env (15 RPM / 1000 запитів/добу).`;

  return `Забагато запитів за хвилину до Gemini API. Зачекайте ${wait} і повторіть. ${advice}`;
}

/**
 * Універсальний обробник помилок API-контролерів.
 * Викликати з catch-блоку: handleApiError(res, err, '[startInterview]')
 */
function handleApiError(res, err, prefix = '') {
  console.error(prefix, err);

  if (err.status === 429) {
    return res.status(429).json({ error: buildQuotaMessage(err) });
  }

  // 400 з ШІ — найчастіше неприпустимий промпт чи parsing JSON
  if (err.status === 400) {
    return res.status(502).json({
      error: 'ШІ повернув некоректну відповідь. Спробуйте ще раз або змініть запит.',
    });
  }

  res.status(500).json({ error: err.message || 'Internal Server Error' });
}

module.exports = { handleApiError, buildQuotaMessage };
