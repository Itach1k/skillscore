/**
 * Програмна генерація PDF-звіту через jsPDF.
 * Замість screenshot DOM (html2pdf), малюємо текст і таблиці напряму —
 * це дає чисту білу сторінку, читаємий текст і правильні розриви.
 *
 * Зовнішній API: generatePdfReport({ user, stats, benchmarks, benchmarkKey, interviews, roadmap, charts })
 */

const CRITERIA_LABELS = {
  theoreticalKnowledge: 'Теоретичні знання',
  problemSolving: 'Вирішення задач',
  technicalCommunication: 'Технічна комунікація',
  codeQuality: 'Якість коду',
  architecturalThinking: 'Архітектурне мислення',
};

const MODE_LABELS = {
  technical: 'Технічне',
  softskills: 'Soft Skills',
  vacancy: 'Вакансія',
  cv: 'За резюме',
};

// ───────── Кольори (RGB)
const C = {
  primary: [91, 108, 240],
  text: [26, 31, 54],
  muted: [107, 114, 128],
  border: [229, 231, 235],
  success: [16, 185, 129],
  danger: [239, 68, 68],
  panel: [248, 249, 255],
};

const PAGE = { w: 210, h: 297, marginX: 15, marginTop: 15, marginBottom: 18 };

export async function generatePdfReport({
  user,
  stats,
  benchmarks,
  benchmarkKey,
  interviews,
  roadmap,
  radarChart,
  lineChart,
}) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

  // Реєструємо шрифт з підтримкою кирилиці
  // jsPDF за замовчуванням підтримує лише Latin1, тому використовуємо вбудовану підтримку Unicode
  // через шрифт "helvetica" — він має базову кирилицю в більшості рендерів через WinAnsi.
  // Для якісної кирилиці підключаємо Roboto через addFont.
  await registerCyrillicFont(doc);
  doc.setFont('Roboto', 'normal');

  let y = PAGE.marginTop;

  // ───── Заголовок
  y = drawHeader(doc, user, stats);

  // ───── Зведена статистика
  y = ensureSpace(doc, y, 50);
  y = drawSummaryCards(doc, y, stats);

  // ───── Графіки (radar + line)
  if (radarChart || lineChart) {
    y = ensureSpace(doc, y, 90);
    y = drawCharts(doc, y, radarChart, lineChart);
  }

  // ───── Бенчмарк-порівняння (текстове)
  if (benchmarks && benchmarkKey && benchmarkKey !== 'none' && benchmarks[benchmarkKey]) {
    y = ensureSpace(doc, y, 50);
    y = drawBenchmarkComparison(doc, y, stats.byCriteria, benchmarks[benchmarkKey]);
  }

  // ───── Таблиця описової статистики
  y = ensureSpace(doc, y, 60);
  y = drawStatsTable(doc, y, stats.byCriteria);

  // ───── Roadmap
  if (roadmap) {
    doc.addPage();
    y = PAGE.marginTop;
    y = drawRoadmap(doc, y, roadmap);
  }

  // ───── Історія
  const completed = (interviews || []).filter((i) => i.status === 'completed');
  if (completed.length) {
    if (y > PAGE.h - PAGE.marginBottom - 50) {
      doc.addPage();
      y = PAGE.marginTop;
    } else {
      y += 8;
    }
    y = drawHistory(doc, y, completed);
  }

  // ───── Футер на кожній сторінці
  drawFooters(doc);

  const fileName = `SkillScope_Report_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(fileName);
}

/* ═══════════════════ HELPERS ═══════════════════ */

/**
 * Завантажує і реєструє шрифт Roboto з кирилицею.
 * Шрифт у форматі base64 інлайнимо через fetch + конвертацію.
 */
async function registerCyrillicFont(doc) {
  // Roboto Regular з підтримкою кирилиці — кешуємо в localStorage щоб не качати щоразу
  const CACHE_KEY = 'skillscope_roboto_font_v1';
  let base64 = (typeof localStorage !== 'undefined') ? localStorage.getItem(CACHE_KEY) : null;

  if (!base64) {
    try {
      // Безкоштовний CDN для шрифтів TTF з підтримкою кирилиці
      const url = 'https://cdn.jsdelivr.net/gh/google/fonts@main/apache/roboto/Roboto%5Bwdth%2Cwght%5D.ttf';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Font fetch failed');
      const buf = await res.arrayBuffer();
      base64 = arrayBufferToBase64(buf);
      try { localStorage.setItem(CACHE_KEY, base64); } catch { /* quota — ігноруємо */ }
    } catch (err) {
      console.warn('[PDF] Не вдалося завантажити шрифт, кирилиця може некоректно відображатися:', err);
      return;
    }
  }

  doc.addFileToVFS('Roboto.ttf', base64);
  doc.addFont('Roboto.ttf', 'Roboto', 'normal');
  doc.addFont('Roboto.ttf', 'Roboto', 'bold'); // використаємо той самий, відрізнятиметься через setFont
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function ensureSpace(doc, y, needed) {
  if (y + needed > PAGE.h - PAGE.marginBottom) {
    doc.addPage();
    return PAGE.marginTop;
  }
  return y;
}

function setColor(doc, [r, g, b], type = 'text') {
  if (type === 'text') doc.setTextColor(r, g, b);
  else if (type === 'fill') doc.setFillColor(r, g, b);
  else if (type === 'stroke') doc.setDrawColor(r, g, b);
}

function drawHeader(doc, user, stats) {
  // Логотип + назва
  setColor(doc, C.primary, 'text');
  doc.setFontSize(20);
  doc.text('SkillScope — звіт про компетенції', PAGE.marginX, 22);

  // Мета-рядок
  setColor(doc, C.muted, 'text');
  doc.setFontSize(10);
  const userName = user?.displayName || user?.email || 'Користувач';
  const date = new Date().toLocaleDateString('uk-UA');
  doc.text(`Користувач: ${userName}  •  Дата: ${date}  •  Завершено інтерв'ю: ${stats.totalInterviews}`, PAGE.marginX, 28);

  // Розділювач
  setColor(doc, C.primary, 'stroke');
  doc.setLineWidth(0.5);
  doc.line(PAGE.marginX, 31, PAGE.w - PAGE.marginX, 31);

  return 38;
}

