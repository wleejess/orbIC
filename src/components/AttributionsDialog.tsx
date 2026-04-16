/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Heart, ExternalLink } from 'lucide-react';

interface Attribution {
  name: string;
  description: string;
  url: string;
  license: string;
  citation?: string;
}

const DATA_SOURCES: Attribution[] = [
  {
    name: 'openadmet / PXR Challenge Dataset',
    description:
      'Pregnane X Receptor (PXR) agonism assay data — pEC50 values for 4,139 training compounds. Bundled as a local CSV (train split) and available in full via Hugging Face.',
    url: 'https://huggingface.co/datasets/openadmet/pxr-challenge-train-test',
    license: 'see dataset card',
    citation: 'openadmet/pxr-challenge-train-test, Hugging Face Datasets, 2024.',
  },
  {
    name: 'ChEMBL',
    description:
      'Manually curated bioactivity database of drug-like molecules. Structures and activity values used in the Demo Pharmacology Set and COX Inhibitor SAR Series.',
    url: 'https://www.ebi.ac.uk/chembl/',
    license: 'CC0 1.0 Universal (Public Domain)',
    citation:
      'Mendez D, et al. ChEMBL: towards direct deposition of bioassay data. Nucleic Acids Research, 2019, 47(D1):D930–D940. DOI: 10.1093/nar/gky1075',
  },
  {
    name: 'Mitchell et al. — COX Inhibitor IC₅₀ Values',
    description:
      'Ovine COX-1 enzymatic IC₅₀ measurements for 10 classical NSAIDs under identical assay conditions — the primary data source for the COX Inhibitor SAR Series.',
    url: 'https://doi.org/10.1073/pnas.90.24.11693',
    license: 'published literature (PNAS)',
    citation:
      'Mitchell JA, Akarasereenont P, Thiemermann C, Flower RJ, Vane JR. Selectivity of nonsteroidal antiinflammatory drugs as inhibitors of constitutive and inducible cyclooxygenase. PNAS. 1993;90(24):11693–11697.',
  },
  {
    name: 'Penning et al. — Celecoxib COX-2 IC₅₀',
    description:
      'Original pharmacological characterisation of celecoxib (SC-58635), included as a COX-2-selective contrast compound in the SAR Series.',
    url: 'https://doi.org/10.1021/jm960803q',
    license: 'published literature (J Med Chem)',
    citation:
      'Penning TD, et al. Synthesis and biological evaluation of the 1,5-diarylpyrazole class of cyclooxygenase-2 inhibitors. J Med Chem. 1997;40(9):1347–1365.',
  },
];

const LIBRARIES: Attribution[] = [
  {
    name: 'openchemlib',
    description:
      'Client-side cheminformatics: SMILES parsing, Bemis-Murcko scaffolds, fingerprints, LogP/PSA/MW calculation, and SMARTS substructure search.',
    url: 'https://github.com/cheminfo/openchemlib-js',
    license: 'BSD 3-Clause',
    citation: 'openchemlib v9.22.0',
  },
  {
    name: 'D3.js',
    description:
      'Force-directed graph simulation for the TMAP (MST) visualisation — zoom, pan, node clustering, and edge rendering.',
    url: 'https://d3js.org',
    license: 'ISC',
    citation: 'Bostock M, Ogievetsky V, Heer J. D³ Data-Driven Documents. IEEE Trans. Vis. Comput. Graph. 2011.',
  },
  {
    name: 'smiles-drawer',
    description:
      '2D molecular structure rendering directly onto HTML5 Canvas from SMILES strings — used in the compound table and detail panel.',
    url: 'https://github.com/reymond-group/smiles-drawer',
    license: 'MIT',
    citation: 'Probst D, Reymond JL. SmilesDrawer: Parsing and Drawing SMILES-Encoded Molecular Structures Using Client-Side JavaScript. J Chem Inf Model. 2018.',
  },
  {
    name: 'PapaParse',
    description:
      'Fast, in-browser CSV parsing with header detection, dynamic typing, and streaming support for large files.',
    url: 'https://www.papaparse.com',
    license: 'MIT',
    citation: 'PapaParse v5.5.3',
  },
  {
    name: 'React',
    description: 'UI component framework.',
    url: 'https://react.dev',
    license: 'MIT',
    citation: 'React v19',
  },
  {
    name: 'Tailwind CSS',
    description: 'Utility-first CSS framework used throughout the interface.',
    url: 'https://tailwindcss.com',
    license: 'MIT',
    citation: 'Tailwind CSS v4',
  },
  {
    name: 'Lucide React',
    description: 'Icon library — all UI icons in orbIC.',
    url: 'https://lucide.dev',
    license: 'ISC',
    citation: 'Lucide v0.546',
  },
];

function AttributionCard({ item }: { item: Attribution }) {
  return (
    <div className="p-3 rounded-lg bg-bg-deep/60 border border-border-sleek/50 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-bold text-accent-primary leading-tight">{item.name}</span>
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-text-muted hover:text-accent-primary transition-colors"
          aria-label={`Open ${item.name}`}
        >
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
      <p className="text-[10px] text-text-muted leading-relaxed">{item.description}</p>
      {item.citation && (
        <p className="text-[9px] text-text-muted/70 font-mono leading-relaxed border-l-2 border-accent-primary/30 pl-2">
          {item.citation}
        </p>
      )}
      <span className="inline-block text-[9px] font-mono text-accent-secondary/80 bg-accent-secondary/10 px-1.5 py-0.5 rounded">
        {item.license}
      </span>
    </div>
  );
}

export const AttributionsDialog: React.FC = () => {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button className="flex items-center gap-1.5 text-[10px] text-text-muted font-mono hover:text-accent-primary transition-colors">
            <Heart className="w-3 h-3" />
            Sources &amp; Libraries
          </button>
        }
      />
      <DialogContent className="bg-bg-surface border-border-sleek text-text-main sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-accent-primary flex items-center gap-2">
            <Heart className="w-4 h-4" />
            Data Sources &amp; Open-Source Libraries
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] pr-2">
          <div className="space-y-5 pb-2">

            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-widest text-text-muted font-bold">
                Data Sources
              </p>
              {DATA_SOURCES.map(item => (
                <AttributionCard key={item.name} item={item} />
              ))}
            </div>

            <div className="space-y-2">
              <p className="text-[10px] uppercase tracking-widest text-text-muted font-bold">
                Open-Source Libraries
              </p>
              {LIBRARIES.map(item => (
                <AttributionCard key={item.name} item={item} />
              ))}
            </div>

            <p className="text-[9px] text-text-muted/60 font-mono text-center pt-2">
              orbIC processes all data locally — no structures or activity values are transmitted to external servers.
            </p>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
