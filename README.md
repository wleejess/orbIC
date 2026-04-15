# orbIC: A Multidimensional Chemical Space Navigation Platform

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

## License
`orbIC` is released under the MIT License. It is intended for use in both academic research and commercial pharmaceutical development to advance the transparency and efficiency of molecular discovery.
