### orbIC: A Multidimensional Chemical Space Navigation Platform
**Browser-native hit-to-lead visualization. No installation. No license. No data leaves your browser.**

orbIC translates Structure-Activity Relationship (SAR) data into an interactive force-directed graph — where IC₅₀ or EC₅₀ drives the coordinate system. Potent compounds are rendered as primary light sources; structural clusters emerge as constellations. Built for medicinal chemists and computational researchers who need to move faster than spreadsheets allow.

Renders 4,147 compounds with sub-second interaction via TMAP · MST layout.

---

## Demo

https://github.com/user-attachments/assets/2225c4f7-13af-411c-88dc-603c47f8f59a

---

## Why orbIC

Traditional SAR analysis tools rely on 2D heatmaps and static tables. These are adequate for small datasets but break down at scale — structural trends disappear into rows, activity cliffs go unnoticed, and there's no intuitive way to navigate chemical neighborhoods.

orbIC treats potency as a spatial property:
- IC₅₀ / EC₅₀ maps to luminance and node scale
- Tanimoto similarity (ECFP4 fingerprints) maps to edge proximity
- Scaffold density and diversity are immediately legible as visual clusters

The result is a navigable map of a compound library — not a filtered spreadsheet.

---

## Core Capabilities

- **Potency-driven layout** — nodes rendered with luminance and scale proportional to IC₅₀ / EC₅₀; potent hits act as primary light sources
- **Structural clustering** — automated grouping via Tanimoto coefficients and ECFP4 fingerprints; visualizes scaffold density and diversity
- **Lead-orbit view** — centers a parent molecule and shows all derivatives as orbiting satellites, with activity delta relative to structural changes
- **Zero-dependency runtime** — OpenChemLib compiled to WebAssembly; all chemistry runs client-side, no server calls, no data egress
- **Precomputed sidecar system** — bundled datasets ship with `.precomputed.json` files (scaffold, fragment index, MW, LogP, PSA); near-instant load for standard libraries

---

## Architecture

```
orbIC/
├── src/
│   ├── components/         # React UI — panels, controls, node renderers
│   ├── lib/
│   │   ├── datasetService.ts   # CSV ingestion, chunked async OCL processing
│   │   ├── TMap.tsx            # Force-directed graph, MST construction, scaffold clustering
│   │   └── similarity.ts       # Tanimoto / ECFP4 fingerprint utilities
│   └── App.tsx
├── scripts/
│   └── precompute-datasets.ts  # Offline sidecar generation for bundled datasets
├── public/data/                # Bundled datasets + .precomputed.json sidecars
└── components/ui/              # Shadcn/Radix primitives
```

**Key design decisions:**

- **WebAssembly chemistry (OpenChemLib)** — RDKit in the browser historically required a Python backend or heavy WASM bundle. OpenChemLib provides the critical subset needed (SMILES parsing, ECFP4 fingerprints, substructure search, property calculation) at ~3MB WASM, keeping the tool installable and offline-capable.
- **Chunked async OCL processing** — initial implementation processed all compounds synchronously in `Papa.parse` callbacks, freezing the browser on datasets >500 compounds. Refactored to 50-row chunks with `setTimeout(0)` yielding between chunks; shows live progress during import. (See Performance Notes below.)
- **Precomputed sidecars** — for bundled datasets, all OCL work (scaffold extraction, fragment index, property calculation) runs offline at build time via `npm run precompute`, writing `.precomputed.json` alongside each CSV. At runtime, the loader checks for the sidecar first — no OCL, near-instant load.
- **MST over substructure graph** — eliminated the O(n²) `OCL.SSSearcher` pass from TMap construction (22,350 calls at 150 scaffolds). kNN Tanimoto edges alone produce an equivalent MST; structurally related scaffolds score high similarity and remain adjacent. Saves 2–10s of main-thread freeze per import.

---

## Tech Stack

| Layer | Choice |
|---|---|
| UI | React + TypeScript |
| Visualization | D3.js (force simulation, MST layout) |
| Chemistry | OpenChemLib (WebAssembly) |
| Build | Vite |
| CI | GitHub Actions |

---

## Scientific Inspiration & Methodology

orbIC's layout approach is grounded in two areas of cheminformatics research:

- **Chemical Space Networks (CSNs)** — Heikamp & Bajorath (2019), *Frontiers in Chemistry*. Molecules as nodes, structural similarity as edges; enables rapid identification of SAR transfer and activity cliffs.
- **Dimensionality reduction for molecular descriptors** — Czarnecki et al. (2020), *Journal of Cheminformatics*. t-SNE and UMAP preserve global and local structure when projecting high-dimensional fingerprint space.

---

## Getting Started

```bash
git clone https://github.com/wleejess/orbIC.git
cd orbIC
npm install
npm run start
```

To regenerate precomputed sidecars after adding a new bundled dataset:

```bash
npm run precompute
```

Add the new dataset filename to the `DATASETS` array in `scripts/precompute-datasets.ts` first.

---

## Performance Notes

**The large-dataset freeze problem and how it was fixed.**

Loading ~4,000 compounds initially froze the browser ("Wait or terminate"). Three compounding causes:

1. **Synchronous OCL on the main thread** — ~25,000 blocking calls per import (SMILES parse, fingerprint, scaffold, properties for each compound)
2. **O(n²) scaffold graph in TMap** — substructure check + kNN pass for every scaffold pair immediately after the first freeze
3. **No row cap on bundled dataset loader** — the remote loader used `limit: 200`; the local one didn't

Fixes applied:

| Fix | File | Effect |
|---|---|---|
| Chunked async OCL | `datasetService.ts` | 50 rows/tick with `setTimeout(0)`; progress shown during import |
| Precomputed sidecar | `datasetService.ts` + `scripts/precompute-datasets.ts` | Zero OCL at runtime for bundled datasets |
| Scaffold cap (150) | `TMap.tsx` | Prevents O(n²) lock-up during graph construction |
| Remove substructure pass | `TMap.tsx` | Eliminates 22k synchronous OCL calls; kNN edges sufficient for MST |
| O(1) compound lookup | `TMap.tsx` | Pre-built `Map<id, Compound>` replaces `compounds.find()` — eliminates ~17M string comparisons per import |
| Query fingerprint hoisted | `App.tsx` | `processSmiles(query)` moved to `useMemo`; was running 4,139× per slider move |
| Dialog close before import | `ImportDialog.tsx` | Closes dialog visually first, defers `onImport` to `setTimeout(0)` to prevent frozen-dialog UX |

**Known issue:** `detectNumericCols` still scans all compounds on the main thread (~0.5s pause before the filter picker). Fix requires a Web Worker; tracked as next step.

---

## Roadmap

- **Web Worker for all OCL** — move chemistry off the main thread entirely; UI stays interactive during large imports
- **Incremental TMap updates** — compute MST once on import, recolor on filter changes rather than re-running the full simulation
- **LSH fingerprint index** — sub-linear similarity search for libraries >10k compounds

---

## License

MIT — intended for academic research and commercial pharmaceutical development.
