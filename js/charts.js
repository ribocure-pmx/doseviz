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
const GREEN_FILL_DIM  = 'rgba(34, 197, 94,  0.03)';
const GRAY_DIM        = 'rgba(100, 116, 139, 0.25)';

const BLUE_SCATTER  = 'rgba(59, 130, 246, 0.70)';
const GREEN_SCATTER = 'rgba(34, 197, 94,  0.70)';
const RED_SCATTER   = 'rgba(239, 68, 68,  0.70)';
const GREEN_KM      = 'rgba(34, 197, 94,  0.75)';
const RED_KM        = 'rgba(239, 68, 68,  0.75)';
const GRAY_KM       = 'rgba(100, 116, 139, 0.75)';

// Population ribbon colours — outer = 90 % PI, inner = 80 % PI.
// The two bands overlap additively, giving the inner region a deeper shade.
const BLUE_POP_OUTER  = 'rgba(59,  130, 246, 0.15)';
const BLUE_POP_INNER  = 'rgba(59,  130, 246, 0.24)';
const GREEN_POP_OUTER = 'rgba(34,  197, 94,  0.15)';
const GREEN_POP_INNER = 'rgba(34,  197, 94,  0.24)';
const RED_POP_OUTER   = 'rgba(239, 68,  68,  0.15)';
const RED_POP_INNER   = 'rgba(239, 68,  68,  0.24)';

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

/**
 * Population ribbon boundary dataset.
 * fillOffset is a relative Chart.js fill target, e.g. '+3' or '+1'.
 * isPopBand=true keeps these invisible in legends and tooltips.
 */
function popBandDs(fillOffset, bgColor) {
  return {
    label: '', isPopBand: true, data: [],
    borderWidth: 0, pointRadius: 0,
    backgroundColor: bgColor,
    fill: fillOffset,
    tension: 0,   // linear — bezier on fill-boundary datasets causes path extent bugs
    order: -2,
  };
}

