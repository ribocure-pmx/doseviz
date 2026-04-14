/**
 * app.js — UI controller
 *
 * Reads controls, calls runSimulation(), calls updateCharts().
 * All three charts are always visible; the toggle switches the time horizon.
 */

'use strict';

const EXPORT_MODE = new URLSearchParams(window.location.search).has('export');

let currentView      = 'short';  // 'short' | 'long'
let debounceTimer    = null;
let showObservedData = false;

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
  document.getElementById('labelConc').textContent        = `vs. Time (${suffix})`;
  document.getElementById('labelBiomarker').textContent   = `vs. Time (${suffix})`;
  document.getElementById('labelBenefit').textContent     = `vs. Time (${suffix})`;
  document.getElementById('labelSafety').textContent      = `vs. Time (${suffix})`;
  document.getElementById('labelSafetyEvent').textContent = `vs. Time (${suffix})`;
}

function refresh() {
  const simResult = runSimulation(readParams());
  const obsData   = showObservedData ? generateObservedData(simResult, currentView) : null;
  updateCharts(simResult, currentView, obsData);
}

function debouncedRefresh() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(refresh, 30);
}

function init() {
  if (EXPORT_MODE) document.body.classList.add('export-mode');
  initCharts(EXPORT_MODE);

  const doseSlider = document.getElementById('doseSlider');
  const doseLabel  = document.getElementById('doseLabel');

  doseSlider.addEventListener('input', () => {
    doseLabel.textContent = parseFloat(doseSlider.value).toFixed(1);
    debouncedRefresh();
  });

  document.getElementById('freqSelect').addEventListener('change', refresh);

  document.getElementById('observedDataToggle').addEventListener('change', function () {
    showObservedData = this.checked;
    refresh();
  });

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

  if (EXPORT_MODE) {
    document.querySelectorAll('.chart-card').forEach(card => {
      const canvas = card.querySelector('canvas');
      const title  = card.querySelector('h3').textContent.trim().replace(/\s+/g, '_');
      const btn    = document.createElement('button');
      btn.className   = 'save-png-btn';
      btn.textContent = 'Save PNG';
      btn.addEventListener('click', () => {
        const link    = document.createElement('a');
        link.download = title + '.png';
        link.href     = canvas.toDataURL('image/png');
        link.click();
      });
      card.appendChild(btn);
    });
  }
}

document.addEventListener('DOMContentLoaded', init);
