/**
 * Сторінка профілю та аналітики:
 *  - GET /api/statistics  → агреговані метрики (mean, median, std dev, Q1/Q3, прогрес)
 *  - GET /api/interview   → список інтерв'ю
 *  - GET /api/benchmarks  → еталонні профілі Junior/Middle/Senior (накладаються на радар)
 *  - GET /api/roadmap     → персоналізована дорожня карта (якщо вже згенерована)
 *  - POST /api/roadmap/generate → запит нової roadmap
 *  Експорт у PDF через html2pdf.js
 */

import { api } from './api.js';
import { waitForAuth } from './auth.js';

const $ = (id) => document.getElementById(id);
const emptyState = $('emptyState');
const profileContent = $('profileContent');
const loader = $('loader');
const exportPdfBtn = $('exportPdfBtn');
const benchmarkSelect = $('benchmarkSelect');
const generateRoadmapBtn = $('generateRoadmapBtn');
const roadmapEmpty = $('roadmapEmpty');
const roadmapContent = $('roadmapContent');

const CRITERIA_LABELS = {
  theoreticalKnowledge: 'Теоретичні знання',
  problemSolving: 'Вирішення задач',
  technicalCommunication: 'Технічна комунікація',
  codeQuality: 'Якість коду',
  architecturalThinking: 'Архітектурне мислення',
};

const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const MODE_BADGES = {
  technical: '🛠 Технічне',
  softskills: '🤝 Soft Skills',
  vacancy: '📄 Вакансія',
};

let radarChartInstance = null;
let currentStats = null;
let currentBenchmarks = null;
let currentUser = null;

(async function init() {
  const user = await waitForAuth();
  if (!user) return;
  currentUser = user;

  loader.hidden = false;
  try {
    const [stats, interviewsResp, benchmarksResp, roadmapResp] = await Promise.all([
      api.getStatistics(),
      api.getInterviews(),
      api.getBenchmarks().catch(() => ({ benchmarks: null })),
      api.getRoadmap().catch(() => ({ roadmap: null })),
    ]);

    if (!stats || stats.totalInterviews === 0) {
      emptyState.hidden = false;
      return;
    }

    currentStats = stats;
    currentBenchmarks = benchmarksResp?.benchmarks || null;

    profileContent.hidden = false;
    exportPdfBtn.hidden = false;

    fillPdfHeader(user, stats);
    fillSummaryCards(stats);
    drawRadar(stats.byCriteria, 'junior');
    drawLine(stats.progressTrend);
    fillStatsTable(stats.byCriteria);
    fillInterviewsList(interviewsResp.interviews || []);

    if (roadmapResp?.roadmap) {
      renderRoadmap(roadmapResp.roadmap, roadmapResp.generatedAt);
    }

    bindControls();
  } catch (err) {
    alert('Помилка: ' + err.message);
  } finally {
    loader.hidden = true;
  }
})();

function bindControls() {
  benchmarkSelect.addEventListener('change', () => {
    drawRadar(currentStats.byCriteria, benchmarkSelect.value);
  });

  generateRoadmapBtn.addEventListener('click', async () => {
    generateRoadmapBtn.disabled = true;
    generateRoadmapBtn.textContent = 'Генерую…';
    loader.hidden = false;
    try {
      const { roadmap, generatedAt } = await api.generateRoadmap();
      renderRoadmap(roadmap, generatedAt);
    } catch (err) {
      alert('Помилка генерації плану: ' + err.message);
    } finally {
      loader.hidden = true;
      generateRoadmapBtn.disabled = false;
      generateRoadmapBtn.textContent = 'Згенерувати знову';
    }
  });

  exportPdfBtn.addEventListener('click', exportToPdf);

  const deleteAllBtn = document.getElementById('deleteAllBtn');
  if (deleteAllBtn) deleteAllBtn.addEventListener('click', onDeleteAll);
}

function fillPdfHeader(user, stats) {
  const date = new Date().toLocaleDateString('uk-UA');
  $('pdfMeta').textContent =
    `Користувач: ${user.displayName || user.email} • Дата звіту: ${date} • Інтерв'ю: ${stats.totalInterviews}`;
}

