/**
 * app.js — UI controller
 *
 * Reads controls, calls runSimulation(), calls updateCharts().
 * All three charts are always visible; the toggle switches the time horizon.
 */

'use strict';

let currentView   = 'short';  // 'short' | 'long'
let debounceTimer = null;

function readParams() {
  return {
    dose:         parseFloat(document.getElementById('doseSlider').value),
    intervalDays: parseFloat(document.getElementById('freqSelect').value),
  };
}

function syncToggle() {
  document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === currentView);
  });
  const suffix = currentView === 'short' ? '0\u201314 days' : '0\u20136 months';
  document.getElementById('labelConc').textContent      = `vs. Time (${suffix})`;
  document.getElementById('labelBiomarker').textContent = `vs. Time (${suffix})`;
  document.getElementById('labelBenefit').textContent   = `vs. Time (${suffix})`;
}

function refresh() {
  updateCharts(runSimulation(readParams()), currentView);
}

function debouncedRefresh() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(refresh, 30);
}

function init() {
  initCharts();

  const doseSlider = document.getElementById('doseSlider');
  const doseLabel  = document.getElementById('doseLabel');

  doseSlider.addEventListener('input', () => {
    doseLabel.textContent = parseFloat(doseSlider.value).toFixed(1);
    debouncedRefresh();
  });

  document.getElementById('freqSelect').addEventListener('change', refresh);

  document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.view === currentView) return;
      currentView = btn.dataset.view;
      syncToggle();
      refresh();
    });
  });

  syncToggle();
  refresh();
}

document.addEventListener('DOMContentLoaded', init);
