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
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  signOut,
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';

const googleSignInBtn = document.getElementById('googleSignIn');
const signOutBtn = document.getElementById('signOutBtn');
const userAvatar = document.getElementById('userAvatar');
const userName = document.getElementById('userName');

function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    || window.innerWidth < 768;
}

function isLoginPage() {
  const p = window.location.pathname;
  return p === '/' || p.endsWith('/index.html');
}

// Обробка повернення з redirect-flow (потрібно лише на login-page)
if (isLoginPage()) {
  getRedirectResult(auth).catch((err) => {
    if (err.code !== 'auth/no-auth-event' && err.code !== 'auth/null-user') {
      console.error('[Auth] Redirect result error:', err);
    }
  });
}

if (googleSignInBtn) {
  googleSignInBtn.addEventListener('click', async () => {
    const provider = new GoogleAuthProvider();
    try {
      if (isMobile()) {
        // На мобільних попап часто блокується / не повертає фокус
        await signInWithRedirect(auth, provider);
      } else {
        await signInWithPopup(auth, provider);
        window.location.href = 'interview.html';
      }
    } catch (err) {
      console.error('[Auth] Sign-in error:', err);
      if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user') {
        // Fallback на redirect
        try { await signInWithRedirect(auth, provider); } catch (e) { alert('Не вдалося увійти. Спробуйте ще раз.'); }
      } else {
        alert('Помилка входу: ' + err.message);
      }
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
