# DoseViz — Educational Pharmacometrics Visualizer

## Project Purpose
An interactive, fully client-side web app that helps students understand the chain:
**Dose → Concentration (PK) → Biomarker (PD) → Clinical Benefit**

Intended for use during lectures or self-study. Students manipulate dose and dosing frequency and toggle between a short-term PK/PD view (14 days) and a long-term clinical outcomes view (6 months).

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
js/simulation.js    — PK/PD/Benefit ODE solver (RK4), exports runSimulation()
js/charts.js        — Chart.js init and update, exports initCharts() / updateCharts()
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

### Pharmacodynamics (indirect response, kin inhibition)
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
- `S = max(0, (100 - R) / 100)`   (biomarker suppression fraction)
- `dB/dt = kbenefit * (S - B)`
- Displayed as `B × 100 %`

### ODE Solver
- 4th-order Runge-Kutta
- dt = 0.05 days (short-term), 0.1 days (long-term)
- Doses injected into `A_depot` at each scheduled dosing time
- State vector: `[A_depot, C, R, B]`, initial: `[0, 0, 100, 0]`

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
