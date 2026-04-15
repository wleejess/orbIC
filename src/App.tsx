/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect } from 'react';
import { Compound, Scaffold } from './types';
import { groupIntoScaffolds, processSmiles, computeSimilarity, matchesSubstructure } from './lib/chemistry';
import { TMap } from './components/TMap';
import { CompoundTable } from './components/CompoundTable';
import { ImportDialog } from './components/ImportDialog';
import { SmilesRenderer } from './components/SmilesRenderer';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle, 
  CardDescription 
} from '@/components/ui/card';
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from '@/components/ui/tabs';
import { 
  Badge 
} from '@/components/ui/badge';
import { 
  Label 
} from '@/components/ui/label';
import { 
  Input 
} from '@/components/ui/input';
import { 
  Button 
} from '@/components/ui/button';
import { 
  Slider 
} from '@/components/ui/slider';
import { 
  Beaker, 
  LayoutDashboard, 
  Network, 
  Table as TableIcon, 
  Target, 
  Info,
  Plus,
  Trash2,
  Search,
  Copy,
  Check
} from 'lucide-react';

// Sample data
const SAMPLE_COMPOUNDS = [
  { name: 'Aspirin', smiles: 'CC(=O)OC1=CC=CC=C1C(=O)O' },
  { name: 'Caffeine', smiles: 'CN1C=NC2=C1C(=O)N(C(=O)N2C)C' },
  { name: 'Paracetamol', smiles: 'CC(=O)NC1=CC=C(O)C=C1' },
  { name: 'Ibuprofen', smiles: 'CC(C)CC1=CC=C(C=C1)C(C)C(=O)O' },
  { name: 'Nicotine', smiles: 'CN1CCCC1C2=CN=CC=C2' },
  { name: 'Morphine', smiles: 'O[C@H]1[C@H]2[C@H]3[C@@H]4[C@@]5(C=C[C@H]1O)Oc6c5c3c(CC[C@@H]4N(C)CC2)cc6O' },
  { name: 'Penicillin G', smiles: 'CC1(C(N2C(S1)C(C2=O)NC(=O)CC3=CC=CC=C3)C(=O)O)C' },
  { name: 'LSD', smiles: 'CCN(CC)C(=O)C1CN(C2CC3=CNC4=CC=CC(=C34)C2=C1)C' },
];

