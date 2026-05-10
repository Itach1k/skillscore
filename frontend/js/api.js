/**
 * HTTP-клієнт для звернень до бекенду.
 * Автоматично додає Firebase ID-токен у заголовок Authorization.
 */

import { auth } from './firebase-config.js';

async function getToken() {
  const user = auth.currentUser;
  if (!user) throw new Error('Користувач не автентифікований');
  return await user.getIdToken();
}

async function request(method, url, body) {
  const token = await getToken();
  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const errBody = await res.json();
      errMsg = errBody.error || errMsg;
    } catch { /* ignore */ }
    throw new Error(errMsg);
  }
  return res.json();
}

export const api = {
  startInterview: (topic, mode = 'technical', vacancyText) =>
    request('POST', '/api/interview/start', { topic, mode, vacancyText }),
  sendMessage: (interviewId, message) => request('POST', '/api/interview/message', { interviewId, message }),
  completeInterview: (interviewId) => request('POST', '/api/interview/complete', { interviewId }),
  getInterviews: () => request('GET', '/api/interview'),
  getInterview: (id) => request('GET', `/api/interview/${id}`),
  getStatistics: () => request('GET', '/api/statistics'),
  getRoadmap: () => request('GET', '/api/roadmap'),
  generateRoadmap: () => request('POST', '/api/roadmap/generate'),
  getBenchmarks: () => request('GET', '/api/benchmarks'),
};
