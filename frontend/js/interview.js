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
let cvAnalysis = null;          // результат /api/cv/analyze
let cvSelectedSkills = new Set();

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

  // CV
  setupCvHandlers();

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

async function startInterview(topic, mode = 'technical', vacancyText = undefined, cvSkills = undefined) {
  showLoader(true);
  try {
    const { interviewId, message } = await api.startInterview(topic, mode, vacancyText, cvSkills);
    currentInterviewId = interviewId;
    modeSelection.hidden = true;
    chatInterface.hidden = false;
    currentTopicEl.textContent = topic || 'Інтерв\'ю за резюме';
    appendMessage('assistant', message);
    messageInput.focus();
    enableUnloadGuard();
  } catch (err) {
    alert(err.message);
  } finally {
    showLoader(false);
  }
}

/* ─── Захист від випадкового закриття під час інтерв'ю ─── */

function beforeUnloadHandler(e) {
  e.preventDefault();
  // Більшість сучасних браузерів показує власне повідомлення; цей текст резервний.
  e.returnValue = 'Активне інтерв\'ю буде втрачено. Дійсно вийти?';
  return e.returnValue;
}

function enableUnloadGuard() {
  window.addEventListener('beforeunload', beforeUnloadHandler);
}

function disableUnloadGuard() {
  window.removeEventListener('beforeunload', beforeUnloadHandler);
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
    alert(err.message);
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
    alert(err.message);
  } finally {
    showLoader(false);
  }
}

function renderAnalysis(a) {
  disableUnloadGuard();
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

/* ─────────────── CV upload & analysis ─────────────── */

function setupCvHandlers() {
  const fileInput = $('cvFileInput');
  const analyzeBtn = $('analyzeCvBtn');
  const resetBtn = $('resetCvBtn');
  const startBtn = $('startCvBtn');
  const fileNameEl = $('cvFileName');

  if (!fileInput) return; // на випадок, якщо HTML не оновлено

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) {
      analyzeBtn.disabled = true;
      fileNameEl.hidden = true;
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('Файл занадто великий. Максимум — 5 MB.');
      fileInput.value = '';
      return;
    }
    fileNameEl.textContent = `📄 ${file.name} (${formatBytes(file.size)})`;
    fileNameEl.hidden = false;
    analyzeBtn.disabled = false;
  });

  analyzeBtn.addEventListener('click', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    showLoader(true);
    analyzeBtn.disabled = true;
    try {
      const result = await api.analyzeCv(file);
      cvAnalysis = result;
      cvSelectedSkills = new Set(result.skills);
      renderCvResult(result);
    } catch (err) {
      alert(err.message);
    } finally {
      showLoader(false);
      analyzeBtn.disabled = false;
    }
  });

  resetBtn.addEventListener('click', () => {
    cvAnalysis = null;
    cvSelectedSkills.clear();
    fileInput.value = '';
    fileNameEl.hidden = true;
    analyzeBtn.disabled = true;
    $('cvResultStage').hidden = true;
    $('cvUploadStage').hidden = false;
  });

  startBtn.addEventListener('click', () => {
    const skills = Array.from(cvSelectedSkills);
    if (skills.length === 0) {
      alert('Оберіть хоча б одну навичку для інтерв\'ю.');
      return;
    }
    const title = `Інтерв'ю за резюме (${skills.slice(0, 3).join(', ')}${skills.length > 3 ? '…' : ''})`;
    startInterview(title, 'cv', undefined, skills);
  });
}

function renderCvResult(result) {
  $('cvUploadStage').hidden = true;
  $('cvResultStage').hidden = false;

  $('cvSummary').textContent = result.summary || '—';
  $('cvLevel').textContent = result.experienceLevel
    ? result.experienceLevel.charAt(0).toUpperCase() + result.experienceLevel.slice(1)
    : '—';
  $('cvYears').textContent = result.yearsOfExperience
    ? `${result.yearsOfExperience} р.`
    : '—';

  const container = $('cvSkillsContainer');
  container.innerHTML = result.skills
    .map((s) => `<button type="button" class="skill-chip selected" data-skill="${escapeHtml(s)}">${escapeHtml(s)}</button>`)
    .join('');

  container.querySelectorAll('.skill-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const skill = chip.dataset.skill;
      if (cvSelectedSkills.has(skill)) {
        cvSelectedSkills.delete(skill);
        chip.classList.remove('selected');
      } else {
        cvSelectedSkills.add(skill);
        chip.classList.add('selected');
      }
    });
  });
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}
