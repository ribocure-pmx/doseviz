/**
 * simulation.js — PK/PD/Benefit ODE engine
 *
 * Model summary (all time in days):
 *   PK:  one-compartment, first-order absorption
 *   PD:  indirect response model, kin inhibition by Emax model
 *   BEN: first-order benefit accumulation driven by biomarker suppression
 *
 * State vector: [A_depot, C, R, B]
 *   A_depot  — amount of drug in absorption depot (mg)
 *   C        — plasma concentration (mg/L)
 *   R        — biomarker level (%)
 *   B        — clinical benefit fraction [0,1]
 */

'use strict';

// ─── Fixed model parameters ───────────────────────────────────────────────────

const PARAMS = {
  // PK  (t½_abs = 1 h → ka = ln2/(1/24); t½_elim = 18 h → ke = ln2/0.75, CL = ke*V)
  ka:   16.636, // absorption rate constant (day⁻¹)  [t½ = 1 h]
  CL:   46.210, // clearance (L/day)                 [t½_elim = 18 h, V=50 L]
  V:    50.0,   // volume of distribution (L)

  // PD
  Emax:  1.0,   // maximum inhibitory effect (dimensionless)
  EC50:  0.04,  // concentration at 50% Emax (mg/L)
  kout:  0.15,  // biomarker turnover rate out (day⁻¹)
  // kin = kout * R0 = 0.15 * 100 = 15 (%/day) — derived

  // Clinical benefit
  kbenefit: 0.015,  // first-order benefit onset rate (day⁻¹)
};

// ─── ODE definition ───────────────────────────────────────────────────────────

/**
 * Compute derivatives for the state vector at a given time.
 * @param {number[]} y  — [A_depot, C, R, B]
 * @param {Object}   p  — model parameters
 * @returns {number[]} dydt
 */
function derivatives(y, p) {
  const [A_depot, C, R, B] = y;
  const ke  = p.CL / p.V;
  const kin = p.kout * 100;  // so that R baseline = kin/kout = 100

  const inhibition = (p.Emax * Math.max(0, C)) / (p.EC50 + Math.max(0, C));
  const S          = Math.max(0, (100 - R) / 100);  // suppression fraction

  return [
    -p.ka * A_depot,
    (p.ka * A_depot) / p.V - ke * C,
    kin * (1 - inhibition) - p.kout * R,
    p.kbenefit * (S - B),
  ];
}

// ─── RK4 step ─────────────────────────────────────────────────────────────────

/**
 * Advance state y by one RK4 step of size dt.
 * @param {number[]} y
 * @param {number}   dt
 * @param {Object}   p
 * @returns {number[]}
 */
function rk4Step(y, dt, p) {
  const k1 = derivatives(y, p);
  const k2 = derivatives(y.map((v, i) => v + 0.5 * dt * k1[i]), p);
  const k3 = derivatives(y.map((v, i) => v + 0.5 * dt * k2[i]), p);
  const k4 = derivatives(y.map((v, i) => v + dt * k3[i]), p);
  return y.map((v, i) => v + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}

// ─── Dose schedule builder ────────────────────────────────────────────────────

/**
 * Build an array of dose times given an interval and simulation end.
 * First dose at t=0.
 */
function buildDoseTimes(intervalDays, endDay) {
  const times = [];
  let t = 0;
  while (t <= endDay + 1e-9) {
    times.push(t);
    t += intervalDays;
  }
  return times;
}

// ─── Main simulation runner ───────────────────────────────────────────────────

/**
 * Run the full simulation and return time-series data for both views.
 *
 * @param {Object} userParams
 * @param {number} userParams.dose          — dose per administration (mg), default 1
 * @param {number} userParams.intervalDays  — dosing interval (days), default 1
 *
 * @returns {Object}
 *   shortTerm: { times, conc, biomarker }   (0–14 days)
 *   longTerm:  { times, benefit }           (0–180 days)
 */
function runSimulation({ dose = 1, intervalDays = 1 } = {}) {
  const p = PARAMS;

  // ── Short-term pass (0–14 days, dt = 0.05 day) ────────────────────────────
  const dtShort  = 0.05;
  const endShort = 14;
  const doseTimes = buildDoseTimes(intervalDays, endShort);

  let y = [0, 0, 100, 0];
  let nextDoseIdx = 0;

  const shortTimes    = [];
  const shortConc     = [];
  const shortBiomarker = [];
  const shortBenefit  = [];

  let t = 0;
  // Apply dose at t=0 before first step
  if (doseTimes[nextDoseIdx] <= 1e-9) {
    y[0] += dose;
    nextDoseIdx++;
  }

  shortTimes.push(t);
  shortConc.push(y[1]);
  shortBiomarker.push(y[2]);
  shortBenefit.push(0);

  while (t < endShort - 1e-9) {
    const tNext = Math.min(t + dtShort, endShort);
    y = rk4Step(y, tNext - t, p);
    t = tNext;

    // Apply any doses that fall within this step's new time
    while (nextDoseIdx < doseTimes.length && doseTimes[nextDoseIdx] <= t + 1e-9) {
      y[0] += dose;
      nextDoseIdx++;
    }

    shortTimes.push(parseFloat(t.toFixed(6)));
    shortConc.push(Math.max(0, y[1]));
    shortBiomarker.push(Math.max(0, y[2]));
    shortBenefit.push(Math.min(100, Math.max(0, y[3] * 100)));
  }

  // ── Long-term pass (0–180 days, dt = 0.1 day) ─────────────────────────────
  const dtLong  = 0.1;
  const endLong = 180;
  const doseTimesLong = buildDoseTimes(intervalDays, endLong);

  y = [0, 0, 100, 0];
  nextDoseIdx = 0;

  const longTimes    = [];
  const longConc     = [];
  const longBiomarker = [];
  const longBenefit  = [];

  t = 0;
  if (doseTimesLong[nextDoseIdx] <= 1e-9) {
    y[0] += dose;
    nextDoseIdx++;
  }

  longTimes.push(t);
  longConc.push(0);
  longBiomarker.push(100);
  longBenefit.push(0);

  while (t < endLong - 1e-9) {
    const tNext = Math.min(t + dtLong, endLong);
    y = rk4Step(y, tNext - t, p);
    t = tNext;

    while (nextDoseIdx < doseTimesLong.length && doseTimesLong[nextDoseIdx] <= t + 1e-9) {
      y[0] += dose;
      nextDoseIdx++;
    }

    longTimes.push(parseFloat(t.toFixed(6)));
    longConc.push(Math.max(0, y[1]));
    longBiomarker.push(Math.max(0, y[2]));
    longBenefit.push(Math.min(100, Math.max(0, y[3] * 100)));
  }

  return {
    shortTerm: {
      times:     shortTimes,
      conc:      shortConc,
      biomarker: shortBiomarker,
      benefit:   shortBenefit,
    },
    longTerm: {
      times:    longTimes,
      conc:     longConc,
      biomarker: longBiomarker,
      benefit:  longBenefit,
    },
  };
}