function drawSummaryCards(doc, y, stats) {
  setColor(doc, C.text, 'text');
  doc.setFontSize(13);
  doc.text('Зведена статистика', PAGE.marginX, y);
  y += 6;

  const cards = [
    { label: 'Всього інтерв\'ю', value: String(stats.totalInterviews) },
    { label: 'Середній бал', value: stats.overall.mean.toFixed(1) },
    { label: 'Медіана', value: stats.overall.median.toFixed(1) },
    { label: 'Максимум', value: stats.overall.max.toFixed(1) },
    { label: 'Прогрес', value: (stats.progressIndicator > 0 ? '+' : '') + stats.progressIndicator.toFixed(1) },
  ];

  const cardW = (PAGE.w - PAGE.marginX * 2 - 4 * 3) / 5;
  const cardH = 22;
  cards.forEach((c, i) => {
    const x = PAGE.marginX + i * (cardW + 3);
    // Фон
    setColor(doc, C.panel, 'fill');
    doc.roundedRect(x, y, cardW, cardH, 2, 2, 'F');
    // Лейбл
    setColor(doc, C.muted, 'text');
    doc.setFontSize(7.5);
    doc.text(c.label, x + 3, y + 5);
    // Значення
    setColor(doc, C.primary, 'text');
    doc.setFontSize(16);
    doc.text(c.value, x + 3, y + 16);
  });

  return y + cardH + 8;
}

function drawCharts(doc, y, radarChart, lineChart) {
  setColor(doc, C.text, 'text');
  doc.setFontSize(13);
  doc.text('Візуалізація', PAGE.marginX, y);
  y += 5;

  const chartW = (PAGE.w - PAGE.marginX * 2 - 6) / 2;
  const chartH = 75;

  if (radarChart) {
    try {
      const img = radarChart.toBase64Image('image/png', 1);
      doc.addImage(img, 'PNG', PAGE.marginX, y, chartW, chartH);
      // Підпис
      setColor(doc, C.muted, 'text');
      doc.setFontSize(9);
      doc.text('Профіль навичок', PAGE.marginX, y + chartH + 4);
    } catch (e) { console.warn('Radar render fail', e); }
  }

  if (lineChart) {
    try {
      const img = lineChart.toBase64Image('image/png', 1);
      doc.addImage(img, 'PNG', PAGE.marginX + chartW + 6, y, chartW, chartH);
      setColor(doc, C.muted, 'text');
      doc.setFontSize(9);
      doc.text('Динаміка прогресу', PAGE.marginX + chartW + 6, y + chartH + 4);
    } catch (e) { console.warn('Line render fail', e); }
  }

  return y + chartH + 10;
}

