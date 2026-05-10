# SkillScope

**Інформаційно-аналітична веб-система статистичного оцінювання та розвитку технічних навичок із застосуванням технологій штучного інтелекту**

Дипломний проєкт. Користувач реєструється через Google, проходить технічне інтерв'ю з ШІ-інтерв'юером (Google Gemini), отримує оцінку за 5 критеріями (1–10 балів), а потім переглядає статистику свого розвитку у профілі (середнє, медіана, квартилі, динаміка прогресу).

---

## 🧩 Технологічний стек

| Шар | Технології |
|-----|------------|
| **Frontend** | HTML5, CSS3, Vanilla JavaScript (ES6+ модулі), Chart.js |
| **Backend** | Node.js, Express, модульна service-oriented архітектура |
| **Автентифікація** | Firebase Authentication (Google OAuth) |
| **База даних** | Cloud Firestore (NoSQL) |
| **ШІ-модуль** | Google Gemini API (`@google/generative-ai`) + промпт-інжиніринг |
| **Аналітика** | Власний модуль описової статистики (mean, median, std dev, квартилі Q1/Q3) |

---

## 📁 Структура проєкту

```
skillscope/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── firebase.js                # Firebase Admin SDK (3 способи credentials)
│   │   ├── controllers/
│   │   │   ├── interviewController.js     # 3 режими: technical/softskills/vacancy
│   │   │   ├── statisticsController.js    # Агрегована статистика
│   │   │   ├── roadmapController.js       # Дорожня карта розвитку
│   │   │   └── benchmarkController.js     # Еталонні профілі Junior/Middle/Senior
│   │   ├── middleware/
│   │   │   └── auth.js                    # Верифікація Firebase ID-токена
│   │   ├── routes/
│   │   │   ├── interviewRoutes.js
│   │   │   ├── statisticsRoutes.js
│   │   │   ├── roadmapRoutes.js
│   │   │   └── benchmarkRoutes.js
│   │   ├── services/
│   │   │   ├── geminiService.js           # Інтеграція з Gemini API (3 промпти + roadmap)
│   │   │   ├── statisticsService.js       # Описова статистика, квартилі
│   │   │   └── benchmarkService.js        # Референсні профілі ринку
│   │   └── server.js                      # Entry point Express
│   ├── .env.example
│   ├── .gitignore
│   ├── package.json
│   └── serviceAccountKey.json             # ⚠️ помістити сюди вручну (gitignored)
│
├── frontend/
│   ├── css/
│   │   └── styles.css
│   ├── js/
│   │   ├── firebase-config.js             # Web-конфіг Firebase
│   │   ├── auth.js                        # Логіка входу/виходу
│   │   ├── api.js                         # HTTP-клієнт
│   │   ├── interview.js                   # Сторінка інтерв'ю (3 режими)
│   │   └── profile.js                     # Дашборд + roadmap + PDF
│   ├── index.html                         # Сторінка входу
│   ├── interview.html                     # Чат із ШІ + аналіз
│   └── profile.html                       # Профіль, статистика, roadmap, PDF-експорт
│
├── render.yaml                            # Конфігурація деплою на Render
├── README.md
└── .gitignore
```

---

## ✅ Що потрібно перед запуском

1. **Node.js 18+** та npm — [https://nodejs.org/](https://nodejs.org/)
2. **Google аккаунт** (для Firebase + Gemini API)
3. ~10 хвилин часу на налаштування

---

## 🚀 Покрокова інструкція запуску

### Крок 1. Створити Firebase-проєкт

1. Відкрити [Firebase Console](https://console.firebase.google.com/) → **Add project**.
2. Назвати проєкт (напр. `skillscope`), завершити майстер.
3. У лівому меню: **Build → Authentication → Get started → Sign-in method**.
   Увімкнути **Google** як провайдер, обрати support email, **Save**.
4. **Build → Firestore Database → Create database** → обрати регіон (наприклад `eur3`) → **Start in production mode**.
5. У вкладці **Rules** замінити правила на:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read, write: if false;
       }
     }
   }
   ```
   *(Уся робота з БД йде через Backend, який використовує Admin SDK і обходить ці правила. Користувач напряму до Firestore не звертається — це безпечно.)*

### Крок 2. Отримати облікові дані Firebase

**Web SDK config** (для фронтенду):
1. **Project settings** (⚙️ біля Project Overview) → **General** → прокрутити до **Your apps**.
2. Натиснути іконку **`</>`** (Web) → зареєструвати застосунок (назва будь-яка).
3. Скопіювати об'єкт `firebaseConfig` (apiKey, authDomain, projectId, …).
4. Відкрити `frontend/js/firebase-config.js` → замінити поля `firebaseConfig` на свої.

**Service Account** (для бекенду):
1. **Project settings** → **Service accounts** → **Generate new private key** → завантажити `.json`.
2. Перейменувати файл на `serviceAccountKey.json` та помістити у `backend/` (поруч із `package.json`).

### Крок 3. Отримати Gemini API ключ

1. Відкрити [Google AI Studio](https://aistudio.google.com/app/apikey).
2. **Create API key** → скопіювати.

### Крок 4. Налаштувати backend

```bash
cd backend
npm install
cp .env.example .env        # на Windows: copy .env.example .env
```

Відкрити `.env` і вписати:
```
PORT=3000
GEMINI_API_KEY=ваш_ключ_сюди
GEMINI_MODEL=gemini-2.5-flash-lite
```

> **Які моделі доступні безкоштовно (станом на травень 2026):**
> - `gemini-2.5-flash-lite` — 15 запитів/хв, 1000 запитів/добу (рекомендовано для дипломної демонстрації)
> - `gemini-2.5-flash` — 10 запитів/хв, 250 запитів/добу (вища якість)
> - `gemini-2.5-pro` — 5 запитів/хв, 50 запитів/добу (для тестових скріншотів)
>
> ⚠️ Моделі `gemini-2.0-flash` і `gemini-1.5-flash` **виведено з безкоштовного тиру у 2026 році** — використовувати їх не вийде.

Перевірте, що файл `serviceAccountKey.json` лежить у `backend/`.

### Крок 5. Запуск

```bash
# у папці backend/
npm run dev      # автоперезапуск під час розробки
# або
npm start        # звичайний запуск
```

Має з'явитися:
```
[Firebase] Initialized via serviceAccountKey.json
🚀 SkillScope server is running
   → http://localhost:3000
