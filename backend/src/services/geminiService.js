/**
 * Інтеграція з Google Gemini API:
 *   - generateInterviewResponse(...)  — продовжує діалог інтерв'ю (3 режими: technical/softskills/vacancy)
 *   - analyzeInterview(...)           — оцінює відповіді кандидата та повертає JSON
 *   - generateRoadmap(...)            — генерує персоналізовану дорожню карту розвитку
 *
 * Ключ:   GEMINI_API_KEY (.env)
 * Модель: GEMINI_MODEL (.env, за замовчуванням gemini-2.5-flash-lite)
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

const apiKeyRaw = process.env.GEMINI_API_KEY;
if (!apiKeyRaw) {
  console.error('[Gemini] ERROR: GEMINI_API_KEY is not set in .env');
  process.exit(1);
}

// Підтримуємо декілька ключів через кому — при вичерпанні денної квоти на одному,
// автоматично переходимо на наступний.
const API_KEYS = apiKeyRaw.split(',').map((k) => k.trim()).filter(Boolean);
const clients = API_KEYS.map((key) => new GoogleGenerativeAI(key));
let activeKeyIndex = 0;

console.log(`[Gemini] Loaded ${API_KEYS.length} API key(s)`);

function getClient() {
  return clients[activeKeyIndex];
}

function rotateKey() {
  if (clients.length <= 1) return false;
  activeKeyIndex = (activeKeyIndex + 1) % clients.length;
  console.log(`[Gemini] Rotated to key #${activeKeyIndex + 1}/${clients.length}`);
  return true;
}

const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';

/* ───────── Retry-обгортка для 429 ───────── */

/**
 * Обгортка для виклику Gemini API з обробкою rate-limits.
 * Стратегія:
 *  - RPM-burst (короткий retryDelay ≤30s) → почекати і повторити
 *  - Daily quota → переключитися на наступний API-ключ (якщо є), повторити
 *  - Якщо ключі скінчилися → кинути помилку
 *
 * @param {(client) => Promise} fn — функція, що отримує поточний клієнт і виконує запит
 */
async function withRetry(fn) {
  const triedKeys = new Set();

  while (triedKeys.size < clients.length) {
    triedKeys.add(activeKeyIndex);

    try {
      return await fn();
    } catch (err) {
      if (err.status !== 429) throw err;

      const quotaFailure = err.errorDetails?.find((d) =>
        String(d['@type']).includes('QuotaFailure')
      );
      const violations = quotaFailure?.violations || [];
      const isDaily = violations.some((v) => String(v.quotaId || '').includes('PerDay'));

      // Якщо денний ліміт — пробуємо наступний ключ
      if (isDaily) {
        if (clients.length > 1 && triedKeys.size < clients.length) {
          rotateKey();
          continue;
        }
        throw err; // усі ключі вичерпані
      }

      // RPM-burst — чекаємо і повторюємо на тому ж ключі
      const retryInfo = err.errorDetails?.find((d) =>
        String(d['@type']).includes('RetryInfo')
      );
      const m = String(retryInfo?.retryDelay || '').match(/(\d+(?:\.\d+)?)s/);
      const delaySec = m ? parseFloat(m[1]) : null;

      if (delaySec === null || delaySec > 30) throw err;

      console.log(`[Gemini] 429 RPM burst, retrying in ${delaySec}s...`);
      await new Promise((r) => setTimeout(r, (delaySec + 1) * 1000));
      // одноразовий retry на тому ж ключі — виходимо з циклу після нього
      try {
        return await fn();
      } catch (retryErr) {
        if (retryErr.status !== 429) throw retryErr;
        // якщо знову 429 — спробуємо інший ключ нижче
        if (clients.length > 1 && triedKeys.size < clients.length) {
          rotateKey();
          continue;
        }
        throw retryErr;
      }
    }
  }

  // На всякий випадок (теоретично недосяжно)
  throw new Error('All API keys exhausted');
}

/* ───────── Промпти для трьох режимів інтерв'ю ───────── */

const COMMON_RULES = `
Правила ведення інтерв'ю:
1. Задавай 5–7 послідовних питань — від простіших до складніших.
2. Адаптуй складність наступного питання залежно від якості відповіді.
3. Після кожної відповіді коротко підтверджуй («Зрозумів, дякую») і переходь до наступного питання.
4. НЕ давай правильних відповідей і НЕ оцінюй кандидата під час інтерв'ю — лише питання.
5. Веди розмову українською мовою, в дружньо-професійному тоні.
6. Після ~6 питань завершуй фразою:
   «Дякую за інтерв'ю! Натисніть кнопку 'Завершити інтерв'ю' для отримання детального аналізу ваших відповідей.»
7. Кожне повідомлення має бути коротким (2–4 речення максимум) — лише визнання + наступне питання.
`.trim();

