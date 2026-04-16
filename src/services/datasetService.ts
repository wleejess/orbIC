import Papa from 'papaparse';
import { Compound } from '../types';
import { processSmiles } from '../lib/chemistry';

const SKIP_PROP_COLS = new Set([
  'SMILES', 'smiles', 'Name', 'name', 'ID', 'id',
  'ChEMBL_ID', 'OCNT_ID', 'Molecule Name',
]);

// How many rows to process per main-thread yield (fix B)
const CHUNK_SIZE = 50;

// ---------------------------------------------------------------------------
// Chunked async CSV → Compound parser
// Runs OCL in CHUNK_SIZE-row batches and yields between each chunk so the
// browser stays responsive. onProgress fires after each chunk.
// ---------------------------------------------------------------------------
export async function parseCsvToCompounds(
  csvText: string,
  limit?: number,
  onProgress?: (done: number, total: number) => void,
): Promise<Compound[]> {
  // Papa.parse returns synchronously for string input with no complete callback
  const result = Papa.parse(csvText, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
    comments: '#',
  });

  const allRows = result.data as any[];
  const rows = limit ? allRows.slice(0, limit) : allRows;
  const total = rows.length;
  const processed: Compound[] = [];

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);

    for (let j = 0; j < chunk.length; j++) {
      const row = chunk[j];
      const smiles: string = String(row['SMILES'] || row['smiles'] || '').trim();
      if (!smiles) continue;

      const name: string =
        row['Name'] || row['name'] || row['Molecule Name'] || `CPD-${i + j + 1}`;
      const id: string =
        row['ChEMBL_ID'] || row['ID'] || row['id'] || row['OCNT_ID'] || `cpd-${i + j}`;

      try {
        const { scaffold, fingerprint, properties: chemProps } = processSmiles(smiles);
        const properties: Record<string, number | string> = { ...chemProps };
        Object.entries(row).forEach(([key, value]) => {
          if (!SKIP_PROP_COLS.has(key)) {
            properties[key] = value as number | string;
          }
        });
        processed.push({ id, name, smiles, properties, scaffoldSmiles: scaffold, fingerprint });
      } catch {
        console.warn(`Failed to process SMILES for "${name}": ${smiles}`);
      }
    }

    onProgress?.(Math.min(i + CHUNK_SIZE, total), total);
    // Yield to the main thread so the UI stays interactive
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }

  return processed;
}

// ---------------------------------------------------------------------------
// Local bundled datasets (public/data/)
//
// Fast path (fix E): checks for a .precomputed.json sidecar first. If found,
// compounds are loaded directly with no OCL work — near-instant even for
// large datasets. Run `npm run precompute` to generate sidecar files.
//
// Slow path (fix B): falls back to chunked CSV parsing when no sidecar
// exists. Limit defaults to 200 to cap worst-case processing time.
// ---------------------------------------------------------------------------
export async function loadLocalDataset(
  csvFilename: string,
  limit?: number,
  onProgress?: (done: number, total: number) => void,
): Promise<Compound[]> {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');

  // Fast path: precomputed sidecar
  const jsonUrl = `${base}/data/${csvFilename.replace(/\.csv$/, '.precomputed.json')}`;
  try {
    const jsonResponse = await fetch(jsonUrl);
    if (jsonResponse.ok) {
      const data = (await jsonResponse.json()) as Compound[];
      return limit ? data.slice(0, limit) : data;
    }
  } catch {
    // fall through to CSV parsing
  }

  // Slow path: chunked CSV — cap at 200 rows if no explicit limit given (fix A)
  const csvUrl = `${base}/data/${csvFilename}`;
  const response = await fetch(csvUrl);
  if (!response.ok)
    throw new Error(`Failed to fetch local dataset (${csvUrl}): HTTP ${response.status}`);
  const csvText = await response.text();
  return parseCsvToCompounds(csvText, limit ?? 200, onProgress);
}

// ---------------------------------------------------------------------------
// Remote PXR dataset (Hugging Face) — optional, may fail due to CORS
// ---------------------------------------------------------------------------
const PXR_TRAIN_URL =
  'https://huggingface.co/datasets/openadmet/pxr-challenge-train-test/resolve/main/pxr-challenge_TRAIN.csv';

export async function loadPxrDataset(limit = 200): Promise<Compound[]> {
  const response = await fetch(PXR_TRAIN_URL);
  if (!response.ok) throw new Error(`Failed to fetch PXR dataset: HTTP ${response.status}`);
  const csvText = await response.text();
  return parseCsvToCompounds(csvText, limit);
}
