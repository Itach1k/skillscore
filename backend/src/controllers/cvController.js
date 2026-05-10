/**
 * Контролер аналізу резюме:
 *   POST /api/cv/analyze (multipart/form-data, поле "cv")
 *
 * Приймає PDF або DOCX, витягує текст, відправляє в Gemini для виділення скілів.
 * Не зберігає файл на диску — все в памяті, після обробки буфер відкидається.
 */

const { extractTextFromCV } = require('../services/cvService');
const { extractSkillsFromCV } = require('../services/geminiService');
const { handleApiError: handleError } = require('../utils/errorHandler');

async function analyzeCv(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Файл резюме не надіслано.' });
    }

    // 1. Витягуємо текст з PDF/DOCX
    const cvText = await extractTextFromCV(req.file.buffer, req.file.mimetype);

    // 2. Передаємо текст у Gemini для аналізу
    const analysis = await extractSkillsFromCV(cvText);

    if (!analysis.skills || !Array.isArray(analysis.skills) || analysis.skills.length === 0) {
      return res.status(422).json({ error: 'Не вдалося виділити навички з резюме. Спробуйте інший файл.' });
    }

    res.json({
      skills: analysis.skills,
      experienceLevel: analysis.experienceLevel || null,
      yearsOfExperience: analysis.yearsOfExperience || null,
      suggestedTopics: analysis.suggestedTopics || [],
      summary: analysis.summary || '',
    });
  } catch (err) {
    handleError(res, err, '[analyzeCv]');
  }
}

module.exports = { analyzeCv };
