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
  browserPopupRedirectResolver,
  onAuthStateChanged,
  signOut,
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';

const googleSignInBtn = document.getElementById('googleSignIn');
const signOutBtn = document.getElementById('signOutBtn');
const userAvatar = document.getElementById('userAvatar');
const userName = document.getElementById('userName');

function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function isLoginPage() {
  const p = window.location.pathname;
  return p === '/' || p.endsWith('/index.html');
}

// Обробляємо результат redirect-flow при поверненні на login-page
if (isLoginPage()) {
  getRedirectResult(auth)
    .then((result) => {
      if (result?.user) {
        // Успіх — onAuthStateChanged нижче зробить редірект на interview.html
        console.log('[Auth] Redirect sign-in успішний:', result.user.email);
      }
    })
    .catch((err) => {
      console.error('[Auth] Redirect result error:', err.code, err.message);
      // Тихо ігноруємо "no-auth-event" — це нормально при першому заході
      if (err.code && err.code !== 'auth/no-auth-event') {
        sessionStorage.setItem('lastAuthError', `${err.code}: ${err.message}`);
      }
    });
}

if (googleSignInBtn) {
  googleSignInBtn.addEventListener('click', async () => {
    const provider = new GoogleAuthProvider();
    // Просимо вибрати акаунт явно щоразу (запобігає silent-redirect конфліктам)
    provider.setCustomParameters({ prompt: 'select_account' });

    const useMobileFlow = isMobileDevice();

    try {
      if (useMobileFlow) {
        // На мобільних — redirect-flow.
        // Браузер сам перенесе на accounts.google.com, потім назад на твій сайт.
        await signInWithRedirect(auth, provider);
        // Після цього виконання коду тут не продовжиться — браузер пішов на Google.
      } else {
        // Desktop — popup
        await signInWithPopup(auth, provider, browserPopupRedirectResolver);
        // onAuthStateChanged зробить редірект
      }
    } catch (err) {
      console.error('[Auth] Sign-in error:', err.code, err.message);

      // Якщо popup заблоковано на десктопі — fallback на redirect
      if (err.code === 'auth/popup-blocked' || err.code === 'auth/popup-closed-by-user') {
        try {
          await signInWithRedirect(auth, provider);
          return;
        } catch (e) {
          alert('Не вдалося відкрити вікно входу. Перевірте дозволи браузера.');
          return;
        }
      }

      const msg = err.code === 'auth/unauthorized-domain'
        ? 'Цей домен не дозволений у Firebase. Додайте його в Authentication → Settings → Authorized domains.'
        : `Помилка входу: ${err.message}`;
      alert(msg);
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