/** Population median line dataset. */
function popMedianDs(color, label) {
  return {
    label, data: [],
    borderColor: color, backgroundColor: 'transparent',
    borderWidth: 1.5, pointRadius: 0, pointStyle: 'line',
    fill: false, tension: 0.3,
    order: 1,  // drawn on top of dimmed model line; appears after it in legend
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
        // [0] model line  [1] observed scatter
        {
          label: 'Concentration (mg/L)',
          data: [],
          borderColor: BLUE,
          backgroundColor: BLUE_FILL,
          fill: false,
          tension: 0.3,
          pointRadius: 0,
          pointStyle: 'line',
          borderWidth: em ? 3 : 2,
        },
        scatterDs(BLUE_SCATTER, 'Observed'),
        // [2–4] population ribbons — 90 % PI: p5 fills to p95, then median
        popBandDs('+1', BLUE_POP_OUTER),
        popBandDs(false, 'transparent'),
        popMedianDs(BLUE, 'Median (population)'),
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
              filter: (item, data) => data.datasets[item.datasetIndex].data.length > 0
                                   && !data.datasets[item.datasetIndex].isPopBand
                                   && !data.datasets[item.datasetIndex].skipLegend,
              ...(em ? { font: { size: 15 } } : {}),
            },
          },
        tooltip: {
          filter: item => !item.dataset.isPopBand,
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
        // [0] model line  [1] baseline ref  [2] observed scatter
        {
          label: 'Biomarker (%)',
          data: [],
          borderColor: GREEN,
          backgroundColor: GREEN_FILL,
          fill: false,
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
        scatterDs(GREEN_SCATTER, 'Observed'),
        // [3–5] population ribbons — 90 % PI: p5 fills to p95, then median
        popBandDs('+1', GREEN_POP_OUTER),
        popBandDs(false, 'transparent'),
        popMedianDs(GREEN, 'Median (population)'),
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
            filter: (item, data) => data.datasets[item.datasetIndex].data.length > 0
                                 && !data.datasets[item.datasetIndex].isPopBand
                                 && !data.datasets[item.datasetIndex].skipLegend,
            ...(em ? { font: { size: 15 } } : {}),
          },
        },
        tooltip: {
          filter: item => !item.dataset.isPopBand,
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
        // [0] trt smooth  [1] SoC smooth  [2] trt KM  [3] SoC KM  [4] 100% ref
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
        {
          label: '100%',
          data: [],
          isReference: true,
          borderColor: 'rgba(100,100,100,0.4)',
          borderDash: [5, 4],
          borderWidth: em ? 2 : 1.5,
          pointRadius: 0,
          fill: false,
          tension: 0,
          order: 0,
        },
        // [5–7] population ribbons — 90 % PI: treatment arm survival % (p5→p95, median)
        popBandDs('+1', GREEN_POP_OUTER),
        popBandDs(false, 'transparent'),
        popMedianDs(GREEN, 'Median (population)'),
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
            filter: (item, data) => data.datasets[item.datasetIndex].data.length > 0
                                 && !data.datasets[item.datasetIndex].isReference
                                 && !data.datasets[item.datasetIndex].isPopBand
                                 && !data.datasets[item.datasetIndex].skipLegend,
            ...(em ? { font: { size: 15 } } : {}),
          },
        },
        tooltip: {
          filter: item => !item.dataset.isReference && !item.dataset.isPopBand,
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
          max: 103,
          ticks: { stepSize: 25, callback: v => v <= 100 ? v : '' },
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
        // [0] model line  [1] observed scatter
        {
          label: 'Safety Biomarker Increase (%)',
          data: [],
          borderColor: RED,
          backgroundColor: RED_FILL,
          fill: false,
          tension: 0.3,
          pointRadius: 0,
          pointStyle: 'line',
          borderWidth: em ? 3 : 2,
        },
        scatterDs(RED_SCATTER, 'Observed'),
        // [2–4] population ribbons — 90 % PI: p5 fills to p95, then median
        popBandDs('+1', RED_POP_OUTER),
        popBandDs(false, 'transparent'),
        popMedianDs(RED, 'Median (population)'),
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
              filter: (item, data) => data.datasets[item.datasetIndex].data.length > 0
                                   && !data.datasets[item.datasetIndex].isPopBand
                                   && !data.datasets[item.datasetIndex].skipLegend,
              ...(em ? { font: { size: 15 } } : {}),
            },
          },
        tooltip: {
          filter: item => !item.dataset.isPopBand,
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
        // [0] trt smooth  [1] SoC smooth  [2] trt KM  [3] SoC KM
        {
          label: 'Treatment',
          data: [],
          borderColor: RED,
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
        kmDs(RED_KM,  'Treatment (KM)', em),
        kmDs(GRAY_KM, 'Std. of Care (KM)', em),
        // [4–6] population ribbons — 90 % PI: cumulative events % (p5→p95, median)
        popBandDs('+1', RED_POP_OUTER),
        popBandDs(false, 'transparent'),
        popMedianDs(RED, 'Median (population)'),
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
            filter: (item, data) => data.datasets[item.datasetIndex].data.length > 0
                                 && !data.datasets[item.datasetIndex].isPopBand
                                 && !data.datasets[item.datasetIndex].skipLegend,
            ...(em ? { font: { size: 15 } } : {}),
          },
        },
        tooltip: {
          filter: item => !item.dataset.isPopBand,
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
 * @param {Object}      data     — result from runSimulation()
 * @param {string}      view     — 'short' | 'long'
 * @param {Object|null} obsData  — result from generateObservedData(), or null
 * @param {Object|null} popData  — result from runPopulationSimulation(), or null
 */
function updateCharts(data, view, obsData, popData) {
  const { shortTerm, longTerm } = data;
  const isShort = view === 'short';

  const src   = isShort ? shortTerm : longTerm;
  // x values: days for short-term, months for long-term
  const xVals = isShort
    ? src.times
    : src.times.map(d => +(d / 30).toFixed(4));
  const xCfg  = isShort ? xDays : xMonths;

  // Baseline line endpoints follow the x-axis range
  const xEnd = isShort ? 14 : 6;

  // Population data for the current view
  const pop = popData ? (isShort ? popData.shortTerm : popData.longTerm) : null;
  const popX = pop
    ? (isShort ? pop.times : pop.times.map(d => +(d / 30).toFixed(4)))
    : null;

  // When observed data is shown, dim the model lines so data reads as foreground.
  // When population is shown, hide the treatment model lines entirely — the median
  // + ribbon replace them. SoC lines on survival/event charts stay visible and
  // undimmed (they have no population equivalent and are the comparison reference).
  const dimForObs = !!obsData;  // obsData and popData are mutually exclusive (UI enforced)

  // Treatment model lines: hidden when pop on, dimmed when obs on, full otherwise
  chartConc.data.datasets[0].hidden        = !!popData;
  chartConc.data.datasets[0].borderColor   = dimForObs ? BLUE_DIM  : BLUE;
  chartBiomarker.data.datasets[0].hidden   = !!popData;
  chartBiomarker.data.datasets[0].borderColor = dimForObs ? GREEN_DIM : GREEN;
  chartBiomarker.data.datasets[1].borderColor = dimForObs ? 'rgba(100,100,100,0.15)' : 'rgba(100,100,100,0.4)';
  chartBenefit.data.datasets[0].hidden     = !!popData;
  chartBenefit.data.datasets[0].borderColor = dimForObs ? GREEN_DIM : GREEN;
  chartSafety.data.datasets[0].hidden      = !!popData;
  chartSafety.data.datasets[0].borderColor = dimForObs ? RED_DIM   : RED;
  chartSafetyEvent.data.datasets[0].hidden = !!popData;
  chartSafetyEvent.data.datasets[0].borderColor = dimForObs ? RED_DIM : RED;

  // SoC lines: always visible; dim only when observed data is shown (not for pop)
  chartBenefit.data.datasets[1].borderColor     = dimForObs ? GRAY_DIM : GRAY;
  chartSafetyEvent.data.datasets[1].borderColor = dimForObs ? GRAY_DIM : GRAY;

  // Legend: hide treatment model entries when pop is active (median replaces them);
  // keep SoC visible in legend since it remains the comparison reference
  const skipLegend = !!popData;
  chartConc.data.datasets[0].skipLegend        = skipLegend;
  chartBiomarker.data.datasets[0].skipLegend   = skipLegend;
  chartBenefit.data.datasets[0].skipLegend     = skipLegend;
  chartBenefit.data.datasets[1].skipLegend     = skipLegend;  // SoC also hidden — median is only treatment entry
  chartSafety.data.datasets[0].skipLegend      = skipLegend;
  chartSafetyEvent.data.datasets[0].skipLegend = skipLegend;
  chartSafetyEvent.data.datasets[1].skipLegend = skipLegend;

  // Helper: build [{x, y}] from a percentile profile array
  const toXY = (xs, arr) => xs.map((x, i) => ({ x, y: arr[i] }));

  // Helper: set the 3 population ribbon datasets (p5, p95, median) starting at `base`.
  // Uses hidden=true/false for guaranteed clearing — setting data:[] alone is not
  // always enough to suppress Chart.js fill rendering on the previous frame.
  function setPopRibbons(chart, base, xs, pcts) {
    const on = pcts !== null;
    if (on) {
      chart.data.datasets[base + 0].data = toXY(xs, pcts.p5);
      chart.data.datasets[base + 1].data = toXY(xs, pcts.p95);
      chart.data.datasets[base + 2].data = toXY(xs, pcts.p50);
    } else {
      for (let k = 0; k < 3; k++) chart.data.datasets[base + k].data = [];
    }
    for (let k = 0; k < 3; k++) chart.data.datasets[base + k].hidden = !on;
  }

  // ── Concentration ──────────────────────────────────────────────────────────
  setXAxis(chartConc, xCfg);
  chartConc.options.scales.y.max = niceYMax(src.concYMax);
  chartConc.data.datasets[0].data = xVals.map((x, i) => ({ x, y: src.conc[i] }));
  chartConc.data.datasets[1].data = obsData ? obsData.concObs : [];
  setPopRibbons(chartConc, 2, popX || [], pop ? pop.conc : null);
  chartConc.update('none');

  // ── Biomarker ──────────────────────────────────────────────────────────────
  setXAxis(chartBiomarker, xCfg);
  chartBiomarker.data.datasets[0].data = xVals.map((x, i) => ({ x, y: src.biomarker[i] }));
  chartBiomarker.data.datasets[1].data = [{ x: 0, y: 100 }, { x: xEnd, y: 100 }];
  chartBiomarker.data.datasets[2].data = obsData ? obsData.biomarkerObs : [];
  setPopRibbons(chartBiomarker, 3, popX || [], pop ? pop.biomarker : null);
  chartBiomarker.update('none');

  // ── Benefit survival (treatment vs SoC) + KM step functions ───────────────
  setXAxis(chartBenefit, xCfg);
  chartBenefit.data.datasets[0].data = xVals.map((x, i) => ({ x, y: src.benefitSurvival[i] }));
  chartBenefit.data.datasets[1].data = xVals.map((x, i) => ({ x, y: src.socBenefitSurvival[i] }));
  chartBenefit.data.datasets[2].data = obsData ? obsData.benefitKM    : [];
  chartBenefit.data.datasets[3].data = obsData ? obsData.socBenefitKM : [];
  chartBenefit.data.datasets[4].data = [{ x: 0, y: 100 }, { x: xEnd, y: 100 }];
  setPopRibbons(chartBenefit, 5, popX || [], pop ? pop.benefit : null);
  chartBenefit.update('none');

  // ── Safety Biomarker (increase above baseline: S − 100) ───────────────────
  setXAxis(chartSafety, xCfg);
  chartSafety.data.datasets[0].data = xVals.map((x, i) => ({ x, y: src.safety[i] - 100 }));
  chartSafety.data.datasets[1].data = obsData ? obsData.safetyObs : [];
  setPopRibbons(chartSafety, 2, popX || [], pop ? pop.safety : null);
  chartSafety.update('none');

  // ── Cumulative safety events: 100 − survival + KM step functions ──────────
  setXAxis(chartSafetyEvent, xCfg);
  chartSafetyEvent.data.datasets[0].data = xVals.map((x, i) => ({ x, y: 100 - src.safetyEventSurvival[i] }));
  chartSafetyEvent.data.datasets[1].data = xVals.map((x, i) => ({ x, y: 100 - src.socSafetySurvival[i] }));
  chartSafetyEvent.data.datasets[2].data = obsData ? obsData.safetyKM    : [];
  chartSafetyEvent.data.datasets[3].data = obsData ? obsData.socSafetyKM : [];
  setPopRibbons(chartSafetyEvent, 4, popX || [], pop ? pop.safetyEvent : null);
  chartSafetyEvent.update('none');
}
