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

// ─── Inter-individual variability (IIV) for population simulation ─────────────
// ω values are lognormal standard deviations (log-scale SD).
// Emax, n_safety, and Emax_safety are kept fixed (structural / identifiability).
const IIV = {
  ka:          0.45,  // ~46 % CV
  CL:          0.35,  // ~36 % CV
  V:           0.25,  // ~25 % CV
  EC50:        0.50,  // ~52 % CV — PD typically more variable than PK
  kout:        0.30,  // ~30 % CV
  kbenefit:    0.40,  // ~41 % CV
  kout_safety: 0.30,  // ~30 % CV
  EC50_safety: 0.50,  // ~52 % CV
};

// ─── Dose slider ceiling (used to fix the concentration y-axis) ───────────────
const MAX_DOSE = 10;  // mg — must match the slider's max attribute in index.html

// ─── Observed-data simulation parameters ─────────────────────────────────────
const OBS_CONC_CV        = 0.30;  // lognormal CV for PK observations
const OBS_PD_CV          = 0.10;  // proportional CV for PD/safety observations
const N_KM_PATIENTS      = 50;    // patients simulated per arm for KM curves
// Sparse clinical sampling schedules (times in days)
const OBS_TIMES_SHORT_PK = [0, 0.042, 0.083, 0.167, 0.25, 0.5, 1, 2, 3, 5, 7, 10, 14];
const OBS_TIMES_LONG_PK  = [0, 7, 14, 28, 42, 56, 84, 112, 140, 168];
const OBS_TIMES_SHORT_PD = [0, 0.5, 1, 2, 3, 5, 7, 10, 14];
const OBS_TIMES_LONG_PD  = [0, 7, 14, 28, 42, 56, 84, 112, 140, 168];

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
 * Core ODE integration for one parameter set.
 * Called by runSimulation() (with PARAMS) and by runPopulationSimulation()
 * (with sampled individual parameters).
 *
 * @param {number} dose         — mg per administration
 * @param {number} intervalDays — dosing interval (days)
 * @param {Object} p            — model parameter object (same shape as PARAMS)
 * @returns {Object} — same shape as runSimulation()
 */
function _runSim(dose, intervalDays, p) {

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

/**
 * Public entry point — runs the typical-patient simulation using fixed PARAMS.
 *
 * @param {Object} userParams
 * @param {number} userParams.dose          — mg per administration (default 1)
 * @param {number} userParams.intervalDays  — dosing interval in days (default 1)
 */
function runSimulation({ dose = 1, intervalDays = 1 } = {}) {
  return _runSim(dose, intervalDays, PARAMS);
}

// ─── Observed data generation ─────────────────────────────────────────────────

/** Box-Muller standard normal sample. Guards against log(0). */
function randNormal() {
  let u1;
  do { u1 = Math.random(); } while (u1 === 0);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * Math.random());
}

/**
 * Sample a set of individual parameters from the population IIV distribution.
 * Uses bias-corrected lognormal: P_i = P_typical × exp(η·ω − ω²/2)
 * so that E[P_i] = P_typical (mean-preserving).
 */
function sampleIndividualParams() {
  const eta = (omega) => Math.exp(randNormal() * omega - 0.5 * omega * omega);
  return {
    ...PARAMS,
    ka:          PARAMS.ka          * eta(IIV.ka),
    CL:          PARAMS.CL          * eta(IIV.CL),
    V:           PARAMS.V           * eta(IIV.V),
    EC50:        PARAMS.EC50        * eta(IIV.EC50),
    kout:        PARAMS.kout        * eta(IIV.kout),
    kbenefit:    PARAMS.kbenefit    * eta(IIV.kbenefit),
    kout_safety: PARAMS.kout_safety * eta(IIV.kout_safety),
    EC50_safety: PARAMS.EC50_safety * eta(IIV.EC50_safety),
  };
}

/**
 * Linear interpolation for a quantile from a sorted Float64Array.
 * @param {Float64Array} sorted — must be sorted ascending
 * @param {number}       q      — quantile in [0, 1]
 */
function pctile(sorted, q) {
  const n = sorted.length;
  const idx = q * (n - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo]);
}

/**
 * Compute 5th, 10th, 50th, 90th, 95th percentile profiles across a population.
 *
 * @param {Array<number[]>} matrix — matrix[individual][timepoint]
 * @returns {{ p5, p10, p50, p90, p95 }} — each an ordinary number[]
 */
