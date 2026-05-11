/**
 * Спільний обробник помилок від Gemini API.
 * Аналізує тип квоти з QuotaFailure.violations:
 *   - PerMinute (RPM)  → короткочасний burst, варто почекати
 *   - PerDay (RPD)     → денний ліміт, чекати безглуздо
 *   - PerModelPerMinute input tokens → ліміт на токени
 */

function parseRetryDelay(retryStr) {
  if (!retryStr) return null;
  const m = String(retryStr).match(/(\d+(?:\.\d+)?)s/);
  return m ? parseFloat(m[1]) : null;
}

function classifyQuotaError(err) {
  const quotaFailure = err.errorDetails?.find((d) =>
    String(d['@type']).includes('QuotaFailure')
  );
  const retryInfo = err.errorDetails?.find((d) =>
    String(d['@type']).includes('RetryInfo')
  );

  const violations = quotaFailure?.violations || [];
  const isDaily = violations.some((v) => String(v.quotaId || '').includes('PerDay'));
  const isPerMinute = violations.some((v) => String(v.quotaId || '').includes('PerMinute'));
  const isTokenLimit = violations.some((v) =>
    String(v.quotaMetric || '').includes('input_token_count')
  );

  // Витягуємо реальне значення ліміту, якщо API його повернув
  const dailyViolation = violations.find((v) => String(v.quotaId || '').includes('PerDay'));
  const dailyLimit = dailyViolation?.quotaValue ? parseInt(dailyViolation.quotaValue) : null;

  return {
    isDaily,
    isPerMinute,
    isTokenLimit,
    dailyLimit,
    retrySec: parseRetryDelay(retryInfo?.retryDelay),
  };
}

function buildQuotaMessage(err) {
  const { isDaily, isTokenLimit, dailyLimit, retrySec } = classifyQuotaError(err);
  const currentModel = (process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite').toLowerCase();
  const onLiteAlready = currentModel.includes('flash-lite');

  if (isDaily) {
    const limitText = dailyLimit !== null ? `${dailyLimit} запитів/добу` : 'денний ліміт';
    return (
      `Вичерпано ${limitText} Gemini API на безкоштовному тарифі для моделі ${currentModel}. ` +
      `Квота скинеться о 10:00 за київським часом (північ за тихоокеанським). ` +
      `Якщо ліміт малий (20-50/добу) — це нові обмеження Google для безкоштовних акаунтів. ` +
      `Рішення: 1) створити новий API-ключ у іншому Google-акаунті, або 2) увімкнути білінг у Google Cloud (перші $300 кредитів — безкоштовно для нових проєктів).`
    );
  }

  if (isTokenLimit) {
    return (
      `Перевищено хвилинний ліміт на кількість вхідних токенів. ` +
      `Зачекайте 60 сек і повторіть. Якщо проблема повторюється — резюме/вакансія занадто довгі.`
    );
  }

  // RPM burst
  const wait = retrySec ? `~${Math.ceil(retrySec)} сек` : '60 сек';
  const advice = onLiteAlready
    ? 'Ви вже на найгенерознішій безкоштовній моделі.'
    : `Альтернатива — змінити GEMINI_MODEL на gemini-2.5-flash-lite.`;

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

  if (err.status === 400) {
    return res.status(502).json({
      error: 'ШІ повернув некоректну відповідь. Спробуйте ще раз.',
    });
  }

  res.status(500).json({ error: err.message || 'Internal Server Error' });
}

module.exports = { handleApiError, buildQuotaMessage, classifyQuotaError };
