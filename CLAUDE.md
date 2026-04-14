# DoseViz — Educational Pharmacometrics Visualizer

## Project Purpose
An interactive, fully client-side web app that helps students understand the chain:
**Dose → Concentration (PK) → Biomarker (PD) → Clinical Benefit / Safety**

Students manipulate dose and dosing frequency, toggle between a short-term PK/PD view (14 days) and a long-term clinical outcomes view (6 months), and optionally overlay simulated observed data to illustrate measurement noise and Kaplan-Meier curves as they appear in real trials.

Hosted on GitHub Pages. No build step. No backend. Plain HTML/CSS/JS.

---

## Tech Stack
- **HTML/CSS/JavaScript** — no frameworks, no bundler
- **Chart.js v4** — loaded from jsDelivr CDN
- **Deployment** — GitHub Pages (`index.html` at repo root)

---

## File Map
```
index.html          — Page shell, CDN imports, DOM structure
css/style.css       — Layout (desktop grid + mobile stack), controls, schematic
js/simulation.js    — PK/PD/Benefit/Safety ODE solver (RK4); runSimulation() and
                      generateObservedData() (noise sampling + KM simulation)
js/charts.js        — Chart.js init and update; initCharts() / updateCharts()
js/app.js           — Event wiring, debounce, top-level orchestration
```

---

## Math Model

All time in **days**.

### Pharmacokinetics (one-compartment, first-order absorption)
| Parameter | Symbol | Value | Units |
|-----------|--------|-------|-------|
| Absorption rate | ka | 16.636 | day⁻¹  (t½ = 1 h) |
| Clearance | CL | 46.210 | L/day  (t½_elim = 18 h) |
| Volume | V | 50 | L |
| Elimination rate | ke = CL/V | 0.924 | day⁻¹ |

ODEs:
- `dA_depot/dt = -ka * A_depot`
- `dC/dt = (ka * A_depot) / V - ke * C`

### Pharmacodynamics — Efficacy Biomarker (indirect response, kin inhibition)
| Parameter | Symbol | Value | Units |
|-----------|--------|-------|-------|
| Turnover rate out | kout | 0.15 | day⁻¹ |
| Turnover rate in | kin = kout × 100 | 15 | %/day |
| Max inhibition | Emax | 1 | — |
| Half-maximal conc | EC50 | 0.04 | mg/L |

ODE:
- `dR/dt = kin * (1 - Emax*C/(EC50+C)) - kout*R`
- Baseline R₀ = 100 %

### Clinical Benefit (delayed first-order accumulation)
| Parameter | Symbol | Value | Units |
|-----------|--------|-------|-------|
| Benefit rate constant | kbenefit | 0.015 | day⁻¹ |

ODE:
- `suppression = max(0, (100 - R) / 100)`
- `dB/dt = kbenefit * (suppression - B)`
- Displayed as `B × 100 %`

### Pharmacodynamics — Safety Biomarker (indirect response, kout inhibition)
| Parameter | Symbol | Value | Units |
|-----------|--------|-------|-------|
| Turnover rate out | kout_safety | 0.05 | day⁻¹  (t½ ~ 14 days) |
| Max inhibition | Emax_safety | 1 | — |
| Half-maximal conc | EC50_safety | 0.3 | mg/L  (7.5× efficacy EC50) |
| Hill coefficient | n_safety | 3 | — |

ODE:
- `dS/dt = kin_safety * (1 - Emax_safety * Cⁿ / (EC50_safetyⁿ + Cⁿ)) - kout_safety * S`  (kout inhibition → S rises above 100 with drug)
- Baseline S₀ = 100 %; chart shows `S − 100` (increase above baseline)

### Survival Hazard Model
Event-free survival computed via cumulative hazard integration:

**Clinical benefit (disease progression):**
- Treatment: `λ_trt(t) = 0.006 × (1 − B(t))` day⁻¹
- SoC: `λ_SoC = 0.006` day⁻¹ (constant)

**Safety events:**
- Treatment: `λ_saf(t) = 0.002 + 0.006 × max(0, S(t)−100)/100` day⁻¹
- SoC: `λ_saf_SoC = 0.002` day⁻¹ (constant)

Survival: `S(t) = exp(−∫λ dt)`; cumulative events displayed as `100 − S(t) %`.

### ODE Solver
- 4th-order Runge-Kutta
- dt = 0.05 days (short-term), 0.1 days (long-term)
- Doses injected into `A_depot` at each scheduled dosing time
- State vector: `[A_depot, C, R, B, S]`, initial: `[0, 0, 100, 0, 100]`

---

## Observed Data Feature

Toggling **"Show observed data"** overlays simulated clinical trial measurements:

| Chart | Data type | Noise model |
|-------|-----------|-------------|
| Concentration | Sparse scatter points | Lognormal, CV = 30% |
| Biomarker | Sparse scatter points | Proportional normal, CV = 10% |
| Safety Biomarker | Sparse scatter points | Proportional normal, CV = 10% |
| Benefit Survival | KM step-function curves | 50 patients/arm, inverse-CDF sampling |
| Safety Events | KM step-function curves | 50 patients/arm, inverse-CDF sampling |

- **Sparse sampling schedules** mimic real trial designs (hourly PK on Day 1, then trough/weekly visits).
- **KM curves** are simulated by inverse-CDF sampling of the model survival function, then computed with the standard Kaplan-Meier estimator.
- Model prediction curves **dim** (≈20% opacity) when observed data is shown, so data reads as foreground.
- Noise regenerates on each parameter change — intentional, to illustrate measurement variability.

All observed-data logic lives in `js/simulation.js` (`generateObservedData(simResult, view)`).

---

## Running Locally
```bash
# Option 1 — open directly
open index.html

# Option 2 — local server (avoids any file:// CORS issues)
python3 -m http.server 8080
# then visit http://localhost:8080
```

---

## GitHub Pages Deployment
Push to the `main` branch. In repo Settings → Pages, set Source to "Deploy from branch: main / (root)". The site will be available at `https://<username>.github.io/<repo>/`.