function computePopPercentiles(matrix) {
  const T   = matrix[0].length;
  const N   = matrix.length;
  const p5  = new Array(T);
  const p10 = new Array(T);
  const p50 = new Array(T);
  const p90 = new Array(T);
  const p95 = new Array(T);
  const col = new Float64Array(N);   // reusable typed buffer — sorts numerically

  for (let t = 0; t < T; t++) {
    for (let i = 0; i < N; i++) col[i] = matrix[i][t];
    col.sort();
    p5[t]  = pctile(col, 0.05);
    p10[t] = pctile(col, 0.10);
    p50[t] = pctile(col, 0.50);
    p90[t] = pctile(col, 0.90);
    p95[t] = pctile(col, 0.95);
  }
  return { p5, p10, p50, p90, p95 };
}

/** Binary-search linear interpolation on a strictly-increasing times array. */
function lerpAt(times, values, t) {
  const n = times.length;
  if (t <= times[0])     return values[0];
  if (t >= times[n - 1]) return values[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid; else hi = mid;
  }
  const frac = (t - times[lo]) / (times[hi] - times[lo]);
  return values[lo] + frac * (values[hi] - values[lo]);
}

/**
 * Sample N event times from a survival curve via inverse CDF.
 * survivalPct: 0–100 % scale, parallel to times.
 * Returns N event times in days; value === endDay means censored at study end.
 */
function sampleEventTimes(times, survivalPct, N, endDay) {
  const result = [];
  for (let i = 0; i < N; i++) {
    const u = Math.random();
    let eventDay = endDay; // censored by default
    for (let j = 1; j < times.length; j++) {
      if (survivalPct[j] / 100 <= u) {
        const s0 = survivalPct[j - 1] / 100, s1 = survivalPct[j] / 100;
        const frac = (u - s0) / (s1 - s0);
        eventDay = times[j - 1] + frac * (times[j] - times[j - 1]);
        break;
      }
    }
    result.push(eventDay);
  }
  return result;
}

/**
 * Compute a Kaplan-Meier step-function from event times.
 * censorTime: administrative end-of-study time (all t >= censorTime are censored).
 * toX: converts days → chart x-axis units.
 * survival=true  → KM survival %  (starts 100, decreases)
 * survival=false → cumulative events % (starts 0, increases; = 100 - KM %)
 * Returns [{x, y}] for Chart.js with stepped: 'after'.
 */
function computeKM(eventTimes, censorTime, toX, survival) {
  const N = eventTimes.length;
  const events = eventTimes.filter(t => t < censorTime - 1e-9).sort((a, b) => a - b);

  const pts = [{ x: toX(0), y: survival ? 100 : 0 }];
  let km = 1.0;
  let atRisk = N;
  let i = 0;

  while (i < events.length) {
    const t = events[i];
    let d = 0;
    while (i < events.length && events[i] < t + 1e-9) { d++; i++; }
    km *= (1 - d / atRisk);
    atRisk -= d;
    pts.push({ x: toX(t), y: survival ? km * 100 : (1 - km) * 100 });
  }

  // Extend flat tail to end of chart
  const lastX = toX(censorTime);
  if (pts[pts.length - 1].x < lastX) {
    pts.push({ x: lastX, y: pts[pts.length - 1].y });
  }
  return pts;
}

/**
 * Generate sparse noisy "observed data" and Kaplan-Meier curves from a simulation result.
 *
 * @param {Object} simResult — return value of runSimulation()
 * @param {string} view      — 'short' | 'long'
 * @returns {{ concObs, biomarkerObs, safetyObs, benefitKM, socBenefitKM, safetyKM, socSafetyKM }}
 */