```

Відкрити в браузері: **[http://localhost:3000](http://localhost:3000)**

### Крок 6. Додати домен у Authorized domains (одноразово)

Якщо при вході через Google буде помилка — у Firebase Console:
**Authentication → Settings → Authorized domains → Add domain → `localhost`** (зазвичай уже є).

---

## 🧪 Перевірка роботи

1. Відкрити `http://localhost:3000` → натиснути **Увійти через Google**.
2. Обрати тему (наприклад «JavaScript»).
3. ШІ задасть перше питання → відповідаєте → ще 5–6 питань.
4. Натиснути **«Завершити інтерв'ю»** → з'явиться аналіз із 5 балами та рекомендаціями.
5. Перейти у **«Мій профіль»** → побачите радар-діаграму, лінійний графік прогресу та таблицю описової статистики.

---

## 🔌 API Endpoints

Усі ендпоінти потребують заголовок `Authorization: Bearer <Firebase ID Token>`.

| Метод | URL | Призначення |
|-------|-----|-------------|
| `POST` | `/api/interview/start` | Створити сесію (`{ topic, mode, vacancyText?, cvSkills? }`). `mode`: `technical` \| `softskills` \| `vacancy` \| `cv` |
| `POST` | `/api/interview/message` | Надіслати повідомлення (`{ interviewId, message }`) |
| `POST` | `/api/interview/complete` | Завершити та проаналізувати (`{ interviewId }`) |
| `GET` | `/api/interview` | Список інтерв'ю користувача |
| `GET` | `/api/interview/:id` | Повний транскрипт |
| `DELETE` | `/api/interview/:id` | Видалити одне інтерв'ю |
| `DELETE` | `/api/interview/all` | Видалити всю історію + кеш roadmap |
| `POST` | `/api/cv/analyze` | Завантажити PDF/DOCX резюме (multipart `cv`), отримати скіли |
| `GET` | `/api/statistics` | Зведена статистика (mean, median, Q1/Q3, тренд) |
| `GET` | `/api/benchmarks` | Еталонні профілі Junior/Middle/Senior |
| `GET` | `/api/roadmap` | Кешована дорожня карта (або `null`) |
| `POST` | `/api/roadmap/generate` | Згенерувати нову roadmap через ШІ |
| `GET` | `/api/health` | Перевірка живості сервера |

---

## 📊 Схема даних у Firestore

```
users/{userId}                          ← документ користувача
  ├ email, displayName, photoURL, createdAt
  ├ interviews/{interviewId}            ← підколекція сесій
  │   ├ topic              : string
  │   ├ mode               : 'technical' | 'softskills' | 'vacancy'
  │   ├ vacancyText        : string     (лише для mode='vacancy')
  │   ├ status             : 'in-progress' | 'completed'
  │   ├ createdAt          : Timestamp
  │   ├ completedAt        : Timestamp
  │   ├ messages           : Array<{ role, content, timestamp }>
  │   └ analysis           : {
  │         scores         : { theoreticalKnowledge, problemSolving,
  │                            technicalCommunication, codeQuality,
  │                            architecturalThinking },
  │         overallScore   : number,
  │         feedback       : string,
  │         strengths      : string[],
  │         weaknesses     : string[],
  │         recommendations: string[]
  │     }
  └ profile/roadmap                     ← кешована roadmap
      ├ content            : { summary, totalWeeks, modules: [...], expectedOutcome }
      ├ generatedAt        : Timestamp
      └ basedOnInterviews  : number
```

