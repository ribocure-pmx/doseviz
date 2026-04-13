/**
 * simulation.js — PK/PD/Benefit/Safety ODE engine
 *
 * Model summary (all time in days):
 *   PK:     one-compartment, first-order absorption
 *   PD:     indirect response model, kin inhibition by Emax model
 *   BEN:    first-order benefit accumulation driven by biomarker suppression
 *   SAFETY: indirect response model, kout inhibition — S rises above baseline
 *
 * State vector: [A_depot, C, R, B, S]
 *   A_depot  — amount of drug in absorption depot (mg)
 *   C        — plasma concentration (mg/L)
 *   R        — efficacy biomarker level (%)
 *   B        — clinical benefit fraction [0,1]
 *   S        — safety biomarker level (%, baseline = 100)
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

  // Safety biomarker (kout inhibition — S rises above baseline with drug)
  kout_safety:  0.05,  // turnover rate out (day⁻¹)  [t½ ~ 14 days]
  EC50_safety:  0.3,   // concentration at 50% Emax (mg/L)  [7.5× efficacy EC50]
  n_safety:     3,     // Hill coefficient (sigmoidal response)
  Emax_safety:  1.0,   // maximum inhibition of kout
};

// ─── Dose slider ceiling (used to fix the concentration y-axis) ───────────────
const MAX_DOSE = 10;  // mg — must match the slider's max attribute in index.html

// ─── Survival hazard constants ────────────────────────────────────────────────

const LAMBDA_BENEFIT_SOC  = 0.006;  // day⁻¹  background progression hazard (SoC)
const LAMBDA_SAFETY_BASE  = 0.002;  // day⁻¹  background safety-event hazard (SoC)
const LAMBDA_SAFETY_EXTRA = 0.006;  // day⁻¹  extra safety hazard per unit fractional biomarker rise

// ─── ODE definition ───────────────────────────────────────────────────────────

/**
 * Compute derivatives for the state vector at a given time.
 * @param {number[]} y  — [A_depot, C, R, B, S]
 * @param {Object}   p  — model parameters
 * @returns {number[]} dydt
 */
