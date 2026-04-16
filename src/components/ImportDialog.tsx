/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import Papa from 'papaparse';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Compound } from '../types';
import { processSmiles } from '../lib/chemistry';
import { loadLocalDataset, loadPxrDataset } from '../services/datasetService';
import { FileJson, FileSpreadsheet, Plus, Database, Loader2, SlidersHorizontal } from 'lucide-react';

// Columns to pre-check in the filter selector (if present in the data)
const PRIORITY_FILTER_COLS = new Set([
  'pEC50', 'pIC50', 'IC50', 'IC50_nM', 'EC50', 'EC50_nM', 'Ki', 'Ki_nM',
  'LogP', 'LogD', 'MW', 'PSA',
  'Emax_estimate (log2FC vs. baseline)',
  'Emax.vs.pos.ctrl_estimate (dimensionless)',
]);

// Columns that are numeric but not useful as SAR filters (suppress from list)
const SKIP_FILTER_COLS = new Set([
  'pEC50_std.error (-log10(molarity))',
  'Emax_std.error (log2FC vs. baseline)',
  'Emax.vs.pos.ctrl_std.error (dimensionless)',
  'pEC50_ci.lower (-log10(molarity))',
  'pEC50_ci.upper (-log10(molarity))',
  'Emax_ci.lower (log2FC vs. baseline)',
  'Emax_ci.upper (log2FC vs. baseline)',
  'Emax.vs.pos.ctrl_ci.lower (dimensionless)',
  'Emax.vs.pos.ctrl_ci.upper (dimensionless)',
]);

function detectNumericCols(compounds: Compound[]): string[] {
  const counts = new Map<string, number>();
  compounds.forEach(c => {
    Object.entries(c.properties).forEach(([k, v]) => {
      if (typeof v === 'number' && !isNaN(v) && !SKIP_FILTER_COLS.has(k)) {
        counts.set(k, (counts.get(k) || 0) + 1);
      }
    });
  });
  const threshold = compounds.length * 0.3;
  return Array.from(counts.entries())
    .filter(([, n]) => n >= threshold)
    .sort((a, b) => {
      // Priority columns first, then by frequency
      const aPriority = PRIORITY_FILTER_COLS.has(a[0]) ? 1 : 0;
      const bPriority = PRIORITY_FILTER_COLS.has(b[0]) ? 1 : 0;
      if (aPriority !== bPriority) return bPriority - aPriority;
      return b[1] - a[1];
    })
    .map(([k]) => k);
}

function getColRange(compounds: Compound[], col: string): { min: number; max: number } {
  const vals = compounds
    .map(c => Number(c.properties[col]))
    .filter(v => !isNaN(v) && isFinite(v));
  if (vals.length === 0) return { min: 0, max: 1 };
  return { min: Math.min(...vals), max: Math.max(...vals) };
}

// ─────────────────────────────────────────────────────────────────────────────

interface ImportDialogProps {
  onImport: (compounds: Compound[], filterColumns: string[]) => void;
}

type ImportStep = 'source' | 'filter-select';

interface Pending {
  compounds: Compound[];
  cols: string[];
  sourceName: string;
}

