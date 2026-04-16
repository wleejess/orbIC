/**
 * Precompute chemistry data for bundled datasets.
 *
 * For each target CSV in DATASETS, runs OpenChemLib to compute scaffold
 * SMILES, Morgan fingerprint, MW, LogP, PSA, and Formula, then writes a
 * sidecar JSON file next to the CSV.
 *
 * The app loader (datasetService.ts) checks for the sidecar first and loads
 * it directly — skipping all OCL work at runtime for near-instant imports.
 *
 * Usage:
 *   npm run precompute
 *   # or: npx tsx scripts/precompute-datasets.ts
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';
import * as OCL from 'openchemlib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

/** CSV filenames under public/data/ to precompute. */
const DATASETS = ['openadmet_pxr_challenge.csv'];

const SKIP_PROP_COLS = new Set([
  'SMILES', 'smiles', 'Name', 'name', 'ID', 'id',
  'ChEMBL_ID', 'OCNT_ID', 'Molecule Name',
]);

function processSmiles(smiles: string): {
  scaffold: string;
  fingerprint: number[];
  properties: Record<string, number | string>;
} {
  const mol = OCL.Molecule.fromSmiles(smiles);

  // Fingerprint — mol.getIndex() returns a 16-element Int32Array (OCL's
  // fragment index / structural fingerprint).
  const fpArray: number[] = [];
  const fp = mol.getIndex() as unknown as ArrayLike<number>;
  for (let i = 0; i < fp.length; i++) fpArray.push(Number(fp[i]));

  // Scaffold (stereo-stripped)
  let scaffoldSmiles = smiles;
  try {
    // @ts-ignore
    const scaffoldMol = mol.getLightCopy();
    scaffoldMol.stripStereoInformation();
    // @ts-ignore
    const s: string = scaffoldMol.getSmiles();
    if (s) scaffoldSmiles = s;
  } catch {
    // keep original
  }

  // Physicochemical properties
  const formula = mol.getMolecularFormula();
  const properties: Record<string, number | string> = {
    // @ts-ignore
    MW: formula.relativeWeight || 0,
    // @ts-ignore
    Formula: formula.formula || '',
    LogP: 0,
    PSA: 0,
  };
  try {
    // @ts-ignore
    const props = new OCL.MoleculeProperties(mol);
    // @ts-ignore
    properties.LogP = props.logP;
    // @ts-ignore
    properties.PSA = props.polarSurfaceArea;
  } catch {
    // keep defaults
  }

  return { scaffold: scaffoldSmiles, fingerprint: fpArray, properties };
}

// ─── Main ────────────────────────────────────────────────────────────────────

for (const filename of DATASETS) {
  const csvPath = resolve(ROOT, 'public', 'data', filename);
  const outPath = resolve(ROOT, 'public', 'data', filename.replace(/\.csv$/, '.precomputed.json'));

  console.log(`\nProcessing ${filename}…`);

  const csvText = readFileSync(csvPath, 'utf8');
  const { data } = Papa.parse(csvText, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
    comments: '#',
  });

  const rows = data as any[];
  const compounds = [];
  let ok = 0;
  let fail = 0;

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const smiles: string = String(row['SMILES'] || row['smiles'] || '').trim();
    if (!smiles) continue;

    const name: string =
      row['Name'] || row['name'] || row['Molecule Name'] || `CPD-${index + 1}`;
    const id: string =
      row['ChEMBL_ID'] || row['ID'] || row['id'] || row['OCNT_ID'] || `cpd-${index}`;

    try {
      const { scaffold, fingerprint, properties: chemProps } = processSmiles(smiles);

      const properties: Record<string, number | string> = { ...chemProps };
      Object.entries(row).forEach(([key, value]) => {
        if (!SKIP_PROP_COLS.has(key)) {
          properties[key] = value as number | string;
        }
      });

      compounds.push({ id, name, smiles, properties, scaffoldSmiles: scaffold, fingerprint });
      ok++;
    } catch (err) {
      fail++;
      console.warn(`  [SKIP] row ${index}: ${smiles} — ${err}`);
    }

    if ((index + 1) % 500 === 0) {
      process.stdout.write(`  ${index + 1}/${rows.length} rows…\r`);
    }
  }

  writeFileSync(outPath, JSON.stringify(compounds));
  console.log(`✓ Written ${outPath}`);
  console.log(`  ${ok} compounds OK, ${fail} skipped`);
}
