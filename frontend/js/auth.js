/**
 * Логіка автентифікації:
 *   - вхід через Google (signInWithPopup)
 *   - редіректи між сторінками залежно від стану
 *   - заповнення меню (аватар, ім'я)
 *   - вихід
 */

import { auth } from './firebase-config.js';
import {
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';

const googleSignInBtn = document.getElementById('googleSignIn');
const signOutBtn = document.getElementById('signOutBtn');
const userAvatar = document.getElementById('userAvatar');
const userName = document.getElementById('userName');

function isLoginPage() {
  const p = window.location.pathname;
  return p === '/' || p.endsWith('/index.html');
}

if (googleSignInBtn) {
  googleSignInBtn.addEventListener('click', async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      window.location.href = 'interview.html';
    } catch (err) {
      console.error('[Auth] Sign-in error:', err);
      alert('Помилка входу: ' + err.message);
    }
  });
}

if (signOutBtn) {
  signOutBtn.addEventListener('click', async () => {
    await signOut(auth);
    window.location.href = 'index.html';
  });
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    if (isLoginPage()) {
      window.location.href = 'interview.html';
      return;
    }
    if (userAvatar) userAvatar.src = user.photoURL || '';
    if (userName) userName.textContent = user.displayName || user.email;
  } else {
    if (!isLoginPage()) {
      window.location.href = 'index.html';
    }
  }
});

/** Чекаємо на готовність автентифікації (потрібно перед API-викликами). */
export function waitForAuth() {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      resolve(user);
    });
  });
}
