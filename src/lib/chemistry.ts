/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as OCL from 'openchemlib';
import { Compound, Scaffold } from '../types';

export function processSmiles(smiles: string): { 
  scaffold: string; 
  fingerprint: number[]; 
  properties: Record<string, number | string> 
} {
  try {
    const mol = OCL.Molecule.fromSmiles(smiles);
    
    // Generate fingerprint (512 bits)
    const fpArray: number[] = [];
    try {
      // @ts-ignore
      const fp = mol.getFingerprint();
      if (fp) {
        // OCL fingerprints can be Int32Array or similar
        for (let i = 0; i < fp.length; i++) fpArray.push(Number(fp[i]));
      }
    } catch (e) {
      // Fallback: simple hash of IDCode
      // @ts-ignore
      const idCode = mol.getIDCode();
      let hash = 0;
      for (let i = 0; i < idCode.length; i++) {
        hash = ((hash << 5) - hash) + idCode.charCodeAt(i);
        hash |= 0;
      }
      fpArray.push(hash);
    }

    // Get Bemis-Murcko Scaffold
    let scaffoldSmiles = smiles;
    try {
      // @ts-ignore
      const scaffoldMol = mol.getLightCopy();
      scaffoldMol.stripStereoInformation();
      // @ts-ignore
      scaffoldSmiles = scaffoldMol.getSmiles(); 
      if (!scaffoldSmiles) {
        // @ts-ignore
        scaffoldSmiles = mol.getSmiles();
      }
    } catch (e) {
      scaffoldSmiles = smiles;
    }

    // Basic properties
    const formula = mol.getMolecularFormula();
    const properties: Record<string, number | string> = {
      // @ts-ignore
      'MW': formula.relativeWeight || 0,
      // @ts-ignore
      'Formula': formula.formula || '',
      'LogP': 0,
      'PSA': 0,
    };

    try {
      // @ts-ignore
      const props = new OCL.MoleculeProperties(mol);
      // @ts-ignore
      properties['LogP'] = props.logP;
      // @ts-ignore
      properties['PSA'] = props.polarSurfaceArea;
    } catch (e) {
      console.warn('Failed to calculate LogP/PSA');
    }

    return {
      scaffold: scaffoldSmiles,
      fingerprint: fpArray,
      properties
    };
  } catch (e) {
    console.error(`Error processing SMILES ${smiles}:`, e);
    return {
      scaffold: 'Unknown',
      fingerprint: [],
      properties: {}
    };
  }
}

export function computeSimilarity(fp1: number[], fp2: number[]): number {
  if (fp1.length === 0 || fp2.length === 0) return 0;
  
  let intersection = 0;
  let union = 0;
  
  for (let i = 0; i < fp1.length; i++) {
    const bits1 = fp1[i];
    const bits2 = fp2[i];
    
    // Tanimoto similarity on bitsets
    // Since OCL fingerprints are Int32Array, we count bits
    const and = bits1 & bits2;
    const or = bits1 | bits2;
    
    intersection += countSetBits(and);
    union += countSetBits(or);
  }
  
  return union === 0 ? 0 : intersection / union;
}

function countSetBits(n: number): number {
  n = n - ((n >> 1) & 0x55555555);
  n = (n & 0x33333333) + ((n >> 2) & 0x33333333);
  return (((n + (n >> 4)) & 0x0F0F0F0F) * 0x01010101) >> 24;
}

export function groupIntoScaffolds(compounds: Compound[]): Scaffold[] {
  const scaffoldMap = new Map<string, string[]>();
  
  compounds.forEach(c => {
    const s = c.scaffoldSmiles || 'Unknown';
    if (!scaffoldMap.has(s)) {
      scaffoldMap.set(s, []);
    }
    scaffoldMap.get(s)!.push(c.id);
  });
  
  return Array.from(scaffoldMap.entries()).map(([smiles, compoundIds]) => ({
    smiles,
    compoundIds
  }));
}

export function matchesSubstructure(smiles: string, smarts: string): boolean {
  if (!smarts.trim()) return false;
  try {
    const mol = OCL.Molecule.fromSmiles(smiles);
    // Use fromSmarts for the query fragment if available, fallback to fromSmiles
    let query;
    try {
      // @ts-ignore
      query = OCL.Molecule.fromSmarts(smarts);
    } catch (e) {
      query = OCL.Molecule.fromSmiles(smarts);
    }
    
    const searcher = new OCL.SSSearcher();
    searcher.setMolecule(mol);
    searcher.setFragment(query);
    return searcher.isFragmentInMolecule();
  } catch (e) {
    // Silence parsing errors during typing
    return false;
  }
}

export function getMatchingAtoms(smiles: string, smarts: string): number[] {
  if (!smarts.trim()) return [];
  try {
    const mol = OCL.Molecule.fromSmiles(smiles);
    let query;
    try {
      // @ts-ignore
      query = OCL.Molecule.fromSmarts(smarts);
    } catch (e) {
      query = OCL.Molecule.fromSmiles(smarts);
    }

    const searcher = new OCL.SSSearcher();
    searcher.setMolecule(mol);
    searcher.setFragment(query);
    if (searcher.isFragmentInMolecule()) {
      const match = (searcher as any).getMatch();
      return match ? Array.from(match as number[]) : [];
    }
    return [];
  } catch (e) {
    return [];
  }
}
