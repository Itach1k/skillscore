/**
 * Firebase web app конфігурація.
 * Заміни значення на свої з Firebase Console:
 * Project settings → General → Your apps → Web app → Firebase SDK snippet → Config
 */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';

const firebaseConfig = {
  apiKey: "AIzaSyB9u3vZ7bCH6aV2LCmW0Wz9gbvJNmqNpW0",
  authDomain: "skillscop-88629.firebaseapp.com",
  projectId: "skillscop-88629",
  storageBucket: "skillscop-88629.firebasestorage.app",
  messagingSenderId: "444562834138",
  appId: "1:444562834138:web:e9ef5eb71d59265c9b5be3"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
