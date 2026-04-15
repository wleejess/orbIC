/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Compound {
  id: string;
  smiles: string;
  name?: string;
  properties: Record<string, number | string>;
  scaffoldSmiles?: string;
  fingerprint?: number[];
  x?: number;
  y?: number;
}

export interface Scaffold {
  smiles: string;
  compoundIds: string[];
  x?: number;
  y?: number;
}

export interface FilterState {
  search: string;
  propertyFilters: Record<string, [number, number]>;
  activeThresholds: {
    property: string;
    min?: number;
    max?: number;
    color: string;
  }[];
}
