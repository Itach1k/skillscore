/**
 * Сервіс парсингу резюме.
 * Підтримує два формати: PDF (через pdf-parse) і DOCX (через mammoth).
 * Повертає сирий текст для подальшого аналізу через Gemini.
 */

// pdf-parse містить debug-код на верхньому рівні, що ламається в production-залежностях.
// Використовуємо пряме посилання на lib-модуль, щоб обійти цей debug-блок.
const pdfParse = require('pdf-parse/lib/pdf-parse.js');
const mammoth = require('mammoth');

const SUPPORTED_TYPES = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

/**
 * Витягує текст із буфера CV.
 * @param {Buffer} buffer
 * @param {string} mimetype
 * @returns {Promise<string>}
 */
async function extractTextFromCV(buffer, mimetype) {
  const format = SUPPORTED_TYPES[mimetype];
  if (!format) {
    throw new Error(`Непідтримуваний формат файлу. Дозволено: PDF, DOCX.`);
  }

  let text = '';
  if (format === 'pdf') {
    const data = await pdfParse(buffer);
    text = data.text || '';
  } else if (format === 'docx') {
    const result = await mammoth.extractRawText({ buffer });
    text = result.value || '';
  }

  text = text.trim();
  if (text.length < 50) {
    throw new Error('Текст резюме занадто короткий або не вдалося розпізнати.');
  }
  // Обмежуємо розмір контексту для Gemini (8К символів — приблизно ~2K токенів, достатньо для CV)
  if (text.length > 8000) {
    text = text.slice(0, 8000) + '\n... [текст обрізано]';
  }
  return text;
}

module.exports = { extractTextFromCV, SUPPORTED_TYPES };
