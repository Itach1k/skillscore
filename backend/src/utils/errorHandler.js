/**
 * Спільний обробник помилок API-контролерів.
 * Розділяє повідомлення на короткі (для UI alert) і детальні (для admin-логів).
 */

const { pushLog } = require('./errorLog');

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

  const dailyViolation = violations.find((v) => String(v.quotaId || '').includes('PerDay'));
  const dailyLimit = dailyViolation?.quotaValue ? parseInt(dailyViolation.quotaValue) : null;

  return {
    isDaily, isPerMinute, isTokenLimit, dailyLimit,
    retrySec: parseRetryDelay(retryInfo?.retryDelay),
  };
}

/**
 * Будує дві версії повідомлення:
 *   - short:  для звичайного користувача (короткий, без технічних деталей)
 *   - detail: для адмін-логу (точна причина, retry, ліміт)
 */
function buildMessages(err) {
  if (err.status === 429) {
    const { isDaily, isTokenLimit, dailyLimit, retrySec } = classifyQuotaError(err);
    const currentModel = (process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite').toLowerCase();

    if (isDaily) {
      return {
        short: 'Денний ліміт ШІ-сервісу вичерпано. Спробуйте завтра.',
        detail: `RPD limit exhausted. Model=${currentModel}, limit=${dailyLimit || '?'}/day. ` +
          `Reset at midnight PT (~10:00 Kyiv). Suggestion: rotate keys / enable billing.`,
      };
    }
    if (isTokenLimit) {
      return {
        short: 'Сервіс зараз перевантажений, зачекайте хвилину.',
        detail: `Input token limit exceeded. retryDelay=${retrySec}s. ` +
          `Possible cause: too long CV/vacancy text.`,
      };
    }
    // RPM burst
    return {
      short: 'Зараз велике навантаження, зачекайте кілька секунд.',
      detail: `RPM burst. retryDelay=${retrySec}s. Model=${currentModel}.`,
    };
  }

  if (err.status === 400) {
    return {
      short: 'Не вдалося обробити запит, спробуйте ще раз.',
      detail: `Gemini 400: ${err.message}`,
    };
  }

  // Будь-які інші помилки
  return {
    short: 'Сталася помилка. Спробуйте ще раз.',
    detail: err.message || String(err),
  };
}

/**
 * Універсальний обробник помилок API-контролерів.
 * Користувачу віддається коротке повідомлення, в логи — деталі (зі стеком).
 */
function handleApiError(res, err, prefix = '') {
  // Повна інформація — у консоль (Render Logs побачить)
  console.error(prefix, err);

  const { short, detail } = buildMessages(err);

  // Збереження в адмін-лог
  pushLog({
    prefix: prefix.replace(/[\[\]]/g, ''),
    status: err.status || 500,
    short,
    detail,
    stack: err.stack ? err.stack.split('\n').slice(0, 5).join('\n') : null,
  });

  res.status(err.status === 429 ? 429 : (err.status === 400 ? 502 : 500))
    .json({ error: short });
}

module.exports = { handleApiError, classifyQuotaError };
