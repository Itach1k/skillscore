/**
 * Middleware верифікації Firebase ID-токена.
 * Очікує заголовок: Authorization: Bearer <id_token>
 * Після успіху — кладе req.user = { uid, email, name, ... }
 */

const { auth } = require('../config/firebase');

async function verifyToken(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = header.substring('Bearer '.length).trim();
  try {
    const decoded = await auth.verifyIdToken(token);
    req.user = decoded; // { uid, email, name, picture, ... }
    next();
  } catch (err) {
    console.error('[Auth] Token verification failed:', err.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { verifyToken };