function derivatives(y, p) {
  const [A_depot, C, R, B, S] = y;
  const ke  = p.CL / p.V;
  const kin = p.kout * 100;  // so that R baseline = kin/kout = 100

  const inhibition = (p.Emax * Math.max(0, C)) / (p.EC50 + Math.max(0, C));
  const suppression = Math.max(0, (100 - R) / 100);  // efficacy suppression fraction

  // Safety biomarker: kout inhibition with sigmoidal Hill (n=3)
  const Csafe  = Math.max(0, C);
  const Cn     = Csafe * Csafe * Csafe;                       // C^n_safety (n=3)
  const EC50n  = p.EC50_safety * p.EC50_safety * p.EC50_safety;
  const inh_s  = p.Emax_safety * Cn / (EC50n + Cn);
  const kin_s  = p.kout_safety * 100;                        // so that S baseline = 100

  return [
    -p.ka * A_depot,
    (p.ka * A_depot) / p.V - ke * C,
    kin * (1 - inhibition) - p.kout * R,
    p.kbenefit * (suppression - B),
    kin_s - p.kout_safety * (1 - inh_s) * Math.max(0, S),
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

// ─── Survival curve post-processor ───────────────────────────────────────────

/**
 * Compute event-free survival curves for treatment and SoC arms.
 *
 * Clinical benefit survival uses a proportional-hazard model:
 *   λ_trt(t)  = LAMBDA_BENEFIT_SOC × (1 − B(t))   [reduced by benefit]
 *   λ_SoC     = LAMBDA_BENEFIT_SOC                 [constant]
 *
 * Safety event survival adds drug-driven hazard from biomarker rise:
 *   λ_saf_trt(t) = LAMBDA_SAFETY_BASE + LAMBDA_SAFETY_EXTRA × max(0, S(t)−100)/100
 *   λ_saf_SoC    = LAMBDA_SAFETY_BASE               [constant]
 *
 * @param {number[]} times   — time points (days)
 * @param {number[]} benefit — clinical benefit (0–100 %)
 * @param {number[]} safety  — safety biomarker level (%, baseline = 100)
 * @returns {{ benefitSurvival, socBenefitSurvival, safetyEventSurvival, socSafetySurvival }}
 *   All arrays in 0–100 % scale.
 */
function computeSurvival(times, benefit, safety) {
  const n = times.length;
  const benefitSurvival      = new Array(n);
  const socBenefitSurvival   = new Array(n);
  const safetyEventSurvival  = new Array(n);
  const socSafetySurvival    = new Array(n);

  benefitSurvival[0]     = 100;
  socBenefitSurvival[0]  = 100;
  safetyEventSurvival[0] = 100;
  socSafetySurvival[0]   = 100;

  let H_ben_trt  = 0;
  let H_ben_soc  = 0;
  let H_saf_trt  = 0;
  let H_saf_soc  = 0;

  for (let i = 1; i < n; i++) {
    const dt = times[i] - times[i - 1];
    const B  = benefit[i - 1] / 100;                           // fraction [0,1]
    const S  = safety[i - 1];

    H_ben_trt += LAMBDA_BENEFIT_SOC * (1 - B) * dt;
    H_ben_soc += LAMBDA_BENEFIT_SOC * dt;
    H_saf_trt += (LAMBDA_SAFETY_BASE + LAMBDA_SAFETY_EXTRA * Math.max(0, S - 100) / 100) * dt;
    H_saf_soc += LAMBDA_SAFETY_BASE * dt;

    benefitSurvival[i]     = 100 * Math.exp(-H_ben_trt);
    socBenefitSurvival[i]  = 100 * Math.exp(-H_ben_soc);
    safetyEventSurvival[i] = 100 * Math.exp(-H_saf_trt);
    socSafetySurvival[i]   = 100 * Math.exp(-H_saf_soc);
  }

  return { benefitSurvival, socBenefitSurvival, safetyEventSurvival, socSafetySurvival };
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

  let y = [0, 0, 100, 0, 100];
  let nextDoseIdx = 0;

  const shortTimes     = [];
  const shortConc      = [];
  const shortBiomarker = [];
  const shortBenefit   = [];
  const shortSafety    = [];

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
  shortSafety.push(100);

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
    shortSafety.push(Math.max(0, y[4]));
  }

  // ── Long-term pass (0–180 days, dt = 0.1 day) ─────────────────────────────
  const dtLong  = 0.1;
  const endLong = 180;
  const doseTimesLong = buildDoseTimes(intervalDays, endLong);

  y = [0, 0, 100, 0, 100];
  nextDoseIdx = 0;

  const longTimes     = [];
  const longConc      = [];
  const longBiomarker = [];
  const longBenefit   = [];
  const longSafety    = [];

  t = 0;
  if (doseTimesLong[nextDoseIdx] <= 1e-9) {
    y[0] += dose;
    nextDoseIdx++;
  }

  longTimes.push(t);
  longConc.push(0);
  longBiomarker.push(100);
  longBenefit.push(0);
  longSafety.push(100);

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
    longSafety.push(Math.max(0, y[4]));
  }

  const shortSurvival = computeSurvival(shortTimes, shortBenefit, shortSafety);
  const longSurvival  = computeSurvival(longTimes,  longBenefit,  longSafety);

  // Scale factor to the maximum slider dose — PK is linear so Cmax scales exactly.
  const scale = MAX_DOSE / dose;
  const shortConcYMax = Math.max(...shortConc) * scale;
  const longConcYMax  = Math.max(...longConc)  * scale;

  return {
    shortTerm: {
      times:                shortTimes,
      conc:                 shortConc,
      concYMax:             shortConcYMax,
      biomarker:            shortBiomarker,
      benefit:              shortBenefit,
      safety:               shortSafety,
      benefitSurvival:      shortSurvival.benefitSurvival,
      socBenefitSurvival:   shortSurvival.socBenefitSurvival,
      safetyEventSurvival:  shortSurvival.safetyEventSurvival,
      socSafetySurvival:    shortSurvival.socSafetySurvival,
    },
    longTerm: {
      times:                longTimes,
      conc:                 longConc,
      concYMax:             longConcYMax,
      biomarker:            longBiomarker,
      benefit:              longBenefit,
      safety:               longSafety,
      benefitSurvival:      longSurvival.benefitSurvival,
      socBenefitSurvival:   longSurvival.socBenefitSurvival,
      safetyEventSurvival:  longSurvival.safetyEventSurvival,
      socSafetySurvival:    longSurvival.socSafetySurvival,
    },
  };
}
