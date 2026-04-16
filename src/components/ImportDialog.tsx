/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Compound } from '../types';
import { processSmiles } from '../lib/chemistry';
import { loadLocalDataset, loadPxrDataset, parseCsvToCompounds } from '../services/datasetService';
import { FileJson, FileSpreadsheet, Plus, Database, Loader2, SlidersHorizontal, AlertCircle } from 'lucide-react';

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

// Bundled dataset definitions — one place to add new entries
const BUNDLED_DATASETS = [
  {
    filename: 'demo_compounds.csv',
    label: 'Demo Pharmacology Set',
    count: '8 cpds',
    note: 'Mixed-target reference · ChEMBL CC0 · cited per compound',
  },
  {
    filename: 'cox_sar_series.csv',
    label: 'COX Inhibitor SAR Series',
    count: '10 cpds',
    note: 'Same-target IC50s vs ovine COX-1 · Mitchell et al. PNAS 1993',
  },
  {
    filename: 'openadmet_pxr_challenge.csv',
    label: 'PXR Challenge — Train Split',
    count: '4,139 cpds',
    note: 'openadmet/pxr-challenge-train-test · pEC50 vs PXR · precomputed',
  },
];

export const ImportDialog: React.FC<ImportDialogProps> = ({ onImport }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<ImportStep>('source');
  const [pending, setPending] = useState<Pending | null>(null);
  const [selectedCols, setSelectedCols] = useState<Set<string>>(new Set());

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) {
      setStep('source');
      setPending(null);
      setSelectedCols(new Set());
      setProgress(null);
      setError(null);
    }
  };

  // After any parse, move to the filter-select step
  const proceedToFilterSelect = (compounds: Compound[], sourceName: string) => {
    const cols = detectNumericCols(compounds);
    const defaultSelected = new Set(cols.filter(c => PRIORITY_FILTER_COLS.has(c)));
    setSelectedCols(defaultSelected.size > 0 ? defaultSelected : new Set(cols.slice(0, 4)));
    setPending({ compounds, cols, sourceName });
    setStep('filter-select');
  };

  const handleConfirm = () => {
    if (!pending) return;
    // Close the dialog first so React can commit open=false before the heavy
    // import render. Deferring onImport to the next tick means the dialog is
    // visually gone before useMemo (TMap graphData, filteredCompounds, etc.)
    // runs — otherwise those synchronous memos block the main thread for
    // several seconds and the dialog appears frozen.
    const compounds = pending.compounds;
    const cols = Array.from(selectedCols);
    handleOpenChange(false);
    setTimeout(() => onImport(compounds, cols), 0);
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
    setProgress(null);
    setError(null);
    try {
      const data = await loadLocalDataset(filename, undefined, (done, total) => {
        setProgress({ done, total });
      });
      proceedToFilterSelect(data, label);
    } catch (err) {
      setError(`Failed to load "${label}". Check the console for details.`);
      console.error(`Failed to load local dataset: ${filename}`, err);
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };

  const handleLoadPxr = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await loadPxrDataset(150);
      proceedToFilterSelect(data, 'PXR Challenge (remote)');
    } catch (err) {
      setError('Could not fetch the remote PXR dataset — likely a CORS error on static hosts.');
      console.error('Failed to load PXR dataset', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      setLoading(true);
      setProgress(null);
      setError(null);

      try {
        if (file.name.endsWith('.csv')) {
          const compounds = await parseCsvToCompounds(content, undefined, (done, total) => {
            setProgress({ done, total });
          });
          proceedToFilterSelect(compounds, file.name);
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
            setError('Could not parse the JSON file — check that it is an array of objects with a "smiles" field.');
            console.error('JSON parse error', err);
          }
        }
      } finally {
        setLoading(false);
        setProgress(null);
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

      <DialogContent className="bg-bg-surface border-border-sleek text-text-main sm:max-w-[480px] max-h-[90vh] overflow-y-auto">

        {/* ── Step 1: Source selection ── */}
        {step === 'source' && (
          <>
            <DialogHeader>
              <DialogTitle className="text-accent-primary">Import Chemical Data</DialogTitle>
              <DialogDescription className="text-text-muted">
                Upload a file or load a bundled dataset — you'll choose filters next.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4">

              {/* File upload */}
              <div className="flex flex-col gap-2">
                <Label htmlFor="file" className="text-[10px] uppercase tracking-widest text-text-muted font-bold">
                  Upload File
                </Label>
                <Input
                  id="file"
                  type="file"
                  accept=".csv,.json"
                  className="bg-bg-deep border-border-sleek text-text-main file:text-accent-primary file:bg-bg-surface file:border-none"
                  onChange={handleFileUpload}
                  disabled={loading}
                />
                <div className="flex gap-4 text-[10px] text-text-muted font-mono">
                  <span className="flex items-center gap-1.5">
                    <FileSpreadsheet className="w-3 h-3 text-accent-primary shrink-0" />
                    CSV with a 'SMILES' column
                  </span>
                  <span className="flex items-center gap-1.5">
                    <FileJson className="w-3 h-3 text-accent-primary shrink-0" />
                    JSON array with 'smiles' field
                  </span>
                </div>
              </div>

              {/* Bundled datasets */}
              <div className="flex flex-col gap-2 pt-2 border-t border-border-sleek">
                <Label className="text-[10px] uppercase tracking-widest text-text-muted font-bold">
                  Bundled Datasets
                </Label>
                {BUNDLED_DATASETS.map(ds => (
                  <div key={ds.filename}>
                    <Button
                      variant="outline"
                      className="w-full justify-start gap-2 bg-bg-deep border-accent-primary/50 text-accent-primary hover:bg-accent-primary hover:text-bg-deep transition-all"
                      onClick={() => handleLoadLocal(ds.filename, ds.label)}
                      disabled={loading}
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Database className="w-4 h-4 shrink-0" />}
                      <span className="flex-1 text-left">{ds.label}</span>
                      <span className="text-[10px] opacity-60 font-mono">{ds.count}</span>
                    </Button>
                    <p className="text-[9px] text-text-muted font-mono pl-1 pt-0.5">{ds.note}</p>
                  </div>
                ))}
              </div>

              {/* Remote datasets */}
              <div className="flex flex-col gap-2 pt-2 border-t border-border-sleek/50">
                <Label className="text-[10px] uppercase tracking-widest text-text-muted font-bold">
                  Remote Datasets
                </Label>
                <div>
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2 bg-bg-deep border-border-sleek text-text-muted hover:bg-bg-deep/80 transition-all"
                    onClick={handleLoadPxr}
                    disabled={loading}
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Database className="w-4 h-4 shrink-0" />}
                    <span className="flex-1 text-left">PXR Challenge — Full Dataset</span>
                    <span className="text-[10px] opacity-60 font-mono">Hugging Face</span>
                  </Button>
                  <p className="text-[9px] text-text-muted font-mono pl-1 pt-0.5">openadmet/pxr-challenge-train-test · may fail on static hosts (CORS)</p>
                </div>
              </div>

              {/* Loading / error feedback */}
              {loading && !progress && (
                <p className="text-[11px] font-mono text-accent-primary text-center py-1 animate-pulse">
                  Loading…
                </p>
              )}
              {loading && progress && (
                <p className="text-[11px] font-mono text-accent-primary text-center py-1">
                  Processing {progress.done.toLocaleString()} / {progress.total.toLocaleString()} compounds…
                </p>
              )}
              {error && (
                <div className="flex items-start gap-2 text-[11px] text-red-400 font-mono bg-red-400/10 border border-red-400/30 rounded-md px-3 py-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  {error}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <Button
                variant="outline"
                className="bg-transparent border-border-sleek text-text-muted hover:bg-bg-deep hover:text-text-main"
                onClick={() => handleOpenChange(false)}
              >
                Cancel
              </Button>
            </div>
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
                <span className="text-accent-primary font-mono">{pending.compounds.length.toLocaleString()}</span> compounds
                loaded from <span className="italic">{pending.sourceName}</span>.
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

            <div className="text-[10px] text-text-muted font-mono">
              {selectedCols.size} filter{selectedCols.size !== 1 ? 's' : ''} selected
            </div>

            <div className="flex gap-2 justify-end pt-2 border-t border-border-sleek">
              <Button
                variant="outline"
                className="bg-transparent border-border-sleek text-text-muted hover:bg-bg-deep hover:text-text-main"
                onClick={() => setStep('source')}
              >
                ← Back
              </Button>
              <Button
                variant="ghost"
                className="text-text-muted hover:bg-bg-deep/50 hover:text-text-main"
                onClick={handleConfirm}
              >
                Skip filters
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={selectedCols.size === 0}
                className="bg-accent-primary text-bg-deep hover:bg-accent-primary/80 font-bold"
              >
                Add {selectedCols.size} Filter{selectedCols.size !== 1 ? 's' : ''} & Import
              </Button>
            </div>
          </>
        )}

      </DialogContent>
    </Dialog>
  );
};
