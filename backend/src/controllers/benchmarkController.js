/**
 * Контролер еталонних профілів:
 *   GET /api/benchmarks — повертає референсні профілі Junior/Middle/Senior для накладання на радар
 */

const { getBenchmarks } = require('../services/benchmarkService');

function getBenchmarksHandler(req, res) {
  res.json({ benchmarks: getBenchmarks() });
}

module.exports = { getBenchmarksHandler };