/**
 * Будує системний промпт залежно від режиму інтерв'ю.
 * @param {Object} cfg
 * @param {'technical'|'softskills'|'vacancy'} cfg.mode
 * @param {string} cfg.topic — назва теми / опис вакансії / soft-skill сценарій
 * @param {string} [cfg.vacancyText] — повний текст вакансії (для mode='vacancy')
 */
function buildInterviewSystemPrompt({ mode, topic, vacancyText }) {
  if (mode === 'cv' && Array.isArray(topic) && topic.length > 0) {
    // Тут topic — це масив скілів, виділених з CV
    const skillsList = topic.map((s) => `- ${s}`).join('\n');
    return `
Ти — досвідчений технічний інтерв'юер. Тобі надано список технологій і навичок, які кандидат вказав у своєму резюме.
Твоє завдання — провести співбесіду, що буде сфокусована саме на цих навичках.

НАВИЧКИ КАНДИДАТА З РЕЗЮМЕ:
${skillsList}

${COMMON_RULES}

Додатково для CV-режиму:
- Перші 1-2 питання — про основні (найчастіше згадувані) технології з резюме.
- Принаймні одне питання має перевіряти глибину знань — не просто «що це?», а «як працює всередині», «коли застосовувати», «які підводні камені».
- Питай про комбінацію декількох технологій разом (як вони взаємодіють у реальних проєктах).
- Якщо в резюме є рідкісна або вузькоспеціалізована технологія — обов'язково запитай про неї.
`.trim();
  }

  if (mode === 'vacancy' && vacancyText) {
    return `
Ти — досвідчений технічний інтерв'юер. Тобі надано опис конкретної вакансії, на яку претендує кандидат.
Твоє завдання — провести співбесіду саме за тими навичками, технологіями та обов'язками, що вказані в описі вакансії.

ОПИС ВАКАНСІЇ:
"""
${vacancyText}
"""

${COMMON_RULES}

Додатково для цього режиму:
- Перші питання — про найважливіші технології зі стеку вакансії.
- Принаймні одне питання має стосуватися реального обов'язку з опису.
- Якщо опис містить рідкісну технологію — обов'язково запитай саме про неї.
`.trim();
  }

  if (mode === 'softskills') {
    return `
Ти — досвідчений HR-інтерв'юер з технічного домену, що оцінює поведінкові та комунікаційні навички кандидата.
Тема сесії: «${topic}».

${COMMON_RULES}

Додатково для soft-skills режиму:
- Використовуй методику STAR: проси описувати конкретні ситуації (Situation, Task, Action, Result).
- Питання базуй на реальних робочих сценаріях: конфлікти, дедлайни, критика, командна робота.
- НЕ задавай абстрактних питань на кшталт «чи вмієте ви працювати в команді» — лише конкретні кейси.
- Оцінювати кандидата будуть за тими ж 5 критеріями, але інтерпретованими в м'якому ключі:
   technicalCommunication → ясність викладу думок,
   problemSolving → реакція на конфлікти і складні ситуації,
   architecturalThinking → системне бачення процесів,
   theoreticalKnowledge → загальна обізнаність і саморефлексія,
   codeQuality → структурованість і конкретика відповідей.
`.trim();
  }

  // Default: technical mode
  return `
Ти — досвідчений технічний інтерв'юер. Проводиш співбесіду з кандидатом за темою: «${topic}».

${COMMON_RULES}
`.trim();
}

/**
 * Згенерувати наступну репліку інтерв'юера.
 * @param {Object} cfg — { mode, topic, vacancyText }
 * @param {Array<{role:'user'|'assistant',content:string}>} history — попередні повідомлення
 * @param {string} userMessage — нове повідомлення кандидата
 * @returns {Promise<string>}
 */
