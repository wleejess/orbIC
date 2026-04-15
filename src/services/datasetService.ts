import Papa from 'papaparse';
import { Compound } from '../types';
import { processSmiles } from '../lib/chemistry';

const PXR_TRAIN_URL = 'https://huggingface.co/datasets/openadmet/pxr-challenge-train-test/resolve/main/pxr-challenge_TRAIN.csv';

export async function loadPxrDataset(limit: number = 200): Promise<Compound[]> {
  try {
    const response = await fetch(PXR_TRAIN_URL);
    if (!response.ok) throw new Error('Failed to fetch dataset');
    
    const csvText = await response.text();
    
    return new Promise((resolve, reject) => {
      Papa.parse(csvText, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: (results) => {
          const data = results.data as any[];
          const processed: Compound[] = data.slice(0, limit).map((row, index) => {
            const smiles = row['SMILES'];
            const name = row['Molecule Name'] || `PXR-${index}`;
            const id = row['OCNT_ID'] || `pxr-${index}`;
            
            try {
              const { scaffold, fingerprint, properties: chemProps } = processSmiles(smiles);
              
              // Extract all other columns as properties
              const properties: Record<string, any> = { ...chemProps };
              Object.entries(row).forEach(([key, value]) => {
                if (key !== 'SMILES' && key !== 'Molecule Name' && key !== 'OCNT_ID') {
                  properties[key] = value;
                }
              });

              return {
                id,
                name,
                smiles,
                properties,
                scaffoldSmiles: scaffold,
                fingerprint
              };
            } catch (e) {
              console.warn(`Failed to process SMILES for ${name}: ${smiles}`);
              return null;
            }
          }).filter(Boolean) as Compound[];
          
          resolve(processed);
        },
        error: (error) => {
          reject(error);
        }
      });
    });
  } catch (error) {
    console.error('Error loading PXR dataset:', error);
    throw error;
  }
}