function drawBenchmarkComparison(doc, y, byCriteria, benchmark) {
  setColor(doc, C.text, 'text');
  doc.setFontSize(13);
  doc.text(`Порівняння з еталоном «${benchmark.label}»`, PAGE.marginX, y);
  y += 5;

  setColor(doc, C.muted, 'text');
  doc.setFontSize(9);
  const wrap = doc.splitTextToSize(benchmark.description, PAGE.w - PAGE.marginX * 2);
  doc.text(wrap, PAGE.marginX, y);
  y += wrap.length * 4 + 3;

  // Рядок по кожному критерію
  const criteria = Object.keys(byCriteria);
  criteria.forEach((k) => {
    const userScore = byCriteria[k].mean;
    const targetScore = benchmark.scores[k] || 0;
    const diff = userScore - targetScore;
    const color = diff >= 0 ? C.success : C.danger;

    setColor(doc, C.text, 'text');
    doc.setFontSize(10);
    doc.text(CRITERIA_LABELS[k] || k, PAGE.marginX, y);

    // Бар: вашого балу та еталону
    const barX = PAGE.marginX + 55;
    const barMaxW = 100;
    const userBarW = (userScore / 10) * barMaxW;
    const targetX = barX + (targetScore / 10) * barMaxW;

    // Тло бару
    setColor(doc, [240, 240, 245], 'fill');
    doc.rect(barX, y - 3, barMaxW, 4, 'F');
    // Користувача
    setColor(doc, C.primary, 'fill');
    doc.rect(barX, y - 3, userBarW, 4, 'F');
    // Лінія еталону
    setColor(doc, color, 'stroke');
    doc.setLineWidth(0.5);
    doc.line(targetX, y - 4, targetX, y + 1);

    // Текст значень
    setColor(doc, C.muted, 'text');
    doc.setFontSize(9);
    doc.text(`${userScore.toFixed(1)} / ${targetScore}`, barX + barMaxW + 3, y);

    // Дельта
    setColor(doc, color, 'text');
    doc.text(`${diff >= 0 ? '+' : ''}${diff.toFixed(1)}`, barX + barMaxW + 18, y);

    y += 7;
  });

  return y + 4;
}

function drawStatsTable(doc, y, byCriteria) {
  setColor(doc, C.text, 'text');
  doc.setFontSize(13);
  doc.text('Описова статистика за критеріями', PAGE.marginX, y);
  y += 4;

  const head = [['Критерій', 'Середнє', 'Медіана', 'Std', 'Q1', 'Q3', 'Min', 'Max']];
  const body = Object.entries(byCriteria).map(([k, s]) => [
    CRITERIA_LABELS[k] || k,
    s.mean, s.median, s.stdDev, s.q1, s.q3, s.min, s.max,
  ]);

  doc.autoTable({
    startY: y,
    head, body,
    styles: { font: 'Roboto', fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: C.primary, textColor: 255, fontStyle: 'normal' },
    columnStyles: { 0: { cellWidth: 50, fontStyle: 'normal' } },
    margin: { left: PAGE.marginX, right: PAGE.marginX },
    theme: 'grid',
  });

  return doc.lastAutoTable.finalY + 8;
}

function drawRoadmap(doc, y, roadmap) {
  setColor(doc, C.primary, 'text');
  doc.setFontSize(18);
  doc.text('Персоналізована дорожня карта', PAGE.marginX, y);
  y += 7;

  // Summary
  if (roadmap.summary) {
    setColor(doc, C.text, 'text');
    doc.setFontSize(10);
    const wrap = doc.splitTextToSize(roadmap.summary, PAGE.w - PAGE.marginX * 2);
    doc.text(wrap, PAGE.marginX, y);
    y += wrap.length * 4.5 + 4;
  }

  if (roadmap.totalWeeks) {
    setColor(doc, C.muted, 'text');
    doc.setFontSize(9);
    doc.text(`Тривалість: ${roadmap.totalWeeks} тижнів`, PAGE.marginX, y);
    y += 8;
  }

  // Модулі
  for (const m of (roadmap.modules || [])) {
    y = drawRoadmapModule(doc, y, m);
  }

  // Очікуваний результат
  if (roadmap.expectedOutcome) {
    y = ensureSpace(doc, y, 25);
    setColor(doc, C.panel, 'fill');
    doc.roundedRect(PAGE.marginX, y, PAGE.w - PAGE.marginX * 2, 20, 2, 2, 'F');
    setColor(doc, C.primary, 'text');
    doc.setFontSize(10);
    doc.text('Очікуваний результат:', PAGE.marginX + 3, y + 5);
    setColor(doc, C.text, 'text');
    doc.setFontSize(9);
    const wrap = doc.splitTextToSize(roadmap.expectedOutcome, PAGE.w - PAGE.marginX * 2 - 6);
    doc.text(wrap, PAGE.marginX + 3, y + 10);
    y += 22;
  }

  return y;
}

