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
const BLUE_FILL   = 'rgba(59, 130, 246, 0.08)';
const RED_FILL    = 'rgba(239, 68, 68, 0.08)';
const GREEN_FILL  = 'rgba(34, 197, 94, 0.10)';
const ORANGE      = 'rgb(249, 115, 22)';
const ORANGE_FILL = 'rgba(249, 115, 22, 0.09)';
const GRAY        = 'rgba(100, 116, 139, 0.75)';

// Dimmed variants used when observed data is visible
const BLUE_DIM        = 'rgba(59, 130, 246, 0.20)';
const BLUE_FILL_DIM   = 'rgba(59, 130, 246, 0.03)';
const RED_DIM         = 'rgba(239, 68, 68,  0.20)';
const RED_FILL_DIM    = 'rgba(239, 68, 68,  0.03)';
const GREEN_DIM       = 'rgba(34, 197, 94,  0.20)';
const ORANGE_DIM      = 'rgba(249, 115, 22, 0.20)';
const ORANGE_FILL_DIM = 'rgba(249, 115, 22, 0.03)';
const GRAY_DIM        = 'rgba(100, 116, 139, 0.25)';

const BLUE_SCATTER   = 'rgba(59, 130, 246, 0.70)';
const RED_SCATTER    = 'rgba(239, 68, 68,  0.70)';
const ORANGE_SCATTER = 'rgba(249, 115, 22, 0.70)';
const GREEN_KM       = 'rgba(34, 197, 94,  0.75)';
const ORANGE_KM      = 'rgba(249, 115, 22, 0.75)';
const GRAY_KM        = 'rgba(100, 116, 139, 0.75)';

/** Scatter dataset (no connecting line, dots only). */
function scatterDs(color, label) {
  return {
    label, data: [],
    type: 'scatter',
    borderColor: color, backgroundColor: color,
    pointRadius: 4, pointStyle: 'circle', borderWidth: 1.5,
    showLine: false, fill: false,
  };
}

/** KM step-function dataset (dashed stepped line, no points). */
function kmDs(color, label, em = false) {
  return {
    label, data: [],
    borderColor: color, backgroundColor: 'transparent',
    fill: false, tension: 0, stepped: 'after',
    pointRadius: 0, pointStyle: 'line', borderWidth: em ? 2.5 : 1.5,
    borderDash: [4, 3],
  };
}

let chartConc        = null;
let chartBiomarker   = null;
let chartBenefit     = null;
let chartSafety      = null;
let chartSafetyEvent = null;

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

function buildConcChart(ctx, em = false) {
  return new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [
        {
          label: 'Concentration (mg/L)',
          data: [],
          borderColor: BLUE,
          backgroundColor: BLUE_FILL,
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          borderWidth: em ? 3 : 2,
        },
        scatterDs(BLUE_SCATTER, 'Observed'),
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
            onClick: () => {},
            labels: {
              boxWidth: em ? 18 : 14, padding: em ? 14 : 10, usePointStyle: true,
              filter: (item, data) => data.datasets[item.datasetIndex].data.length > 0,
              ...(em ? { font: { size: 15 } } : {}),
            },
          },
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

function buildBiomarkerChart(ctx, em = false) {
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
          pointStyle: 'line',
          borderWidth: em ? 3 : 2,
          order: 1,
        },
        {
          label: 'Baseline (100%)',
          data: [{ x: 0, y: 100 }, { x: 14, y: 100 }],
          borderColor: 'rgba(100,100,100,0.4)',
          borderDash: [5, 4],
          borderWidth: em ? 2 : 1.5,
          pointRadius: 0,
          pointStyle: 'line',
          fill: false,
          tension: 0,
          order: 2,
        },
        scatterDs(RED_SCATTER, 'Observed'),
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
          onClick: () => {},
          labels: {
            boxWidth: em ? 18 : 14, padding: em ? 14 : 10, usePointStyle: true,
            filter: (item, data) => data.datasets[item.datasetIndex].data.length > 0,
            ...(em ? { font: { size: 15 } } : {}),
          },
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

function buildBenefitSurvivalChart(ctx, em = false) {
  return new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [
        {
          label: 'Treatment',
          data: [],
          borderColor: GREEN,
          backgroundColor: 'transparent',
          fill: false,
          tension: 0.3,
          pointRadius: 0,
          pointStyle: 'line',
          borderWidth: em ? 3.5 : 2.5,
          order: 1,
        },
        {
          label: 'Std. of Care',
          data: [],
          borderColor: GRAY,
          backgroundColor: 'transparent',
          borderDash: [6, 4],
          fill: false,
          tension: 0,
          pointRadius: 0,
          pointStyle: 'line',
          borderWidth: em ? 2.5 : 1.5,
          order: 2,
        },
        kmDs(GREEN_KM, 'Treatment (KM)', em),
        kmDs(GRAY_KM,  'Std. of Care (KM)', em),
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
          onClick: () => {},
          labels: {
            boxWidth: em ? 18 : 14, padding: em ? 14 : 10, usePointStyle: true,
            filter: (item, data) => data.datasets[item.datasetIndex].data.length > 0,
            ...(em ? { font: { size: 15 } } : {}),
          },
        },
        tooltip: {
          callbacks: {
            title: items => `${items[0].chart.options.scales.x.title.text.replace('Time ', '')} ${items[0].parsed.x.toFixed(1)}`,
            label: item  => ` ${item.dataset.label}: ${item.parsed.y.toFixed(1)} %`,
          },
        },
      },
      scales: {
        x: { ...xDays },
        y: {
          title: { display: true, text: 'Event-free Survival (%)' },
          min: 0,
          max: 110,
          ticks: { maxTicksLimit: 6, callback: v => v <= 100 ? v : '' },
        },
      },
    },
  });
}

