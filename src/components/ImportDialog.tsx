/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import Papa from 'papaparse';
import { Button } from '@/components/ui/button';
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
import { Compound } from '../types';
import { processSmiles } from '../lib/chemistry';
import { loadPxrDataset } from '../services/datasetService';
import { Upload, FileJson, FileSpreadsheet, Plus, Database, Loader2 } from 'lucide-react';

interface ImportDialogProps {
  onImport: (compounds: Compound[]) => void;
}

export const ImportDialog: React.FC<ImportDialogProps> = ({ onImport }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLoadPxr = async () => {
    setLoading(true);
    try {
      const data = await loadPxrDataset(150);
      onImport(data);
      setOpen(false);
    } catch (err) {
      console.error('Failed to load PXR dataset', err);
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
          complete: (results) => {
            const compounds = results.data.map((row: any, index: number) => {
              const smiles = row.SMILES || row.smiles || '';
              const { scaffold, fingerprint, properties } = processSmiles(smiles);
              
              // Merge with existing properties in the row
              const mergedProperties = { ...row, ...properties };
              delete mergedProperties.SMILES;
              delete mergedProperties.smiles;

              return {
                id: `cpd-${index}`,
                smiles,
                name: row.Name || row.name || `Compound ${index + 1}`,
                properties: mergedProperties,
                scaffoldSmiles: scaffold,
                fingerprint
              };
            }).filter((c: any) => c.smiles);
            
            onImport(compounds);
            setOpen(false);
          }
        });
      } else if (file.name.endsWith('.json')) {
        try {
          const data = JSON.parse(content);
          const compounds = data.map((item: any, index: number) => {
            const smiles = item.smiles || '';
            const { scaffold, fingerprint, properties } = processSmiles(smiles);
            return {
              id: item.id || `cpd-${index}`,
              smiles,
              name: item.name || `Compound ${index + 1}`,
              properties: { ...item.properties, ...properties },
              scaffoldSmiles: scaffold,
              fingerprint
            };
          });
          onImport(compounds);
          setOpen(false);
        } catch (err) {
          console.error('JSON parse error', err);
        }
      }
    };
    reader.readAsText(file);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
      <DialogContent className="sm:max-w-[425px] bg-bg-surface border-border-sleek text-text-main">
        <DialogHeader>
          <DialogTitle className="text-accent-primary">Import Chemical Data</DialogTitle>
          <DialogDescription className="text-text-muted">
            Upload a CSV or JSON file containing SMILES strings and metadata.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
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
          <div className="flex flex-col gap-2 text-[10px] text-text-muted font-mono uppercase tracking-tight">
            <p className="flex items-center gap-2">
              <FileSpreadsheet className="w-3 h-3 text-accent-primary" />
              CSV: Must have a 'SMILES' column.
            </p>
            <p className="flex items-center gap-2">
              <FileJson className="w-3 h-3 text-accent-primary" />
              JSON: Array of objects with 'smiles' field.
            </p>
          </div>

          <div className="pt-4 border-t border-border-sleek">
            <Label className="text-[10px] uppercase tracking-widest text-text-muted font-bold block mb-3">
              Pre-loaded Datasets
            </Label>
            <Button 
              variant="outline" 
              className="w-full gap-2 bg-bg-deep border-accent-secondary/50 text-accent-secondary hover:bg-accent-secondary hover:text-bg-deep transition-all"
              onClick={handleLoadPxr}
              disabled={loading}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
              Load PXR Challenge Dataset
            </Button>
            <p className="text-[9px] text-text-muted mt-2 font-mono">
              Source: openadmet/pxr-challenge-train-test (Hugging Face)
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            className="text-text-muted hover:text-text-main"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
