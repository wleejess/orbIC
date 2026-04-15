import Papa from 'papaparse';
import { Compound } from '../types';
import { processSmiles } from '../lib/chemistry';

// ---------------------------------------------------------------------------
// Shared CSV → Compound parser
// ---------------------------------------------------------------------------
function parseCsvToCompounds(csvText: string, limit?: number): Promise<Compound[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(csvText, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      comments: '#', // ignore comment/citation header lines starting with #
      complete: (results) => {
        const data = results.data as any[];
        const rows = limit ? data.slice(0, limit) : data;

        const processed: Compound[] = rows
          .map((row, index) => {
            const smiles: string = String(row['SMILES'] || row['smiles'] || '').trim();
            const name: string =
              row['Name'] || row['name'] || row['Molecule Name'] || `CPD-${index + 1}`;
            const id: string =
              row['ChEMBL_ID'] || row['ID'] || row['id'] || row['OCNT_ID'] || `cpd-${index}`;

            if (!smiles) return null;

            try {
              const { scaffold, fingerprint, properties: chemProps } = processSmiles(smiles);

              const properties: Record<string, number | string> = { ...chemProps };
              Object.entries(row).forEach(([key, value]) => {
                if (!['SMILES', 'smiles', 'Name', 'name', 'ID', 'id', 'ChEMBL_ID', 'OCNT_ID', 'Molecule Name'].includes(key)) {
                  properties[key] = value as number | string;
                }
              });

              return { id, name, smiles, properties, scaffoldSmiles: scaffold, fingerprint };
            } catch {
              console.warn(`Failed to process SMILES for "${name}": ${smiles}`);
              return null;
            }
          })
          .filter(Boolean) as Compound[];

        resolve(processed);
      },
      error: (err) => reject(err),
    });
  });
}

// ---------------------------------------------------------------------------
// Local bundled datasets (public/data/)
// Uses import.meta.env.BASE_URL so paths resolve correctly in dev (/),
// production (/orbIC/), and any other base path.
// ---------------------------------------------------------------------------
export async function loadLocalDataset(
  csvFilename: string,
  limit?: number,
): Promise<Compound[]> {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const url = `${base}/data/${csvFilename}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch local dataset (${url}): HTTP ${response.status}`);
  const csvText = await response.text();
  return parseCsvToCompounds(csvText, limit);
}

// ---------------------------------------------------------------------------
// Remote PXR dataset (Hugging Face) — optional, may fail due to CORS
// ---------------------------------------------------------------------------
const PXR_TRAIN_URL =
  'https://huggingface.co/datasets/openadmet/pxr-challenge-train-test/resolve/main/pxr-challenge_TRAIN.csv';

export async function loadPxrDataset(limit: number = 200): Promise<Compound[]> {
  const response = await fetch(PXR_TRAIN_URL);
  if (!response.ok) throw new Error(`Failed to fetch PXR dataset: HTTP ${response.status}`);
  const csvText = await response.text();
  return parseCsvToCompounds(csvText, limit);
}