function drawRoadmapModule(doc, y, m) {
  // Орієнтовна висота — для перевірки розриву
  const estimatedHeight =
    18 + // заголовок + фокус
    (m.goals?.length || 0) * 4.5 +
    (m.topics?.length || 0) * 4.5 +
    (m.practicalTasks?.length || 0) * 4.5 +
    (m.resources?.length || 0) * 6 +
    20; // запас

  y = ensureSpace(doc, y, estimatedHeight);

  const startY = y;
  const blockW = PAGE.w - PAGE.marginX * 2;

  // Контейнер (буде намальований після обчислення фактичної висоти)
  const moduleStartY = y;

  // Тиждень
  setColor(doc, C.primary, 'text');
  doc.setFontSize(9);
  doc.text(`ТИЖДЕНЬ ${m.week || '?'}`, PAGE.marginX + 4, y + 5);

  // Заголовок
  setColor(doc, C.text, 'text');
  doc.setFontSize(12);
  const titleWrap = doc.splitTextToSize(m.title || 'Модуль', blockW - 8);
  doc.text(titleWrap, PAGE.marginX + 4, y + 11);
  y += 11 + titleWrap.length * 4.5;

  // Фокус
  setColor(doc, C.muted, 'text');
  doc.setFontSize(9);
  doc.text(`Фокус: ${CRITERIA_LABELS[m.focusCriterion] || m.focusCriterion || '—'}`, PAGE.marginX + 4, y);
  y += 6;

  // Цілі
  if (m.goals?.length) y = drawBulletList(doc, y, '🎯 Цілі:', m.goals, blockW - 8);
  if (m.topics?.length) y = drawBulletList(doc, y, '📚 Теми:', m.topics, blockW - 8);
  if (m.practicalTasks?.length) y = drawBulletList(doc, y, '🛠 Практика:', m.practicalTasks, blockW - 8);

  // Ресурси
  if (m.resources?.length) {
    setColor(doc, C.text, 'text');
    doc.setFontSize(10);
    doc.text('📖 Ресурси:', PAGE.marginX + 4, y);
    y += 4.5;
    setColor(doc, C.text, 'text');
    doc.setFontSize(9);
    for (const r of m.resources) {
      const typeTag = `[${r.type || 'resource'}]`;
      const title = r.title || '';
      const note = r.note ? ` — ${r.note}` : '';
      const full = `${typeTag} ${title}${note}`;
      const wrap = doc.splitTextToSize(full, blockW - 12);
      doc.text(wrap, PAGE.marginX + 8, y);
      y += wrap.length * 4.2;
    }
    y += 2;
  }

  // Намалюємо лівий бордюр модуля
  const moduleHeight = y - moduleStartY + 2;
  setColor(doc, C.primary, 'stroke');
  doc.setLineWidth(1.5);
  doc.line(PAGE.marginX, moduleStartY, PAGE.marginX, moduleStartY + moduleHeight - 2);
  // Рамка зовнішня
  setColor(doc, C.border, 'stroke');
  doc.setLineWidth(0.2);
  doc.roundedRect(PAGE.marginX, moduleStartY, blockW, moduleHeight - 2, 1.5, 1.5, 'S');

  return y + 5;
}

function drawBulletList(doc, y, title, items, maxW) {
  setColor(doc, C.text, 'text');
  doc.setFontSize(10);
  doc.text(title, PAGE.marginX + 4, y);
  y += 4.5;
  setColor(doc, C.text, 'text');
  doc.setFontSize(9);
  for (const it of items) {
    const wrap = doc.splitTextToSize('• ' + it, maxW - 4);
    // Розрив сторінки всередині списку
    if (y + wrap.length * 4.2 > PAGE.h - PAGE.marginBottom) {
      doc.addPage();
      y = PAGE.marginTop;
    }
    doc.text(wrap, PAGE.marginX + 8, y);
    y += wrap.length * 4.2;
  }
  return y + 2;
}

function drawHistory(doc, y, interviews) {
  setColor(doc, C.text, 'text');
  doc.setFontSize(13);
  doc.text('Історія завершених інтерв\'ю', PAGE.marginX, y);
  y += 6;

  const body = interviews.map((i) => [
    i.topic,
    MODE_LABELS[i.mode] || i.mode || '—',
    i.completedAt ? new Date(i.completedAt).toLocaleDateString('uk-UA') : '—',
    i.analysis?.overallScore != null ? i.analysis.overallScore.toFixed(1) : '—',
  ]);

  doc.autoTable({
    startY: y,
    head: [['Тема', 'Режим', 'Дата', 'Бал']],
    body,
    styles: { font: 'Roboto', fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: C.primary, textColor: 255 },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 28 },
      2: { cellWidth: 25 },
      3: { cellWidth: 15, halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: PAGE.marginX, right: PAGE.marginX },
    theme: 'striped',
  });

  return doc.lastAutoTable.finalY + 5;
}

function drawFooters(doc) {
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    setColor(doc, C.muted, 'text');
    doc.setFontSize(8);
    doc.text('SkillScope', PAGE.marginX, PAGE.h - 8);
    doc.text(`Сторінка ${i} / ${totalPages}`, PAGE.w - PAGE.marginX, PAGE.h - 8, { align: 'right' });
  }
}
