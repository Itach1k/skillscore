/**
 * Ініціалізація Firebase Admin SDK.
 * Service account можна задати трьома способами (у порядку пріоритету):
 *   1) Змінна FIREBASE_SERVICE_ACCOUNT_JSON — повний JSON одним рядком (для Render/Vercel)
 *   2) Файл serviceAccountKey.json у корені /backend (для локальної розробки)
 *   3) Змінна GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

const keyPath = path.join(__dirname, '../../serviceAccountKey.json');

if (!admin.apps.length) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON.trim();
      // Підтримуємо як сирий JSON, так і base64-encoded JSON
      const jsonText = raw.startsWith('{')
        ? raw
        : Buffer.from(raw, 'base64').toString('utf8');

      const credentials = JSON.parse(jsonText);

      // КРИТИЧНО: при передачі через env-vars символи \n у private_key
      // можуть прийти як літеральні 2 символи замість справжніх переносів.
      // Без цього виправлення PEM-ключ невалідний → UNAUTHENTICATED при запитах до Firestore.
      if (credentials.private_key && credentials.private_key.includes('\\n')) {
        credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
      }

      admin.initializeApp({ credential: admin.credential.cert(credentials) });
      console.log('[Firebase] Initialized via FIREBASE_SERVICE_ACCOUNT_JSON env var');
      console.log('[Firebase] Project ID:', credentials.project_id);
    } catch (err) {
      console.error('[Firebase] Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:', err.message);
      process.exit(1);
    }
  } else if (fs.existsSync(keyPath)) {
    admin.initializeApp({
      credential: admin.credential.cert(require(keyPath)),
    });
    console.log('[Firebase] Initialized via serviceAccountKey.json');
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp();
    console.log('[Firebase] Initialized via GOOGLE_APPLICATION_CREDENTIALS');
  } else {
    console.error(
      '[Firebase] ERROR: Service account credentials not found.\n' +
      'Set FIREBASE_SERVICE_ACCOUNT_JSON env var, place serviceAccountKey.json in /backend, ' +
      'or set GOOGLE_APPLICATION_CREDENTIALS.'
    );
    process.exit(1);
  }
}

const db = admin.firestore();
const auth = admin.auth();

module.exports = { admin, db, auth };