function buildSafetyChart(ctx, em = false) {
  return new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [
        {
          label: 'Safety Biomarker Increase (%)',
          data: [],
          borderColor: ORANGE,
          backgroundColor: ORANGE_FILL,
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          borderWidth: em ? 3 : 2,
        },
        scatterDs(ORANGE_SCATTER, 'Observed'),
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
            onClick: () => {},
            labels: {
              boxWidth: em ? 18 : 14, padding: em ? 14 : 10, usePointStyle: true,
              filter: (item, data) => data.datasets[item.datasetIndex].data.length > 0,
              ...(em ? { font: { size: 15 } } : {}),
            },
          },
        tooltip: {
          callbacks: {
            title: items => `${items[0].chart.options.scales.x.title.text.replace('Time ', '')} ${items[0].parsed.x.toFixed(1)}`,
            label: item  => ` +${item.parsed.y.toFixed(1)} %`,
          },
        },
      },
      scales: {
        x: { ...xDays },
        y: {
          title: { display: true, text: 'Increase above baseline (%)' },
          min: 0,
          suggestedMax: 100,
          ticks: { maxTicksLimit: 6 },
        },
      },
    },
  });
}

function buildSafetyEventChart(ctx, em = false) {
  return new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [
        {
          label: 'Treatment',
          data: [],
          borderColor: ORANGE,
          backgroundColor: 'transparent',
          fill: false,
          tension: 0.3,
          pointRadius: 0,
          pointStyle: 'line',
          borderWidth: em ? 3.5 : 2.5,
          order: 1,
        },
        {
          label: 'Std. of Care',
          data: [],
          borderColor: GRAY,
          backgroundColor: 'transparent',
          borderDash: [6, 4],
          fill: false,
          tension: 0,
          pointRadius: 0,
          pointStyle: 'line',
          borderWidth: em ? 2.5 : 1.5,
          order: 2,
        },
        kmDs(ORANGE_KM, 'Treatment (KM)', em),
        kmDs(GRAY_KM,   'Std. of Care (KM)', em),
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
          onClick: () => {},
          labels: {
            boxWidth: em ? 18 : 14, padding: em ? 14 : 10, usePointStyle: true,
            filter: (item, data) => data.datasets[item.datasetIndex].data.length > 0,
            ...(em ? { font: { size: 15 } } : {}),
          },
        },
        tooltip: {
          callbacks: {
            title: items => `${items[0].chart.options.scales.x.title.text.replace('Time ', '')} ${items[0].parsed.x.toFixed(1)}`,
            label: item  => ` ${item.dataset.label}: ${item.parsed.y.toFixed(1)} %`,
          },
        },
      },
      scales: {
        x: { ...xDays },
        y: {
          title: { display: true, text: 'Patients with Safety Event (%)' },
          min: 0,
          max: 100,
          ticks: { maxTicksLimit: 6 },
        },
      },
    },
  });
}

// ─── Y-axis ceiling helper ────────────────────────────────────────────────────

/**
 * Round v up to a clean number suitable as a chart axis maximum.
 * E.g. 0.34 → 0.5,  0.07 → 0.1,  1.8 → 2,  6.5 → 10
 */
function niceYMax(v) {
  if (v <= 0) return 1;
  const mag   = Math.pow(10, Math.floor(Math.log10(v)));
  const steps = [1, 1.5, 2, 2.5, 5, 10];
  for (const s of steps) {
    if (v <= s * mag) return s * mag;
  }
  return 10 * mag;
}

// ─── Axis switcher ────────────────────────────────────────────────────────────

/** Overwrite a chart's x-axis config in-place and flag it for update. */
function setXAxis(chart, cfg) {
  Object.assign(chart.options.scales.x, cfg);
}

// ─── Public API ───────────────────────────────────────────────────────────────