export const ImportDialog: React.FC<ImportDialogProps> = ({ onImport }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<ImportStep>('source');
  const [pending, setPending] = useState<Pending | null>(null);
  const [selectedCols, setSelectedCols] = useState<Set<string>>(new Set());

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) {
      setStep('source');
      setPending(null);
      setSelectedCols(new Set());
    }
  };

  // After any parse, move to the filter-select step
  const proceedToFilterSelect = (compounds: Compound[], sourceName: string) => {
    const cols = detectNumericCols(compounds);
    const defaultSelected = new Set(cols.filter(c => PRIORITY_FILTER_COLS.has(c)));
    // If nothing matched priority list, pre-check first 4
    setSelectedCols(defaultSelected.size > 0 ? defaultSelected : new Set(cols.slice(0, 4)));
    setPending({ compounds, cols, sourceName });
    setStep('filter-select');
  };

  const handleConfirm = () => {
    if (!pending) return;
    onImport(pending.compounds, Array.from(selectedCols));
    handleOpenChange(false);
  };

  const toggleCol = (col: string) => {
    setSelectedCols(prev => {
      const next = new Set(prev);
      next.has(col) ? next.delete(col) : next.add(col);
      return next;
    });
  };

  // ── Data loaders ──────────────────────────────────────────────────────────

  const handleLoadLocal = async (filename: string, label: string) => {
    setLoading(true);
    try {
      const data = await loadLocalDataset(filename);
      proceedToFilterSelect(data, label);
    } catch (err) {
      console.error(`Failed to load local dataset: ${filename}`, err);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadPxr = async () => {
    setLoading(true);
    try {
      const data = await loadPxrDataset(150);
      proceedToFilterSelect(data, 'PXR Challenge (remote)');
    } catch (err) {
      console.error('Failed to load PXR dataset (may fail due to CORS on static hosts)', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;

      if (file.name.endsWith('.csv')) {
        Papa.parse(content, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          comments: '#',
          complete: (results) => {
            const compounds = (results.data as any[])
              .map((row, index) => {
                const smiles: string = String(row.SMILES || row.smiles || '').trim();
                if (!smiles) return null;
                try {
                  const { scaffold, fingerprint, properties } = processSmiles(smiles);
                  const merged: Record<string, any> = { ...properties };
                  Object.entries(row).forEach(([k, v]) => {
                    if (!['SMILES', 'smiles'].includes(k)) merged[k] = v;
                  });
                  return {
                    id: row.id || row.ID || row.ChEMBL_ID || `cpd-${index}`,
                    smiles,
                    name: row.Name || row.name || `Compound ${index + 1}`,
                    properties: merged,
                    scaffoldSmiles: scaffold,
                    fingerprint,
                  };
                } catch {
                  return null;
                }
              })
              .filter(Boolean) as Compound[];
            proceedToFilterSelect(compounds, file.name);
          },
        });
      } else if (file.name.endsWith('.json')) {
        try {
          const data = JSON.parse(content);
          const compounds = (data as any[]).map((item, index) => {
            const smiles: string = String(item.smiles || '').trim();
            if (!smiles) return null;
            try {
              const { scaffold, fingerprint, properties } = processSmiles(smiles);
              return {
                id: item.id || `cpd-${index}`,
                smiles,
                name: item.name || `Compound ${index + 1}`,
                properties: { ...item.properties, ...properties },
                scaffoldSmiles: scaffold,
                fingerprint,
              };
            } catch {
              return null;
            }
          }).filter(Boolean) as Compound[];
          proceedToFilterSelect(compounds, file.name);
        } catch (err) {
          console.error('JSON parse error', err);
        }
      }
    };
    reader.readAsText(file);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            className="gap-2 border-accent-primary text-accent-primary hover:bg-accent-primary hover:text-bg-deep transition-all"
          >
            <Plus className="w-4 h-4" />
            Import SMILES
          </Button>
        }
      />

      <DialogContent className="bg-bg-surface border-border-sleek text-text-main sm:max-w-[480px]">

        {/* ── Step 1: Source selection ── */}
        {step === 'source' && (
          <>
            <DialogHeader>
              <DialogTitle className="text-accent-primary">Import Chemical Data</DialogTitle>
              <DialogDescription className="text-text-muted">
                Upload a file or load a bundled dataset — you'll choose filters next.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              {/* File upload */}
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="file" className="text-right text-text-muted text-xs uppercase font-bold">
                  File
                </Label>
                <Input
                  id="file"
                  type="file"
                  accept=".csv,.json"
                  className="col-span-3 bg-bg-deep border-border-sleek text-text-main file:text-accent-primary file:bg-bg-surface file:border-none"
                  onChange={handleFileUpload}
                />
              </div>
              <div className="flex flex-col gap-1.5 text-[10px] text-text-muted font-mono uppercase tracking-tight">
                <p className="flex items-center gap-2">
                  <FileSpreadsheet className="w-3 h-3 text-accent-primary" />
                  CSV: must have a 'SMILES' column
                </p>
                <p className="flex items-center gap-2">
                  <FileJson className="w-3 h-3 text-accent-primary" />
                  JSON: array of objects with 'smiles' field
                </p>
              </div>

              {/* Bundled datasets */}
              <div className="pt-4 border-t border-border-sleek space-y-2">
                <Label className="text-[10px] uppercase tracking-widest text-text-muted font-bold block mb-3">
                  Bundled Datasets
                </Label>

                <Button variant="outline" className="w-full gap-2 bg-bg-deep border-accent-primary/50 text-accent-primary hover:bg-accent-primary hover:text-bg-deep transition-all" onClick={() => handleLoadLocal('demo_compounds.csv', 'Demo Pharmacology Set')} disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                  Demo Pharmacology Set (8 cpds)
                </Button>
                <p className="text-[9px] text-text-muted font-mono pl-1">Mixed-target reference · ChEMBL CC0 · cited per compound</p>

                <Button variant="outline" className="w-full gap-2 bg-bg-deep border-accent-secondary/50 text-accent-secondary hover:bg-accent-secondary hover:text-bg-deep transition-all" onClick={() => handleLoadLocal('cox_sar_series.csv', 'COX Inhibitor SAR Series')} disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                  COX Inhibitor SAR Series (10 cpds)
                </Button>
                <p className="text-[9px] text-text-muted font-mono pl-1">Same-target IC50s vs ovine COX-1 · Mitchell et al. PNAS 1993</p>

                <Button variant="outline" className="w-full gap-2 bg-bg-deep border-accent-secondary/50 text-accent-secondary hover:bg-accent-secondary hover:text-bg-deep transition-all" onClick={() => handleLoadLocal('openadmet_pxr_challenge.csv', 'PXR Challenge Train Split')} disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                  PXR Challenge — Train Split (4,139 cpds)
                </Button>
                <p className="text-[9px] text-text-muted font-mono pl-1">openadmet/pxr-challenge-train-test · pEC50 vs PXR · bundled</p>
              </div>

              {/* Remote datasets */}
              <div className="pt-3 border-t border-border-sleek/50 space-y-2">
                <Label className="text-[10px] uppercase tracking-widest text-text-muted font-bold block mb-2">
                  Remote Datasets
                </Label>
                <Button variant="outline" className="w-full gap-2 bg-bg-deep border-border-sleek text-text-muted hover:bg-bg-deep/80 transition-all" onClick={handleLoadPxr} disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                  PXR Challenge — Full Dataset (Hugging Face)
                </Button>
                <p className="text-[9px] text-text-muted font-mono pl-1">openadmet/pxr-challenge-train-test · may fail on static hosts (CORS)</p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" className="text-text-muted hover:text-text-main" onClick={() => handleOpenChange(false)}>
                Cancel
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── Step 2: Filter column picker ── */}
        {step === 'filter-select' && pending && (
          <>
            <DialogHeader>
              <DialogTitle className="text-accent-primary flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4" />
                Configure Sliding Filters
              </DialogTitle>
              <DialogDescription className="text-text-muted">
                <span className="text-accent-primary font-mono">{pending.compounds.length}</span> compounds
                parsed from <span className="italic">{pending.sourceName}</span>.
                Select which numeric columns to expose as sidebar sliders.
              </DialogDescription>
            </DialogHeader>

            <ScrollArea className="max-h-72 pr-1">
              <div className="space-y-1.5 py-1">
                {pending.cols.length === 0 && (
                  <p className="text-xs text-text-muted text-center py-6">No numeric columns detected.</p>
                )}
                {pending.cols.map(col => {
                  const { min, max } = getColRange(pending.compounds, col);
                  const isPriority = PRIORITY_FILTER_COLS.has(col);
                  const isChecked = selectedCols.has(col);
                  return (
                    <label
                      key={col}
                      className={`flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors select-none ${
                        isChecked
                          ? 'bg-accent-primary/10 border border-accent-primary/40'
                          : 'bg-bg-deep/40 border border-transparent hover:bg-bg-deep/70'
                      }`}
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => toggleCol(col)}
                        className="shrink-0 border-border-sleek data-[state=checked]:bg-accent-primary data-[state=checked]:border-accent-primary"
                      />
                      <div className="flex-1 min-w-0">
                        <span className={`text-xs font-medium truncate block ${isChecked ? 'text-accent-primary' : 'text-text-main'}`}>
                          {col}
                          {isPriority && <span className="ml-1.5 text-[9px] text-accent-primary/60 font-normal">recommended</span>}
                        </span>
                        <span className="text-[10px] text-text-muted font-mono">
                          range: {min.toFixed(2)} – {max.toFixed(2)}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </ScrollArea>

            <div className="text-[10px] text-text-muted font-mono pt-1">
              {selectedCols.size} filter{selectedCols.size !== 1 ? 's' : ''} selected
            </div>

            <DialogFooter className="gap-2">
              <Button variant="ghost" className="text-text-muted hover:text-text-main" onClick={() => setStep('source')}>
                ← Back
              </Button>
              <Button variant="ghost" className="text-text-muted" onClick={handleConfirm}>
                Skip filters
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={selectedCols.size === 0}
                className="bg-accent-primary text-bg-deep hover:bg-accent-primary/80 font-bold"
              >
                Add {selectedCols.size} Filter{selectedCols.size !== 1 ? 's' : ''} & Import
              </Button>
            </DialogFooter>
          </>
        )}

      </DialogContent>
    </Dialog>
  );
};