async function generateInterviewResponse(cfg, history, userMessage) {
  // Gemini-формат історії: role: 'user' | 'model'
  const geminiHistory = history.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  // Перше повідомлення з боку моделі не може стояти в історії — прибираємо «assistant»-початок,
  // якщо user-повідомлень ще не було:
  const firstUserIdx = geminiHistory.findIndex((m) => m.role === 'user');
  const cleanedHistory = firstUserIdx >= 0 ? geminiHistory.slice(firstUserIdx) : [];

  const result = await withRetry(() => {
    const model = getClient().getGenerativeModel({
      model: MODEL_NAME,
      systemInstruction: buildInterviewSystemPrompt(cfg),
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 500,
      },
    });
    const chat = model.startChat({ history: cleanedHistory });
    return chat.sendMessage(userMessage);
  });
  return result.response.text().trim();
}

/* ───────── Промпт для аналізу інтерв'ю ───────── */

const analysisPrompt = (topic, conversation) => `
Ти — старший технічний експерт. Тобі надається повний транскрипт технічного інтерв'ю за темою «${topic}».
Твоє завдання — об'єктивно оцінити кандидата за п'ятьма критеріями (1–10 балів кожен) та повернути результат у форматі JSON.

ТРАНСКРИПТ ІНТЕРВ'Ю:
${conversation.map((m) => `${m.role === 'assistant' ? 'ІНТЕРВ\'ЮЕР' : 'КАНДИДАТ'}: ${m.content}`).join('\n\n')}

КРИТЕРІЇ ОЦІНЮВАННЯ (від 1 до 10):
- theoreticalKnowledge: глибина теоретичних знань за темою
- problemSolving: здатність аналізувати та розв'язувати задачі
- technicalCommunication: чіткість і структурованість пояснень
- codeQuality: знання best practices, патернів, ідіоматики
- architecturalThinking: розуміння системного дизайну та архітектури

ВАЖЛИВО: поверни ТІЛЬКИ JSON-об'єкт у наведеному форматі, БЕЗ markdown-обгортки, БЕЗ пояснень, БЕЗ зайвих символів:

{
  "scores": {
    "theoreticalKnowledge": <число 1-10>,
    "problemSolving": <число 1-10>,
    "technicalCommunication": <число 1-10>,
    "codeQuality": <число 1-10>,
    "architecturalThinking": <число 1-10>
  },
  "overallScore": <середнє з усіх п'яти, округлене до 1 знаку>,
  "feedback": "<2-3 речення українською — загальна оцінка кандидата>",
  "strengths": ["<сильна сторона 1>", "<сильна сторона 2>", "<сильна сторона 3>"],
  "weaknesses": ["<зона росту 1>", "<зона росту 2>"],
  "recommendations": ["<рекомендація 1>", "<рекомендація 2>", "<рекомендація 3>"]
}
`.trim();

/**
 * Проаналізувати завершене інтерв'ю.
 * @param {string} topic
 * @param {Array<{role:string,content:string}>} conversation
 * @returns {Promise<Object>} структурований аналіз
 */
async function analyzeInterview(topic, conversation) {
  const result = await withRetry(() => {
    const model = getClient().getGenerativeModel({
      model: MODEL_NAME,
      generationConfig: {
        temperature: 0.4,
        responseMimeType: 'application/json',
      },
    });
    return model.generateContent(analysisPrompt(topic, conversation));
  });
  const text = result.response.text();

  try {
    return JSON.parse(text);
  } catch (err) {
    // Fallback: спробуємо знайти JSON всередині відповіді
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Gemini returned invalid JSON: ' + text.slice(0, 200));
  }
}

/* ───────── Промпт для генерації Roadmap ───────── */

const CRITERIA_LABELS = {
  theoreticalKnowledge: 'Теоретичні знання',
  problemSolving: 'Вирішення задач',
  technicalCommunication: 'Технічна комунікація',
  codeQuality: 'Якість коду',
  architecturalThinking: 'Архітектурне мислення',
};