function generateObservedData(simResult, view) {
  const isShort   = view === 'short';
  const src       = isShort ? simResult.shortTerm : simResult.longTerm;
  const pkTimes   = isShort ? OBS_TIMES_SHORT_PK : OBS_TIMES_LONG_PK;
  const pdTimes   = isShort ? OBS_TIMES_SHORT_PD : OBS_TIMES_LONG_PD;
  const endDay    = isShort ? 14 : 180;
  const sigmaConc = Math.sqrt(Math.log(1 + OBS_CONC_CV * OBS_CONC_CV));
  const toX       = isShort ? (d => d) : (d => +(d / 30).toFixed(4));

  // ── Concentration: lognormal noise; skip t=0 (true value = 0 before absorption) ──
  const concObs = [];
  for (const tDay of pkTimes) {
    const trueVal = lerpAt(src.times, src.conc, tDay);
    if (trueVal <= 0) continue;
    const obs = trueVal * Math.exp(sigmaConc * randNormal() - 0.5 * sigmaConc * sigmaConc);
    if (obs > 0) concObs.push({ x: toX(tDay), y: obs });
  }

  // ── Biomarker: proportional normal noise, clamp >= 0 ──────────────────────
  const biomarkerObs = [];
  for (const tDay of pdTimes) {
    const trueVal = lerpAt(src.times, src.biomarker, tDay);
    const obs = trueVal * (1 + OBS_PD_CV * randNormal());
    if (obs >= 0) biomarkerObs.push({ x: toX(tDay), y: obs });
  }

  // ── Safety biomarker: noise on raw level, shift to increase above baseline ─
  const safetyObs = [];
  for (const tDay of pdTimes) {
    const trueLevel = lerpAt(src.times, src.safety, tDay);
    const obsLevel  = trueLevel * (1 + OBS_PD_CV * randNormal());
    const obsIncrease = obsLevel - 100;
    if (obsIncrease >= 0) safetyObs.push({ x: toX(tDay), y: obsIncrease });
  }

  // ── KM curves: simulate N patients per arm via inverse CDF ────────────────
  const benTrtTimes  = sampleEventTimes(src.times, src.benefitSurvival,     N_KM_PATIENTS, endDay);
  const benSocTimes  = sampleEventTimes(src.times, src.socBenefitSurvival,  N_KM_PATIENTS, endDay);
  const safTrtTimes  = sampleEventTimes(src.times, src.safetyEventSurvival, N_KM_PATIENTS, endDay);
  const safSocTimes  = sampleEventTimes(src.times, src.socSafetySurvival,   N_KM_PATIENTS, endDay);

  return {
    concObs,
    biomarkerObs,
    safetyObs,
    benefitKM:    computeKM(benTrtTimes, endDay, toX, true),   // event-free survival %
    socBenefitKM: computeKM(benSocTimes, endDay, toX, true),
    safetyKM:     computeKM(safTrtTimes, endDay, toX, false),  // cumulative events %
    socSafetyKM:  computeKM(safSocTimes, endDay, toX, false),
  };
}

// ─── Population simulation ────────────────────────────────────────────────────

/**
 * Simulate a population of N individuals with log-normally distributed PK/PD
 * parameters and return percentile profiles for ribbon visualisation.
 *
 * Results are computed once and should be cached by the caller when parameters
 * have not changed.
 *
 * @param {Object} opts
 * @param {number} opts.dose          — mg per administration (default 1)
 * @param {number} opts.intervalDays  — dosing interval in days (default 1)
 * @param {number} opts.N             — number of simulated individuals (default 100)
 *
 * @returns {Object}
 *   shortTerm / longTerm — each contains:
 *     times        {number[]}
 *     conc         {{ p5, p10, p50, p90, p95 }}   mg/L
 *     biomarker    {{ p5, p10, p50, p90, p95 }}   %
 *     benefit      {{ p5, p10, p50, p90, p95 }}   event-free survival %
 *     safety       {{ p5, p10, p50, p90, p95 }}   increase above baseline %
 *     safetyEvent  {{ p5, p10, p50, p90, p95 }}   cumulative events %
 */
function runPopulationSimulation({ dose = 1, intervalDays = 1, N = 100 } = {}) {
  const sConc      = [], sBio  = [], sBen  = [], sSaf  = [], sSafEv = [];
  const lConc      = [], lBio  = [], lBen  = [], lSaf  = [], lSafEv = [];
  let shortTimes, longTimes;

  for (let i = 0; i < N; i++) {
    const p = sampleIndividualParams();
    const r = _runSim(dose, intervalDays, p);

    if (i === 0) {
      shortTimes = r.shortTerm.times;
      longTimes  = r.longTerm.times;
    }

    // Short-term arrays — apply display transforms in advance so percentiles
    // are computed on the values that will actually be charted.
    sConc.push(r.shortTerm.conc);
    sBio.push(r.shortTerm.biomarker);
    sBen.push(r.shortTerm.benefitSurvival);
    sSaf.push(r.shortTerm.safety.map(s => Math.max(0, s - 100)));
    sSafEv.push(r.shortTerm.safetyEventSurvival.map(s => 100 - s));

    // Long-term arrays
    lConc.push(r.longTerm.conc);
    lBio.push(r.longTerm.biomarker);
    lBen.push(r.longTerm.benefitSurvival);
    lSaf.push(r.longTerm.safety.map(s => Math.max(0, s - 100)));
    lSafEv.push(r.longTerm.safetyEventSurvival.map(s => 100 - s));
  }

  return {
    shortTerm: {
      times:       shortTimes,
      conc:        computePopPercentiles(sConc),
      biomarker:   computePopPercentiles(sBio),
      benefit:     computePopPercentiles(sBen),
      safety:      computePopPercentiles(sSaf),
      safetyEvent: computePopPercentiles(sSafEv),
    },
    longTerm: {
      times:       longTimes,
      conc:        computePopPercentiles(lConc),
      biomarker:   computePopPercentiles(lBio),
      benefit:     computePopPercentiles(lBen),
      safety:      computePopPercentiles(lSaf),
      safetyEvent: computePopPercentiles(lSafEv),
    },
  };
}