function fillSummaryCards(stats) {
  $('totalInterviews').textContent = stats.totalInterviews;
  $('averageScore').textContent = stats.overall.mean.toFixed(1);
  $('medianScore').textContent = stats.overall.median.toFixed(1);
  $('maxScore').textContent = stats.overall.max.toFixed(1);

  const pi = stats.progressIndicator;
  const piEl = $('progressIndicator');
  if (pi > 0) {
    piEl.textContent = '+' + pi.toFixed(1);
    piEl.style.color = 'var(--success)';
  } else if (pi < 0) {
    piEl.textContent = pi.toFixed(1);
    piEl.style.color = 'var(--danger)';
  } else {
    piEl.textContent = '—';
  }
}

function drawRadar(byCriteria, benchmarkKey) {
  const ctx = document.getElementById('radarChart');
  if (radarChartInstance) radarChartInstance.destroy();

  const labels = Object.keys(byCriteria).map((k) => CRITERIA_LABELS[k] || k);
  const userData = Object.values(byCriteria).map((s) => s.mean);

  const datasets = [
    {
      label: 'Ваш профіль',
      data: userData,
      borderColor: '#5b6cf0',
      backgroundColor: 'rgba(91, 108, 240, 0.25)',
      borderWidth: 2,
      pointBackgroundColor: '#5b6cf0',
    },
  ];

  if (benchmarkKey && benchmarkKey !== 'none' && currentBenchmarks?.[benchmarkKey]) {
    const bm = currentBenchmarks[benchmarkKey];
    const bmData = Object.keys(byCriteria).map((k) => bm.scores[k] ?? 0);
    const colorMap = {
      junior: { border: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' },
      middle: { border: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
      senior: { border: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' },
    };
    const color = colorMap[benchmarkKey];
    datasets.push({
      label: `Еталон ${bm.label}`,
      data: bmData,
      borderColor: color.border,
      backgroundColor: color.bg,
      borderWidth: 2,
      borderDash: [6, 4],
      pointBackgroundColor: color.border,
    });
  }

  radarChartInstance = new Chart(ctx, {
    type: 'radar',
    data: { labels, datasets },
    options: {
      responsive: true,
      scales: { r: { beginAtZero: true, suggestedMax: 10, ticks: { stepSize: 2 } } },
      plugins: { legend: { position: 'bottom' } },
    },
  });
}

function drawLine(trend) {
  const ctx = document.getElementById('lineChart');
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: trend.map((p) => `Сесія ${p.index}`),
      datasets: [
        {
          label: 'Загальний бал',
          data: trend.map((p) => p.score),
          borderColor: '#5b6cf0',
          backgroundColor: 'rgba(91, 108, 240, 0.15)',
          tension: 0.3,
          fill: true,
          pointRadius: 5,
        },
      ],
    },
    options: {
      responsive: true,
      scales: { y: { beginAtZero: true, suggestedMax: 10 } },
      plugins: {
        tooltip: {
          callbacks: {
            afterLabel: (ctx) => {
              const p = trend[ctx.dataIndex];
              return p ? `Тема: ${p.topic}` : '';
            },
          },
        },
      },
    },
  });
}

function fillStatsTable(byCriteria) {
  const tbody = document.querySelector('#statsTable tbody');
  tbody.innerHTML = Object.entries(byCriteria)
    .map(
      ([key, s]) => `
      <tr>
        <td><strong>${CRITERIA_LABELS[key] || key}</strong></td>
        <td>${s.mean}</td>
        <td>${s.median}</td>
        <td>${s.stdDev}</td>
        <td>${s.q1}</td>
        <td>${s.q3}</td>
        <td>${s.min}</td>
        <td>${s.max}</td>
      </tr>`
    )
    .join('');
}

function fillInterviewsList(interviews) {
  const completed = interviews.filter((i) => i.status === 'completed');
  const list = document.getElementById('interviewsList');

  if (!completed.length) {
    list.innerHTML = '<p class="muted">Немає завершених інтерв\'ю.</p>';
    return;
  }

  list.innerHTML = completed
    .map((i) => {
      const date = i.completedAt
        ? new Date(i.completedAt).toLocaleString('uk-UA')
        : '—';
      const score = i.analysis?.overallScore?.toFixed(1) ?? '—';
      const badge = MODE_BADGES[i.mode] || MODE_BADGES.technical;
      return `
        <div class="interview-item" data-id="${escapeHtml(i.id)}">
          <div>
            <h4>${escapeHtml(i.topic)} <span class="mode-badge">${badge}</span></h4>
            <small>${date}</small>
          </div>
          <div class="interview-right">
            <div class="interview-score">${score} / 10</div>
            <button class="btn-delete-icon" title="Видалити це інтерв'ю" data-action="delete-one" data-id="${escapeHtml(i.id)}">🗑</button>
          </div>
        </div>`;
    })
    .join('');

  // Биндимо handlers після рендеру
  list.querySelectorAll('[data-action="delete-one"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onDeleteOne(btn.dataset.id);
    });
  });
}

