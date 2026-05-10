/**
 * Логіка сторінки інтерв'ю:
 *  - 3 режими: technical / softskills / vacancy
 *  - чат → завершення → аналіз
 */

import { api } from './api.js';
import { waitForAuth } from './auth.js';

const $ = (id) => document.getElementById(id);
const modeSelection = $('modeSelection');
const chatInterface = $('chatInterface');
const analysisResult = $('analysisResult');
const chatMessages = $('chatMessages');
const messageInput = $('messageInput');
const sendBtn = $('sendBtn');
const endInterviewBtn = $('endInterviewBtn');
const newInterviewBtn = $('newInterviewBtn');
const currentTopicEl = $('currentTopic');
const loader = $('loader');
const startVacancyBtn = $('startVacancyBtn');

let currentInterviewId = null;
let currentMode = 'technical';

const showLoader = (v) => (loader.hidden = !v);

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const CRITERIA_LABELS = {
  theoreticalKnowledge: 'Теоретичні знання',
  problemSolving: 'Вирішення задач',
  technicalCommunication: 'Технічна комунікація',
  codeQuality: 'Якість коду',
  architecturalThinking: 'Архітектурне мислення',
};

(async function init() {
  const user = await waitForAuth();
  if (!user) return;

  // Перемикач режимів
  document.querySelectorAll('.mode-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.mode-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      currentMode = tab.dataset.mode;
      document.querySelectorAll('.mode-panel').forEach((p) => {
        p.hidden = p.dataset.mode !== currentMode;
      });
    });
  });

  // Картки тем (technical + softskills)
  document.querySelectorAll('.topic-card').forEach((card) => {
    card.addEventListener('click', () => startInterview(card.dataset.topic, currentMode));
  });

  // Vacancy
  if (startVacancyBtn) {
    startVacancyBtn.addEventListener('click', () => {
      const title = $('vacancyTitle').value.trim();
      const text = $('vacancyText').value.trim();
      if (text.length < 30) {
        alert('Будь ласка, вставте повний опис вакансії (мінімум 30 символів).');
        return;
      }
      const topic = title || 'Інтерв\'ю під вакансію';
      startInterview(topic, 'vacancy', text);
    });
  }

  sendBtn.addEventListener('click', sendMessage);
  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  endInterviewBtn.addEventListener('click', endInterview);
  newInterviewBtn.addEventListener('click', () => location.reload());
})();

function appendMessage(role, content) {
  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.innerHTML = `<div class="message-bubble">${escapeHtml(content)}</div>`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function startInterview(topic, mode = 'technical', vacancyText = undefined) {
  showLoader(true);
  try {
    const { interviewId, message } = await api.startInterview(topic, mode, vacancyText);
    currentInterviewId = interviewId;
    modeSelection.hidden = true;
    chatInterface.hidden = false;
    currentTopicEl.textContent = topic;
    appendMessage('assistant', message);
    messageInput.focus();
  } catch (err) {
    alert('Помилка: ' + err.message);
  } finally {
    showLoader(false);
  }
}

async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || !currentInterviewId) return;

  appendMessage('user', text);
  messageInput.value = '';
  sendBtn.disabled = true;

  const typingEl = document.createElement('div');
  typingEl.className = 'message assistant typing';
  typingEl.innerHTML = '<div class="message-bubble">Друкує…</div>';
  chatMessages.appendChild(typingEl);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  try {
    const { message } = await api.sendMessage(currentInterviewId, text);
    typingEl.remove();
    appendMessage('assistant', message);
  } catch (err) {
    typingEl.remove();
    alert('Помилка: ' + err.message);
  } finally {
    sendBtn.disabled = false;
    messageInput.focus();
  }
}

async function endInterview() {
  if (!currentInterviewId) return;
  if (!confirm("Завершити інтерв'ю та отримати детальний аналіз?")) return;

  showLoader(true);
  try {
    const { analysis } = await api.completeInterview(currentInterviewId);
    renderAnalysis(analysis);
  } catch (err) {
    alert('Помилка аналізу: ' + err.message);
  } finally {
    showLoader(false);
  }
}

function renderAnalysis(a) {
  chatInterface.hidden = true;
  analysisResult.hidden = false;

  const container = document.getElementById('analysisContent');
  container.innerHTML = `
    <div class="overall-score">
      <div class="score-circle">${a.overallScore.toFixed(1)}</div>
      <div>
        <h3>Загальний бал</h3>
        <p>${escapeHtml(a.feedback)}</p>
      </div>
    </div>

    <div class="scores-grid">
      ${Object.entries(a.scores).map(([key, val]) => `
        <div class="score-item">
          <div class="score-label">${CRITERIA_LABELS[key] || key}</div>
          <div class="score-bar">
            <div class="score-bar-fill" style="width:${val * 10}%"></div>
            <span>${val} / 10</span>
          </div>
        </div>
      `).join('')}
    </div>

    <div class="analysis-section">
      <h4>✅ Сильні сторони</h4>
      <ul>${a.strengths.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>
    </div>

    <div class="analysis-section">
      <h4>⚠️ Зони росту</h4>
      <ul>${a.weaknesses.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>
    </div>

    <div class="analysis-section">
      <h4>💡 Рекомендації</h4>
      <ul>${a.recommendations.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>
    </div>
  `;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
