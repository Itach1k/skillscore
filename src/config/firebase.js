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
      const credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      admin.initializeApp({ credential: admin.credential.cert(credentials) });
      console.log('[Firebase] Initialized via FIREBASE_SERVICE_ACCOUNT_JSON env var');
    } catch (err) {
      console.error('[Firebase] FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON:', err.message);
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