function initCharts(exportMode = false) {
  if (exportMode) {
    Chart.defaults.font.size = 16;
    Chart.defaults.color     = '#222';
  }
  chartConc        = buildConcChart(document.getElementById('chartConc').getContext('2d'), exportMode);
  chartBiomarker   = buildBiomarkerChart(document.getElementById('chartBiomarker').getContext('2d'), exportMode);
  chartBenefit     = buildBenefitSurvivalChart(document.getElementById('chartBenefit').getContext('2d'), exportMode);
  chartSafety      = buildSafetyChart(document.getElementById('chartSafety').getContext('2d'), exportMode);
  chartSafetyEvent = buildSafetyEventChart(document.getElementById('chartSafetyEvent').getContext('2d'), exportMode);
}

/**
 * Update all charts with new simulation data.
 *
 * @param {Object} data          — result from runSimulation()
 * @param {string} view          — 'short' | 'long'
 * @param {Object|null} obsData  — result from generateObservedData(), or null
 */
function updateCharts(data, view, obsData) {
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

  // Dim model curves when observed data is shown so the data reads foreground
  const dim = !!obsData;
  chartConc.data.datasets[0].borderColor      = dim ? BLUE_DIM      : BLUE;
  chartConc.data.datasets[0].backgroundColor  = dim ? BLUE_FILL_DIM : BLUE_FILL;
  chartBiomarker.data.datasets[0].borderColor     = dim ? RED_DIM      : RED;
  chartBiomarker.data.datasets[0].backgroundColor = dim ? RED_FILL_DIM : RED_FILL;
  chartBiomarker.data.datasets[1].borderColor     = dim ? 'rgba(100,100,100,0.15)' : 'rgba(100,100,100,0.4)';
  chartBenefit.data.datasets[0].borderColor    = dim ? GREEN_DIM : GREEN;
  chartBenefit.data.datasets[1].borderColor    = dim ? GRAY_DIM  : GRAY;
  chartSafety.data.datasets[0].borderColor     = dim ? ORANGE_DIM      : ORANGE;
  chartSafety.data.datasets[0].backgroundColor = dim ? ORANGE_FILL_DIM : ORANGE_FILL;
  chartSafetyEvent.data.datasets[0].borderColor = dim ? ORANGE_DIM : ORANGE;
  chartSafetyEvent.data.datasets[1].borderColor = dim ? GRAY_DIM   : GRAY;

  // Concentration — y-axis fixed to Cmax at max slider dose so scale never jumps
  setXAxis(chartConc, xCfg);
  chartConc.options.scales.y.max = niceYMax(src.concYMax);
  chartConc.data.datasets[0].data = xVals.map((x, i) => ({ x, y: src.conc[i] }));
  chartConc.data.datasets[1].data = obsData ? obsData.concObs : [];
  chartConc.update('none');

  // Biomarker
  setXAxis(chartBiomarker, xCfg);
  chartBiomarker.data.datasets[0].data = xVals.map((x, i) => ({ x, y: src.biomarker[i] }));
  chartBiomarker.data.datasets[1].data = [{ x: 0, y: 100 }, { x: xEnd, y: 100 }];
  chartBiomarker.data.datasets[2].data = obsData ? obsData.biomarkerObs : [];
  chartBiomarker.update('none');

  // Benefit survival (treatment vs SoC) + KM step functions
  setXAxis(chartBenefit, xCfg);
  chartBenefit.data.datasets[0].data = xVals.map((x, i) => ({ x, y: src.benefitSurvival[i] }));
  chartBenefit.data.datasets[1].data = xVals.map((x, i) => ({ x, y: src.socBenefitSurvival[i] }));
  chartBenefit.data.datasets[2].data = obsData ? obsData.benefitKM    : [];
  chartBenefit.data.datasets[3].data = obsData ? obsData.socBenefitKM : [];
  chartBenefit.update('none');

  // Safety Biomarker (show increase above baseline: S − 100)
  setXAxis(chartSafety, xCfg);
  chartSafety.data.datasets[0].data = xVals.map((x, i) => ({ x, y: src.safety[i] - 100 }));
  chartSafety.data.datasets[1].data = obsData ? obsData.safetyObs : [];
  chartSafety.update('none');

  // Cumulative safety events: 100 − survival (increasing from 0) + KM step functions
  setXAxis(chartSafetyEvent, xCfg);
  chartSafetyEvent.data.datasets[0].data = xVals.map((x, i) => ({ x, y: 100 - src.safetyEventSurvival[i] }));
  chartSafetyEvent.data.datasets[1].data = xVals.map((x, i) => ({ x, y: 100 - src.socSafetySurvival[i] }));
  chartSafetyEvent.data.datasets[2].data = obsData ? obsData.safetyKM    : [];
  chartSafetyEvent.data.datasets[3].data = obsData ? obsData.socSafetyKM : [];
  chartSafetyEvent.update('none');
}
