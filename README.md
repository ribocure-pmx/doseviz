# DoseViz

An interactive, browser-based tool for visualizing the pharmacokinetic/pharmacodynamic (PK/PD) chain in drug development education.

**Live:** [https://ribocure-pmx.github.io/doseviz/](https://ribocure-pmx.github.io/doseviz/)

## What It Does

Students adjust dose and dosing frequency to observe:

- **Short-term (14 days):** Drug concentration accumulation and biomarker suppression
- **Long-term (6 months):** Delayed clinical benefit driven by sustained biomarker suppression

The tool visualizes the conceptual cascade:  
`Dose → Concentration (PK) → Biomarker (PD) → Clinical Benefit`

## Running Locally

```bash
python3 -m http.server 8080
```

Then open [http://localhost:8080](http://localhost:8080).

## Deploying to GitHub Pages

1. Push to the `main` branch
2. Go to repo **Settings → Pages**
3. Set Source: **Deploy from branch → main → / (root)**
4. The site will be live at `https://<username>.github.io/<repo>/`

## Tech Stack

- Plain HTML, CSS, JavaScript — no build step
- [Chart.js v4](https://www.chartjs.org/) via CDN

## Model

One-compartment PK model with first-order absorption, indirect response PD model (kin inhibition), and a first-order clinical benefit accumulation driven by biomarker suppression. See [CLAUDE.md](CLAUDE.md) for full parameter documentation.

## License

Copyright &copy; 2026 Sebastian Ueckert, Ribocure Pharmaceuticals AB

Licensed under [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).

You are free to share and adapt this work for any purpose, provided you give appropriate credit to **Sebastian Ueckert** and **Ribocure Pharmaceuticals AB** and link back to the original.
