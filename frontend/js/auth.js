/**
 * Логіка автентифікації (лише для десктопних браузерів).
 * На мобільних — показуємо повідомлення про несумісність замість логіки входу.
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

function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function isLoginPage() {
  const p = window.location.pathname;
  return p === '/' || p.endsWith('/index.html');
}

// Якщо користувач зайшов з мобільного пристрою — показуємо стоп-екран
if (isMobileDevice()) {
  showMobileBlocker();
}

function showMobileBlocker() {
  // Прибираємо весь основний контент і показуємо повідомлення
  const html = `
    <div style="
      position: fixed; inset: 0;
      display: flex; align-items: center; justify-content: center;
      background: linear-gradient(135deg, #5b6cf0 0%, #8b5cf6 100%);
      color: white; padding: 24px; text-align: center; z-index: 9999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    ">
      <div style="max-width: 420px;">
        <div style="font-size: 56px; margin-bottom: 16px;">💻</div>
        <h1 style="font-size: 24px; margin-bottom: 12px;">Лише для ПК</h1>
        <p style="font-size: 15px; line-height: 1.5; opacity: 0.95; margin-bottom: 8px;">
          SkillScope потребує комп'ютера з повноцінною клавіатурою для проходження
          технічних інтерв'ю.
        </p>
        <p style="font-size: 14px; opacity: 0.8;">
          Відкрийте сайт у браузері на ноутбуці або ПК.
        </p>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', html);
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
