# orbIC: A Multidimensional Chemical Space Navigation Platform

https://github.com/user-attachments/assets/2225c4f7-13af-411c-88dc-603c47f8f59a


## Technical Overview
`orbIC` is an open-source analytical framework designed to facilitate hit-to-lead and lead optimization phases in drug discovery. By leveraging force-directed graph algorithms and high-dimensional data mapping, the platform translates complex Structure-Activity Relationship (SAR) data into a navigable, "celestial" coordinate system.

The core objective is to move beyond traditional two-dimensional heatmaps and spreadsheets. `orbIC` utilizes radial layouts—where the $IC_{50}$ or $EC_{50}$ serves as the gravitational anchor—to help researchers visually identify potency trends and structural clusters within vast molecular libraries.

## Scientific Inspiration and Methodology
The architecture of `orbIC` is informed by contemporary research in chemical space visualization and molecular network analysis:

* **Constellation Mapping:** Inspired by the work of **Heikamp and Bajorath (2019)**, the platform utilizes the concept of "Chemical Space Networks" (CSNs). In this model, molecules are represented as nodes (stars) and structural similarities are represented as edges (constellations). This allows for the rapid identification of SAR transfer and "activity cliffs" where minor structural changes lead to significant potency shifts.
    * *Source:* [Frontiers in Chemistry: Chemical Space Networks](https://www.frontiersin.org/journals/chemistry/articles/10.3389/fchem.2019.00510/full)
* **Multidimensional Projections:** The platform integrates dimensionality reduction techniques such as t-SNE and UMAP, as discussed by **Czarnecki et al. (2020)**. These methods allow for the projection of high-dimensional molecular descriptors into a 3D environment that maintains the global and local relationships between lead candidates.
    * *Source:* [Journal of Cheminformatics: Benchmarking of Dimensionality Reduction](https://link.springer.com/article/10.1186/s13321-020-0416-x)

## Core Capabilities
* **Potency-Driven Coordinates:** Nodes are rendered with luminance and scale proportional to their $IC_{50}$ or $EC_{50}$ values. Potent "hits" act as primary light sources within the dark-mode interface.
* **Structural Clustering:** Automated clustering based on Tanimoto coefficients and ECFP4 fingerprints to visualize scaffold density and diversity.
* **Lead-Orbit Dynamics:** A specialized view for lead optimization that centers a parent molecule and visualizes all derivatives as orbiting satellites, clearly indicating changes in activity relative to structural modifications.
* **Open-Source Integration:** Built on a modular stack including RDKit (via WebAssembly), D3.js, and React to ensure compatibility with existing laboratory workflows and proprietary databases.

## System Architecture and Branding
The interface is designed for high-end research environments, prioritizing clarity and reduced visual fatigue:

* **Primary Palette:** Obsidian background (`#0B0E14`) with high-luminance Cyan (`#00F5FF`) and Ultraviolet (`#7000FF`) accents for data stratification.
* **Typography:** Space Grotesk for interface navigation; JetBrains Mono for chemical strings and numerical metrics.
* **Iconography:** Utilizes the Lucide and Phosphor open-source libraries (MIT/ISC Licenses) for streamlined, low-noise UI elements.

## Deployment
```bash
git clone https://github.com/username/orbIC.git
cd orbIC
npm install
npm run start
```

---

## Performance Notes

### Discovery: Why large datasets crashed the browser

When loading a ~4,000-compound dataset (e.g. PXR Challenge Train Split), the browser would freeze with "Wait or terminate."  Three compounding causes were identified:

**1. Synchronous OCL processing on the main thread**  
`parseCsvToCompounds` ran OpenChemLib 5–6 times per compound (SMILES parse, fingerprint, scaffold, MW/Formula, LogP/PSA) all inside a single synchronous `Papa.parse` callback. For 4,139 compounds that's ~25,000 blocking OCL calls with no opportunity for the browser to repaint or respond to input.

**2. O(n²) scaffold graph construction in TMap**  
After import, `TMap.graphData` ran a substructure check (`OCL.SSSearcher`) and a k-NN similarity pass for every pair of scaffolds — `O(scaffolds²)` more OCL calls immediately after the first freeze.

**3. No row limit on the bundled PXR dataset**  
The remote PXR loader used `limit: 200`; the local bundled one didn't. All 4,139 rows were handed to the synchronous path.

### Fixes applied (current codebase)

| Fix | Where | What it does |
|-----|-------|-------------|
| **A — fallback row cap** | `datasetService.ts` | CSV slow-path defaults to 200 rows when no limit is given |
| **B — chunked async OCL** | `datasetService.ts` | Processes 50 rows per tick with `setTimeout(0)` between chunks; shows "Processing N / total" in the import dialog |
| **C — TMap scaffold cap** | `TMap.tsx` | Keeps the 150 highest-membership scaffolds for graph construction; prevents O(n²) lock-up |
| **E — precomputed sidecar** | `datasetService.ts` + `scripts/precompute-datasets.ts` | Bundled datasets ship with a `.precomputed.json` sidecar (scaffold, 16-element OCL fragment index, MW, LogP, PSA). Loader checks for the sidecar first — no OCL at runtime, near-instant load |
| **F — remove substructure pass from TMap** | `TMap.tsx` | Eliminated the O(n²) `OCL.SSSearcher` loop (22,350 calls at 150 scaffolds) that ran synchronously after every import. kNN Tanimoto edges alone produce an equivalent MST — structurally related scaffolds score high similarity and remain adjacent. Saves 2–10 s of main-thread freeze. |
| **G — O(1) compound lookup in TMap** | `TMap.tsx` | Replaced `compounds.find()` inside `graphData` with a pre-built `Map<id, Compound>`. Eliminates ~17 M string comparisons per import (150 scaffolds × avg 27 members × 4,139 linear scan). |
| **H — similarity queryFp hoisted** | `App.tsx` | `processSmiles(similarityQuery)` was called inside the per-compound filter callback, parsing the query SMILES 4,139 times per slider move. Moved to its own `useMemo` so it runs once per query change. |
| **I — dialog closes before import** | `ImportDialog.tsx` | `handleConfirm` previously called `onImport(...)` then `handleOpenChange(false)`. React ran every `useMemo` (including `TMap.graphData` with its 22k OCL calls) synchronously before committing `open=false`, so the dialog appeared frozen for several seconds. Fix: call `handleOpenChange(false)` first, then defer `onImport` to `setTimeout(0)` so the dialog is visually dismissed before the heavy render begins. |

Additionally, the OCL fingerprint call was corrected from the non-existent `mol.getFingerprint()` to `mol.getIndex()`, which returns OCL's 16-element Int32Array fragment index used for Tanimoto similarity.

### Why `detectNumericCols` is slow (known, not yet fixed)

When a bundled dataset loads via the precomputed sidecar, `detectNumericCols` still scans all 4,139 compounds on the main thread to build the column list for the filter-select dialog step. This is pure CPU time — no OCL involved — and produces a visible ~0.5 s pause before the filter picker appears. It is not avoidable without moving the work to a Web Worker (see fix D below).

### Running the precompute script

When adding or updating a bundled dataset, regenerate its sidecar:

```bash
npm run precompute
```

The script (`scripts/precompute-datasets.ts`) reads every CSV listed in its `DATASETS` array and writes `<name>.precomputed.json` alongside it in `public/data/`. Add new dataset filenames to the array as needed.

### Next steps (not yet implemented)

**D — Web Worker for chemistry**  
Move all OCL computation into a `Worker`. The main thread posts SMILES strings; the worker returns `{scaffold, fingerprint, properties}` objects. This is the correct long-term fix: the UI stays fully interactive during large imports and `detectNumericCols` can also be offloaded. Planned for a separate branch.

**Incremental TMap updates**  
Currently re-building the full D3 force simulation whenever `compounds` changes. For large datasets, compute the MST once (on import) and only recolor nodes when filters change, rather than re-running the simulation.

**Pre-built fingerprint index**  
For very large libraries (>10k compounds), the similarity search on every keystroke in SMARTS/similarity mode scans all fingerprints linearly. A locality-sensitive hashing (LSH) index could make this sub-linear.

## License
`orbIC` is released under the MIT License. It is intended for use in both academic research and commercial pharmaceutical development to advance the transparency and efficiency of molecular discovery.
