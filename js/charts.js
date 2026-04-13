/**
 * charts.js — Chart.js initialisation and update helpers
 *
 * All three charts are always visible. The view toggle ('short' | 'long')
 * changes the x-axis range:
 *   short → 0–14 days  (x in days)
 *   long  → 0–6 months (x in months)
 */

'use strict';

Chart.defaults.font.family = "'Inter', 'Segoe UI', system-ui, sans-serif";
Chart.defaults.font.size   = 13;
Chart.defaults.color       = '#555';

const BLUE       = 'rgb(59, 130, 246)';
const RED        = 'rgb(239, 68, 68)';
const GREEN      = 'rgb(34, 197, 94)';
const BLUE_FILL  = 'rgba(59, 130, 246, 0.08)';
const RED_FILL   = 'rgba(239, 68, 68, 0.08)';
const GREEN_FILL = 'rgba(34, 197, 94, 0.10)';

let chartConc      = null;
let chartBiomarker = null;
let chartBenefit   = null;

// ─── Shared x-axis configs ────────────────────────────────────────────────────

const xDays = {
  type: 'linear',
  title: { display: true, text: 'Time (days)' },
  min: 0,
  max: 14,
  ticks: { stepSize: 2, callback: v => Number.isInteger(v) ? v : '' },
};

const xMonths = {
  type: 'linear',
  title: { display: true, text: 'Time (months)' },
  min: 0,
  max: 6,
  ticks: { stepSize: 1, callback: v => Number.isInteger(v) ? v : '' },
};

// ─── Chart factories ──────────────────────────────────────────────────────────

function buildConcChart(ctx) {
  return new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [{
        label: 'Concentration (mg/L)',
        data: [],
        borderColor: BLUE,
        backgroundColor: BLUE_FILL,
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        borderWidth: 2,
      }],
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: true,
      parsing: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: items => `${items[0].chart.options.scales.x.title.text.replace('Time ', '')} ${items[0].parsed.x.toFixed(1)}`,
            label: item  => ` ${item.parsed.y.toFixed(4)} mg/L`,
          },
        },
      },
      scales: {
        x: { ...xDays },
        y: {
          title: { display: true, text: 'Concentration (mg/L)' },
          min: 0,
          ticks: {
            maxTicksLimit: 6,
            callback: v => Number(v).toFixed(v < 0.01 ? 4 : v < 0.1 ? 3 : 2),
          },
        },
      },
    },
  });
}

function buildBiomarkerChart(ctx) {
  return new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [
        {
          label: 'Biomarker (%)',
          data: [],
          borderColor: RED,
          backgroundColor: RED_FILL,
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 2,
          order: 1,
        },
        {
          label: 'Baseline (100%)',
          data: [{ x: 0, y: 100 }, { x: 14, y: 100 }],
          borderColor: 'rgba(100,100,100,0.4)',
          borderDash: [5, 4],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
          tension: 0,
          order: 2,
        },
      ],
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: true,
      parsing: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          labels: { boxWidth: 14, padding: 10, usePointStyle: true },
        },
        tooltip: {
          filter: item => item.datasetIndex === 0,
          callbacks: {
            title: items => `${items[0].chart.options.scales.x.title.text.replace('Time ', '')} ${items[0].parsed.x.toFixed(1)}`,
            label: item  => ` ${item.parsed.y.toFixed(1)} %`,
          },
        },
      },
      scales: {
        x: { ...xDays },
        y: {
          title: { display: true, text: 'Biomarker Level (%)' },
          min: 0,
          max: 120,
          ticks: { maxTicksLimit: 7 },
        },
      },
    },
  });
}

function buildBenefitChart(ctx) {
  return new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [{
        label: 'Clinical Benefit (%)',
        data: [],
        borderColor: GREEN,
        backgroundColor: GREEN_FILL,
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        borderWidth: 2,
      }],
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: true,
      parsing: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: items => `${items[0].chart.options.scales.x.title.text.replace('Time ', '')} ${items[0].parsed.x.toFixed(1)}`,
            label: item  => ` ${item.parsed.y.toFixed(1)} %`,
          },
        },
      },
      scales: {
        x: { ...xDays },
        y: {
          title: { display: true, text: 'Clinical Benefit (%)' },
          min: 0,
          max: 100,
          ticks: { maxTicksLimit: 6 },
        },
      },
    },
  });
}

// ─── Axis switcher ────────────────────────────────────────────────────────────

/** Overwrite a chart's x-axis config in-place and flag it for update. */
function setXAxis(chart, cfg) {
  Object.assign(chart.options.scales.x, cfg);
}

// ─── Public API ───────────────────────────────────────────────────────────────

function initCharts() {
  chartConc      = buildConcChart(document.getElementById('chartConc').getContext('2d'));
  chartBiomarker = buildBiomarkerChart(document.getElementById('chartBiomarker').getContext('2d'));
  chartBenefit   = buildBenefitChart(document.getElementById('chartBenefit').getContext('2d'));
}

/**
 * Update all three charts with new simulation data.
 *
 * @param {Object} data  — result from runSimulation()
 * @param {string} view  — 'short' | 'long'
 */
function updateCharts(data, view) {
  const { shortTerm, longTerm } = data;
  const isShort = view === 'short';

  const src    = isShort ? shortTerm : longTerm;
  // x values: days for short-term, months for long-term
  const xVals  = isShort
    ? src.times
    : src.times.map(d => +(d / 30).toFixed(4));
  const xCfg   = isShort ? xDays : xMonths;

  // Baseline line endpoints follow the x-axis range
  const xEnd = isShort ? 14 : 6;

  // Concentration
  setXAxis(chartConc, xCfg);
  chartConc.data.datasets[0].data = xVals.map((x, i) => ({ x, y: src.conc[i] }));
  chartConc.update('none');

  // Biomarker
  setXAxis(chartBiomarker, xCfg);
  chartBiomarker.data.datasets[0].data = xVals.map((x, i) => ({ x, y: src.biomarker[i] }));
  chartBiomarker.data.datasets[1].data = [{ x: 0, y: 100 }, { x: xEnd, y: 100 }];
  chartBiomarker.update('none');

  // Benefit
  setXAxis(chartBenefit, xCfg);
  chartBenefit.data.datasets[0].data = xVals.map((x, i) => ({ x, y: src.benefit[i] }));
  chartBenefit.update('none');
}