---

## ✨ Розширений функціонал

### 🛠 Чотири режими інтерв'ю

1. **Технічне** — попередньо визначені теми (JavaScript, Node.js, System Design і т.д.)
2. **Soft Skills** — поведінкові сценарії за методикою STAR (робота з критикою, дедлайни, конфлікти)
3. **Під вакансію** — вставляєш текст вакансії з DOU/LinkedIn/Djinni, ШІ задає питання саме за вимогами цієї позиції
4. **За резюме** — завантажуєш PDF або DOCX свого CV, Gemini витягує список технологій (та оцінює рівень), ти обираєш, за якими саме навичками проводити інтерв'ю

### 🗑 Управління історією

У профілі можна видалити окреме інтерв'ю (іконка 🗑 поруч із результатом) або всю історію одночасно (кнопка «Очистити історію»). При видаленні всієї історії також скидається закешована roadmap.

### 📊 Порівняння з еталонними профілями

На радар-діаграмі профілю можна накладати референсні рівні **Junior** (середнє 4.2), **Middle** (6.8) або **Senior** (8.8) — пунктирною лінією іншого кольору. Селектор у заголовку графіка перемикає рівень.

### 🗺 Персоналізована дорожня карта

Кнопка **«Згенерувати план»** у профілі. ШІ аналізує найслабші критерії та видає 4–6 тижневих модулів, кожен містить: цілі, теми для вивчення, практичні задачі і рекомендовані ресурси (книги, курси, документація). План кешується у Firestore, повторна генерація — за вашою кнопкою.

### 📄 PDF-звіт про компетенції

Кнопка **«Завантажити PDF-звіт»** на сторінці профілю — захоплює весь дашборд (картки, графіки, таблицю, roadmap) і зберігає у `SkillScope_Report_YYYY-MM-DD.pdf` через `html2pdf.js`. Працює повністю на клієнті.

---

## ☁️ Деплой на Render (безкоштовно)

Render — найпростіший варіант для Node.js-додатку з вашою архітектурою (Express обслуговує і API, і статику з одного процесу).

### Підготовка

1. Залийте проєкт у **GitHub** (приватний репозиторій теж підходить).
2. У `.gitignore` мають бути `node_modules/`, `.env`, `serviceAccountKey.json`.

### Кроки на Render

1. Зареєструйтеся на [render.com](https://render.com) (можна через GitHub).
2. **New → Web Service** → підключіть GitHub-репозиторій.
3. Render автоматично побачить `render.yaml` і запропонує конфігурацію. Підтверджуйте.
   - Якщо ні: вкажіть вручну: `Root Directory: backend`, `Build: npm install`, `Start: npm start`, `Plan: Free`.
4. У розділі **Environment** заповніть змінні:
   - `GEMINI_API_KEY` = ваш ключ з AI Studio
   - `GEMINI_MODEL` = `gemini-2.5-flash-lite`
   - `FIREBASE_SERVICE_ACCOUNT_JSON` = **вміст** файлу `serviceAccountKey.json` одним рядком (відкрийте файл → скопіюйте все)
5. **Create Web Service**. Перший білд — ~3 хвилини.
6. Отримаєте URL виду `https://skillscope-xxxx.onrender.com`.

### Останній штрих — додати домен у Firebase

7. Firebase Console → **Authentication → Settings → Authorized domains** → додайте `skillscope-xxxx.onrender.com` (без `https://`). Інакше Google-вхід не працюватиме на проді.

Тепер сайт можна давати будь-кому за посиланням.

> **Обмеження free-tier Render:** сервіс «засинає» після 15 хв простою, перший запит після сну довантажується ~30 сек. Для дипломної демонстрації цього достатньо.

---

## ❗ Часті проблеми

| Симптом | Причина / Рішення |
|---------|-------------------|
| `[Firebase] ERROR: Service account credentials not found` | Не знайдено `serviceAccountKey.json` — покладіть його в `backend/` |
| `[Gemini] ERROR: GEMINI_API_KEY is not set` | У `.env` нема ключа — створіть `.env` з `.env.example` |
| `auth/unauthorized-domain` при вході | Додайте `localhost` у Firebase → Authentication → Settings → Authorized domains |
| `auth/popup-blocked` | Дозвольте popup'и для сайту в браузері |
| `404 / 401` при API-викликах | Перевірте, що бекенд запущено на тому ж порту, що в URL фронтенду |
| `Gemini returned invalid JSON` | Тимчасова проблема відповіді моделі. Просто завершіть інтерв'ю ще раз |
| `429 Too Many Requests` / `Quota exceeded` | Перевищено ліміт безкоштовного тиру Gemini. Зачекайте до півночі за тихоокеанським часом, або використайте `gemini-2.5-flash-lite` (1000 запитів/добу) |

---

## 📝 Ліцензія

Освітній проєкт. Використовується для дипломної роботи.