async function onDeleteOne(id) {
  if (!confirm('Видалити це інтерв\'ю? Дію не можна скасувати.')) return;
  loader.hidden = false;
  try {
    await api.deleteInterview(id);
    location.reload();
  } catch (err) {
    alert('Помилка видалення: ' + err.message);
  } finally {
    loader.hidden = true;
  }
}

async function onDeleteAll() {
  if (!confirm('Видалити ВСЮ історію інтерв\'ю та скинути статистику? Дію не можна скасувати.')) return;
  if (!confirm('Точно видалити? Це остаточно.')) return;
  loader.hidden = false;
  try {
    const result = await api.deleteAllInterviews();
    alert(`Видалено інтерв'ю: ${result.deleted}`);
    location.reload();
  } catch (err) {
    alert('Помилка: ' + err.message);
  } finally {
    loader.hidden = true;
  }
}

function renderRoadmap(roadmap, generatedAt) {
  roadmapEmpty.hidden = true;
  roadmapContent.hidden = false;

  const meta = generatedAt
    ? `<p class="muted">Згенеровано: ${new Date(generatedAt).toLocaleString('uk-UA')}</p>`
    : '';

  roadmapContent.innerHTML = `
    <div class="roadmap-summary">
      <p><strong>${escapeHtml(roadmap.summary || '')}</strong></p>
      <p class="muted">Тривалість плану: ${roadmap.totalWeeks || roadmap.modules?.length || '?'} тижнів</p>
      ${meta}
    </div>

    <div class="roadmap-modules">
      ${(roadmap.modules || []).map((m) => `
        <div class="roadmap-module">
          <div class="roadmap-week">Тиждень ${m.week}</div>
          <h4>${escapeHtml(m.title)}</h4>
          <div class="roadmap-focus">Фокус: <strong>${CRITERIA_LABELS[m.focusCriterion] || m.focusCriterion || '—'}</strong></div>

          ${m.goals?.length ? `
            <div class="roadmap-block">
              <strong>🎯 Цілі:</strong>
              <ul>${m.goals.map((g) => `<li>${escapeHtml(g)}</li>`).join('')}</ul>
            </div>` : ''}

          ${m.topics?.length ? `
            <div class="roadmap-block">
              <strong>📚 Теми:</strong>
              <ul>${m.topics.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>
            </div>` : ''}

          ${m.practicalTasks?.length ? `
            <div class="roadmap-block">
              <strong>🛠 Практика:</strong>
              <ul>${m.practicalTasks.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>
            </div>` : ''}

          ${m.resources?.length ? `
            <div class="roadmap-block">
              <strong>📖 Ресурси:</strong>
              <ul>${m.resources.map((r) => `
                <li><span class="res-type">[${escapeHtml(r.type || 'resource')}]</span>
                <strong>${escapeHtml(r.title)}</strong>${r.note ? ' — ' + escapeHtml(r.note) : ''}</li>
              `).join('')}</ul>
            </div>` : ''}
        </div>
      `).join('')}
    </div>

    ${roadmap.expectedOutcome ? `
      <div class="roadmap-outcome">
        <strong>🎓 Очікуваний результат:</strong>
        <p>${escapeHtml(roadmap.expectedOutcome)}</p>
      </div>` : ''}
  `;
}

async function exportToPdf() {
  const element = document.getElementById('profileContent');
  exportPdfBtn.disabled = true;
  exportPdfBtn.textContent = '⏳ Генерую PDF…';

  // Тимчасово приховуємо кнопку генерації roadmap (її в PDF не треба)
  const hiddenWhileExport = [generateRoadmapBtn];
  hiddenWhileExport.forEach((el) => (el.style.visibility = 'hidden'));

  const fileName = `SkillScope_Report_${new Date().toISOString().slice(0, 10)}.pdf`;

  try {
    await html2pdf()
      .set({
        margin: [10, 10, 10, 10],
        filename: fileName,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
      })
      .from(element)
      .save();
  } catch (err) {
    alert('Помилка експорту PDF: ' + err.message);
  } finally {
    hiddenWhileExport.forEach((el) => (el.style.visibility = ''));
    exportPdfBtn.disabled = false;
    exportPdfBtn.textContent = '📄 Завантажити PDF-звіт';
  }
}