export default function App() {
  const [compounds, setCompounds] = useState<Compound[]>([]);
  const [selectedCompound, setSelectedCompound] = useState<Compound | null>(null);
  const [thresholds, setThresholds] = useState<{ property: string; min?: number; max?: number; color: string }[]>([]);
  const [savedCompounds, setSavedCompounds] = useState<Compound[]>([]);
  const [search, setSearch] = useState('');
  
  // Advanced Search State
  const [smartsQuery, setSmartsQuery] = useState('');
  const [similarityQuery, setSimilarityQuery] = useState('');
  const [similarityThreshold, setSimilarityThreshold] = useState(0.7);
  const [copiedSmiles, setCopiedSmiles] = useState<string | null>(null);

  // Initialize with PXR dataset by default
  useEffect(() => {
    const loadDefault = async () => {
      try {
        const { loadPxrDataset } = await import('./services/datasetService');
        const pxrData = await loadPxrDataset();
        setCompounds(pxrData);
      } catch (e) {
        console.error('Failed to load default dataset:', e);
      }
    };
    loadDefault();
  }, []);

  const scaffolds = useMemo(() => groupIntoScaffolds(compounds), [compounds]);

  const filteredCompounds = useMemo(() => {
    return compounds.filter(c => {
      if (!c) return false;

      // Text Search (Name, SMILES, Formula)
      if (search.trim()) {
        const query = search.toLowerCase();
        const matches = 
          c.name.toLowerCase().includes(query) ||
          c.smiles.toLowerCase().includes(query) ||
          (c.properties['Formula'] && String(c.properties['Formula']).toLowerCase().includes(query));
        if (!matches) return false;
      }

      // SMARTS Substructure Match
      if (smartsQuery.trim()) {
        if (!matchesSubstructure(c.smiles, smartsQuery)) return false;
      }

      // Similarity Search
      if (similarityQuery.trim()) {
        try {
          const queryFp = processSmiles(similarityQuery).fingerprint;
          const sim = computeSimilarity(c.fingerprint || [], queryFp);
          if (sim < similarityThreshold) return false;
        } catch (e) {
          return false;
        }
      }

      // Property Thresholds
      if (thresholds.length > 0) {
        const meetsThresholds = thresholds.every(t => {
          const val = Number(c.properties[t.property]);
          if (isNaN(val)) return true; // If property missing, don't filter out? Or do?
          return (t.min === undefined || val >= t.min) && (t.max === undefined || val <= t.max);
        });
        if (!meetsThresholds) return false;
      }

      return true;
    });
  }, [compounds, search, smartsQuery, similarityQuery, similarityThreshold, thresholds]);

  const handleImport = (newCompounds: Compound[]) => {
    setCompounds(prev => [...prev, ...newCompounds]);
  };

  const getPropertyRange = (prop: string) => {
    const values = compounds.map(c => Number(c.properties[prop])).filter(v => !isNaN(v));
    if (values.length === 0) return { min: 0, max: 100 };
    return {
      min: Math.floor(Math.min(...values) * 10) / 10,
      max: Math.ceil(Math.max(...values) * 10) / 10
    };
  };

  // Initialize default filters
  useEffect(() => {
    if (compounds.length > 0 && thresholds.length === 0) {
      const defaultProps = ['pEC50', 'IC50', 'EC50', 'LogP', 'MW', 'PSA'];
      const initial = defaultProps
        .filter(prop => compounds.some(c => c.properties[prop] !== undefined))
        .map(prop => {
          const range = getPropertyRange(prop);
          return { property: prop, min: range.min, max: range.max, color: '#22c55e' };
        });
      setThresholds(initial);
    }
  }, [compounds]);

  const handleCopy = (smiles: string) => {
    navigator.clipboard.writeText(smiles);
    setCopiedSmiles(smiles);
    setTimeout(() => setCopiedSmiles(null), 2000);
  };

  const toggleSaveCompound = (c: Compound) => {
    setSavedCompounds(prev => {
      const exists = prev.find(sc => sc.id === c.id);
      if (exists) return prev.filter(sc => sc.id !== c.id);
      return [...prev, c];
    });
  };

  return (
    <div className="h-screen w-screen bg-bg-deep text-text-main font-sans overflow-hidden grid grid-cols-1 md:grid-cols-[280px_1fr] lg:grid-cols-[280px_1fr_260px] grid-rows-[64px_1fr_32px]">
      {/* Header */}
      <header className="col-span-full bg-bg-surface border-b border-border-sleek px-6 flex items-center justify-between z-50">
        <div className="flex items-center gap-3">
          <div className="text-accent-primary flex items-center gap-2 font-extrabold text-xl tracking-tighter">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" />
              <path d="M8 12h8m-4-4v8" />
            </svg>
            ORBIC
          </div>
        </div>
        
        <div className="flex-1 max-w-2xl mx-8 hidden md:flex gap-4">
          <div className="relative flex-[1.5]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <Input 
              placeholder="Search by Name, SMILES, or Formula..." 
              className="bg-bg-deep border-border-sleek text-text-main pl-10 h-9 focus-visible:ring-accent-primary"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="relative flex-1">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted flex items-center justify-center font-bold text-[10px]">S</div>
            <Input 
              placeholder="SMARTS Substructure..." 
              className="bg-bg-deep border-border-sleek text-text-main pl-10 h-9 focus-visible:ring-accent-primary"
              value={smartsQuery}
              onChange={(e) => setSmartsQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <ImportDialog onImport={handleImport} />
          <Badge variant="outline" className="border-border-sleek text-accent-primary font-mono text-[10px]">
            {filteredCompounds.length} / {compounds.length} MATCHES
          </Badge>
        </div>
      </header>

      {/* Sidebar Left: Filters */}
      <aside className="hidden md:flex bg-bg-surface border-r border-border-sleek p-5 flex-col gap-6 overflow-y-auto">
        <div className="space-y-4">
          <Label className="text-[10px] uppercase tracking-widest text-text-muted font-bold block mb-4">
            Property Filters
          </Label>
          
          <div className="space-y-6">
            {thresholds.map((t, i) => (
              <div key={t.property} className="space-y-3 p-3 rounded-lg bg-bg-deep/50 border border-border-sleek/50">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-accent-primary">{t.property}</span>
                  <span className="text-[10px] font-mono text-text-muted">
                    {t.min?.toFixed(1)} - {t.max?.toFixed(1)}
                  </span>
                </div>
                <div className="space-y-4">
                  <Slider 
                    value={[t.min || 0, t.max || 100]} 
                    max={getPropertyRange(t.property).max} 
                    min={getPropertyRange(t.property).min}
                    step={0.1}
                    onValueChange={(vals: number[]) => {
                      const [min, max] = vals;
                      const newT = [...thresholds];
                      newT[i] = { ...newT[i], min, max };
                      setThresholds(newT);
                    }}
                    className="[&_[role=slider]]:bg-accent-primary"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {similarityQuery && (
          <div className="space-y-4 pt-6 border-t border-border-sleek">
            <Label className="text-[10px] uppercase tracking-widest text-text-muted font-bold block">
              Similarity Threshold
            </Label>
            <div className="space-y-4">
              <div className="flex justify-between text-[10px] font-mono text-text-muted">
                <span>Tanimoto:</span>
                <span className="text-accent-primary">{similarityThreshold.toFixed(2)}</span>
              </div>
              <Slider 
                value={[similarityThreshold]} 
                max={1} 
                min={0}
                step={0.01}
                onValueChange={(vals: number[]) => setSimilarityThreshold(vals[0])}
                className="[&_[role=slider]]:bg-accent-primary"
              />
            </div>
          </div>
        )}

        <div className="space-y-4 pt-6 border-t border-border-sleek">
          <Label className="text-[10px] uppercase tracking-widest text-text-muted font-bold block">
            Core Scaffolds
          </Label>
          <div className="space-y-3">
            {scaffolds.slice(0, 6).map(s => (
              <div key={s.smiles} className="group relative bg-bg-deep rounded-lg border border-border-sleek p-2 hover:border-accent-primary transition-colors overflow-hidden">
                <div className="bg-white rounded p-1 flex items-center justify-center h-24 mb-2">
                  <SmilesRenderer smiles={s.smiles} width={220} height={80} />
                </div>
                <div className="flex justify-between items-center px-1">
                  <span className="truncate max-w-[140px] font-mono text-[9px] text-text-muted" title={s.smiles}>{s.smiles}</span>
                  <Badge variant="secondary" className="bg-bg-surface text-accent-primary h-4 text-[9px] border-none font-bold">
                    {s.compoundIds.length}
                  </Badge>
                </div>
                
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="absolute top-1 right-1 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity bg-bg-surface/90 backdrop-blur border border-border-sleek shadow-sm"
                  onClick={() => handleCopy(s.smiles)}
                >
                  {copiedSmiles === s.smiles ? (
                    <Check className="w-3.5 h-3.5 text-success-sleek" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-text-muted" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Main: TMAP Viewport */}
      <main className="relative overflow-hidden">
        <Tabs defaultValue="tmap" className="w-full h-full flex flex-col">
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
            <TabsList className="bg-bg-surface/80 backdrop-blur border border-border-sleek p-1">
              <TabsTrigger value="tmap" className="data-[state=active]:bg-accent-primary data-[state=active]:text-bg-deep gap-2 text-xs">
                <Network className="w-3 h-3" />
                TMAP View
              </TabsTrigger>
              <TabsTrigger value="table" className="data-[state=active]:bg-accent-primary data-[state=active]:text-bg-deep gap-2 text-xs">
                <TableIcon className="w-3 h-3" />
                Data Grid
              </TabsTrigger>
              <TabsTrigger value="saved" className="data-[state=active]:bg-accent-primary data-[state=active]:text-bg-deep gap-2 text-xs">
                <Target className="w-3 h-3" />
                Saved ({savedCompounds.length})
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="tmap" className="flex-1 m-0 h-full">
            <TMap 
              compounds={compounds} 
              scaffolds={scaffolds} 
              onSelectCompound={setSelectedCompound}
              thresholds={thresholds}
              smartsHighlight={smartsQuery}
            />
          </TabsContent>

          <TabsContent value="table" className="flex-1 m-0 p-6 bg-bg-deep">
            <CompoundTable 
              compounds={filteredCompounds} 
              onSelect={setSelectedCompound} 
              smartsHighlight={smartsQuery}
              thresholds={thresholds}
            />
          </TabsContent>

          <TabsContent value="saved" className="flex-1 m-0 p-6 bg-bg-deep">
            <div className="flex flex-col h-full gap-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-accent-primary">Saved for Follow-up</h2>
                <Button variant="outline" size="sm" onClick={() => setSavedCompounds([])} className="text-danger-sleek border-danger-sleek hover:bg-danger-sleek hover:text-white">
                  Clear All
                </Button>
              </div>
              <CompoundTable 
                compounds={savedCompounds} 
                onSelect={setSelectedCompound} 
                smartsHighlight={smartsQuery}
                thresholds={thresholds}
              />
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Sidebar Right: Details */}
      <aside className="hidden lg:flex bg-bg-surface border-l border-border-sleek p-5 flex-col gap-6 overflow-y-auto">
        <Label className="text-[10px] uppercase tracking-widest text-text-muted font-bold block">
          Compound Detail
        </Label>
        
        {selectedCompound ? (
          <div className="space-y-6">
            <div className="bg-bg-deep border border-border-sleek rounded-xl p-4 space-y-4">
              <div className="bg-white rounded-lg p-2 flex items-center justify-center h-32">
                <SmilesRenderer smiles={selectedCompound.smiles} width={220} height={120} />
              </div>
              <div>
                <h3 className="text-accent-primary font-bold text-lg leading-tight">{selectedCompound.name}</h3>
                <Badge className="bg-success-sleek/20 text-success-sleek border-none text-[10px] mt-1">
                  Active Hit
                </Badge>
              </div>
              
              <div className="grid grid-cols-2 gap-4 pt-2">
                {/* Priority Properties */}
                {['pEC50', 'IC50', 'EC50', 'MW', 'LogP', 'PSA', 'Formula'].map(key => {
                  const val = selectedCompound.properties[key];
                  if (val === undefined) return null;
                  return (
                    <div key={key} className="space-y-0.5">
                      <span className="text-[10px] text-text-muted uppercase block">{key}</span>
                      <span className="text-sm font-bold text-accent-primary">
                        {typeof val === 'number' ? val.toFixed(2) : String(val)}
                      </span>
                    </div>
                  );
                })}
                {/* Other Properties */}
                {Object.entries(selectedCompound.properties)
                  .filter(([key]) => !['pEC50', 'IC50', 'MW', 'LogP'].includes(key))
                  .slice(0, 2)
                  .map(([key, val]) => (
                    <div key={key} className="space-y-0.5">
                      <span className="text-[10px] text-text-muted uppercase block">{key}</span>
                      <span className="text-sm font-bold text-accent-primary">
                        {typeof val === 'number' ? val.toFixed(2) : String(val)}
                      </span>
                    </div>
                  ))
                }
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-[10px] uppercase text-text-muted font-bold">Structure-Activity Analysis</Label>
              <p className="text-xs text-text-muted leading-relaxed">
                Compound shows a <strong className="text-success-sleek">high similarity</strong> to the parent scaffold. Identifying scaffold hop opportunities in cluster.
              </p>
            </div>

            <div className="mt-auto pt-6 space-y-3">
              <Button 
                onClick={() => toggleSaveCompound(selectedCompound)}
                className={`w-full font-bold text-xs ${
                  savedCompounds.find(sc => sc.id === selectedCompound.id)
                    ? 'bg-danger-sleek/10 border border-danger-sleek text-danger-sleek hover:bg-danger-sleek hover:text-white'
                    : 'bg-accent-primary text-bg-deep hover:bg-accent-primary/80'
                }`}
              >
                {savedCompounds.find(sc => sc.id === selectedCompound.id) ? 'Remove from Saved' : 'Add to Saved List'}
              </Button>
              <Button className="w-full bg-bg-deep border border-accent-primary text-accent-primary hover:bg-accent-primary hover:text-bg-deep font-bold text-xs">
                Export Dataset (.csv)
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 opacity-30">
            <LayoutDashboard className="w-12 h-12" />
            <p className="text-xs max-w-[160px]">Select a compound to view structural details and SAR analysis.</p>
          </div>
        )}
      </aside>

      {/* Footer */}
      <footer className="col-span-full bg-bg-deep border-t border-border-sleek px-6 flex items-center justify-between text-[10px] text-text-muted font-mono">
        <div className="flex gap-4">
          <span>Viewing: <strong>{compounds.length} compounds</strong></span>
          <span className="border-l border-border-sleek pl-4">Layout: TMAP (MST)</span>
        </div>
        <div>CHEMNEXUS ANALYTICS ENGINE v2.0</div>
      </footer>
    </div>
  );
}
