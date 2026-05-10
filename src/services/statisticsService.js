/**
 * Модуль статистичного оцінювання.
 * Реалізує описову статистику (середнє, медіана, std dev, квартилі) та індикатори прогресу.
 */

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, x) => s + x, 0) / arr.length;
}

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function stdDev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length);
}

/**
 * Лінійно інтерпольований квартиль (метод 7 з R: type=7).
 * @param {number[]} arr
 * @param {number} q  у [0..1], напр. 0.25 = Q1
 */
function quartile(arr, q) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return s[base + 1] !== undefined
    ? s[base] + rest * (s[base + 1] - s[base])
    : s[base];
}

function round(n, p = 2) {
  return Math.round(n * 10 ** p) / 10 ** p;
}

/**
 * Описова статистика для масиву чисел.
 */
function descriptiveStats(values) {
  if (!values.length) {
    return { count: 0, mean: 0, median: 0, stdDev: 0, min: 0, max: 0, q1: 0, q2: 0, q3: 0 };
  }
  return {
    count: values.length,
    mean: round(mean(values)),
    median: round(median(values)),
    stdDev: round(stdDev(values)),
    min: round(Math.min(...values)),
    max: round(Math.max(...values)),
    q1: round(quartile(values, 0.25)),
    q2: round(quartile(values, 0.5)),
    q3: round(quartile(values, 0.75)),
  };
}

/**
 * Обчислює зведену статистику користувача за всіма його завершеними інтерв'ю.
 */
function calculateUserStatistics(interviews) {
  const completed = interviews.filter(
    (i) => i.status === 'completed' && i.analysis && i.analysis.scores
  );

  const overall = completed.map((i) => i.analysis.overallScore);
  const criteria = ['theoreticalKnowledge', 'problemSolving', 'technicalCommunication', 'codeQuality', 'architecturalThinking'];

  const byCriteria = {};
  for (const c of criteria) {
    byCriteria[c] = descriptiveStats(completed.map((i) => i.analysis.scores[c]));
  }

  // Динаміка прогресу — у хронологічному порядку
  const progressTrend = completed
    .slice()
    .sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt))
    .map((i, idx) => ({
      index: idx + 1,
      date: i.completedAt,
      topic: i.topic,
      score: i.analysis.overallScore,
    }));

  // Індикатор прогресу: різниця між середнім перших 30% і останніх 30% сесій
  let progressIndicator = 0;
  if (progressTrend.length >= 4) {
    const k = Math.max(1, Math.floor(progressTrend.length * 0.3));
    const firstAvg = mean(progressTrend.slice(0, k).map((p) => p.score));
    const lastAvg = mean(progressTrend.slice(-k).map((p) => p.score));
    progressIndicator = round(lastAvg - firstAvg);
  }

  return {
    totalInterviews: completed.length,
    overall: descriptiveStats(overall),
    byCriteria,
    progressTrend,
    progressIndicator,
  };
}

module.exports = { descriptiveStats, calculateUserStatistics };