const roadmapPrompt = (statsByCriteria, weakest, recentTopics) => `
Ти — досвідчений технічний наставник (mentor). На основі статистики компетенцій кандидата
сформуй персоналізовану дорожню карту розвитку на 4–6 тижнів.

ПОТОЧНІ СЕРЕДНІ БАЛИ КАНДИДАТА (1..10):
${Object.entries(statsByCriteria).map(([k, v]) => `- ${CRITERIA_LABELS[k] || k}: ${v}`).join('\n')}

НАЙСЛАБШІ КРИТЕРІЇ (потребують фокусу):
${weakest.map((w) => `- ${CRITERIA_LABELS[w.key]} (${w.score}/10)`).join('\n')}

ОСТАННІ ТЕМИ ПРОЙДЕНИХ ІНТЕРВ'Ю:
${recentTopics.length ? recentTopics.map((t) => `- ${t}`).join('\n') : '- (немає даних)'}

ВИМОГИ ДО РЕЗУЛЬТАТУ:
- 4–6 тижневих модулів, кожен сфокусований на конкретному критерії або темі.
- Для кожного модуля: назва, тривалість, конкретні теми для вивчення, 2–3 практичні задачі, рекомендовані ресурси (книги/курси/документація).
- Обов'язкове охоплення найслабших критеріїв.
- Українською мовою.

Поверни ТІЛЬКИ JSON-об'єкт у форматі (без markdown-обгортки):

{
  "summary": "<2-3 речення про загальний фокус плану>",
  "totalWeeks": <число тижнів>,
  "modules": [
    {
      "week": <номер тижня>,
      "title": "<назва модуля>",
      "focusCriterion": "<один з 5 ключів критеріїв>",
      "goals": ["<ціль 1>", "<ціль 2>"],
      "topics": ["<тема 1>", "<тема 2>", "<тема 3>"],
      "practicalTasks": ["<задача 1>", "<задача 2>"],
      "resources": [
        {"title": "<назва ресурсу>", "type": "book|course|article|documentation", "note": "<коротка примітка>"}
      ]
    }
  ],
  "expectedOutcome": "<очікуваний результат після проходження плану, 1-2 речення>"
}
`.trim();

/**
 * Згенерувати персоналізовану roadmap на основі статистики користувача.
 * @param {Object} statsByCriteria — { theoreticalKnowledge: { mean, ... }, ... }
 * @param {string[]} recentTopics — останні теми завершених інтерв'ю
 * @returns {Promise<Object>} JSON з планом
 */
async function generateRoadmap(statsByCriteria, recentTopics = []) {
  const flat = Object.fromEntries(
    Object.entries(statsByCriteria).map(([k, v]) => [k, v.mean ?? v])
  );
  const weakest = Object.entries(flat)
    .map(([key, score]) => ({ key, score }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 2);

  const result = await withRetry(() => {
    const model = getClient().getGenerativeModel({
      model: MODEL_NAME,
      generationConfig: { temperature: 0.5, responseMimeType: 'application/json' },
    });
    return model.generateContent(roadmapPrompt(flat, weakest, recentTopics));
  });
  const text = result.response.text();
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Gemini returned invalid roadmap JSON');
  }
}

/* ───────── Витяг навичок з резюме (CV) ───────── */

const cvAnalysisPrompt = (cvText) => `
Ти — досвідчений технічний рекрутер. Тобі надано текст резюме кандидата.
Твоє завдання — витягти структуровану інформацію про його технічні навички та досвід.

ТЕКСТ РЕЗЮМЕ:
"""
${cvText}
"""

ВИМОГИ:
- Виділи всі технічні навички, фреймворки, мови програмування, інструменти, бази даних.
- НЕ включай soft skills, особисті якості, мови спілкування — лише технічні навички.
- Оціни рівень кандидата на основі досвіду та використаних технологій: junior / middle / senior.
- Сформуй 4-6 пропонованих тем для технічного інтерв'ю на основі основних навичок з резюме.

Поверни ТІЛЬКИ JSON-об'єкт у форматі (без markdown-обгортки):

{
  "skills": ["<навичка 1>", "<навичка 2>", ...],
  "experienceLevel": "junior" | "middle" | "senior",
  "yearsOfExperience": <число або null>,
  "suggestedTopics": [
    "<тема 1>",
    "<тема 2>",
    ...
  ],
  "summary": "<коротке резюме кандидата українською, 1-2 речення>"
}
`.trim();

/**
 * Витягує структуровану інформацію про навички з тексту резюме.
 * @param {string} cvText — сирий текст резюме
 * @returns {Promise<Object>}
 */
async function extractSkillsFromCV(cvText) {
  const result = await withRetry(() => {
    const model = getClient().getGenerativeModel({
      model: MODEL_NAME,
      generationConfig: { temperature: 0.3, responseMimeType: 'application/json' },
    });
    return model.generateContent(cvAnalysisPrompt(cvText));
  });
  const text = result.response.text();
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Gemini returned invalid CV analysis JSON');
  }
}

module.exports = { generateInterviewResponse, analyzeInterview, generateRoadmap, extractSkillsFromCV };
