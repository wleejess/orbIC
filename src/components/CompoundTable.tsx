/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Compound } from '../types';
import { SmilesRenderer } from './SmilesRenderer';
import { Search } from 'lucide-react';
import { getMatchingAtoms } from '../lib/chemistry';

// Row height must be fixed for the virtualiser to work correctly.
// Keep in sync with the actual rendered row height (structure cell is 60px + padding = 76px).
const ROW_HEIGHT = 76;

interface CompoundTableProps {
  compounds: Compound[];
  onSelect: (compound: Compound) => void;
  smartsHighlight?: string;
  thresholds?: { property: string; min?: number; max?: number; color: string }[];
}

export const CompoundTable: React.FC<CompoundTableProps> = ({
  compounds,
  onSelect,
  smartsHighlight = '',
  thresholds = [],
}) => {
  const [search, setSearch] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    return compounds.filter(c => {
      if (!c) return false;
      return (
        c.name?.toLowerCase().includes(search.toLowerCase()) ||
        c.smiles.toLowerCase().includes(search.toLowerCase()) ||
        Object.values(c.properties).some(v => String(v).toLowerCase().includes(search.toLowerCase()))
      );
    });
  }, [compounds, search]);

  const propertyKeys = useMemo(() => {
    const keys = new Set<string>();
    compounds.forEach(c => {
      if (c && c.properties) {
        Object.keys(c.properties).forEach(k => keys.add(k));
      }
    });

    const priority = ['pEC50', 'IC50', 'EC50', 'Formula', 'MW', 'LogP', 'PSA'];
    const sortedKeys = Array.from(keys).sort((a, b) => {
      const aIdx = priority.indexOf(a);
      const bIdx = priority.indexOf(b);
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return a.localeCompare(b);
    });

    return sortedKeys.slice(0, 6);
  }, [compounds]);

  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalHeight = rowVirtualizer.getTotalSize();

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <Input
          placeholder="Search compounds, properties, SMILES..."
          className="pl-10 bg-bg-surface border-border-sleek text-text-main focus-visible:ring-accent-primary"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="flex-1 border border-border-sleek rounded-md overflow-hidden bg-bg-surface">
        {/* Scrollable container passed to the virtualiser */}
        <div ref={scrollRef} className="h-full overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-bg-deep z-10">
              <TableRow className="border-border-sleek hover:bg-transparent">
                <TableHead className="w-[100px] text-text-muted font-bold uppercase text-[10px]">Structure</TableHead>
                <TableHead className="text-text-muted font-bold uppercase text-[10px]">Name</TableHead>
                {propertyKeys.map(k => (
                  <TableHead key={k} className="text-text-muted font-bold uppercase text-[10px]">{k}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={propertyKeys.length + 2} className="h-24 text-center text-text-muted">
                    No compounds found.
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {/* Top spacer */}
                  {virtualRows.length > 0 && virtualRows[0].start > 0 && (
                    <TableRow style={{ height: virtualRows[0].start }}>
                      <TableCell colSpan={propertyKeys.length + 2} className="p-0 border-0" />
                    </TableRow>
                  )}

                  {virtualRows.map(virtualRow => {
                    const c = filtered[virtualRow.index];
                    const highlightAtoms = smartsHighlight.trim()
                      ? getMatchingAtoms(c.smiles, smartsHighlight)
                      : [];
                    const meetsThresholds =
                      thresholds.length > 0 &&
                      thresholds.every(t => {
                        const val = Number(c.properties[t.property]);
                        return !isNaN(val) && (t.min === undefined || val >= t.min) && (t.max === undefined || val <= t.max);
                      });

                    return (
                      <TableRow
                        key={c.id}
                        data-index={virtualRow.index}
                        style={{ height: ROW_HEIGHT }}
                        className={`cursor-pointer border-border-sleek transition-colors ${
                          meetsThresholds ? 'bg-success-sleek/10 hover:bg-success-sleek/20' : 'hover:bg-bg-deep'
                        }`}
                        onClick={() => onSelect(c)}
                      >
                        <TableCell className="bg-white/5">
                          <div className="bg-white rounded p-1">
                            <SmilesRenderer
                              smiles={c.smiles}
                              width={80}
                              height={60}
                              highlightAtoms={highlightAtoms}
                            />
                          </div>
                        </TableCell>
                        <TableCell className="font-medium text-text-main">{c.name}</TableCell>
                        {propertyKeys.map(k => (
                          <TableCell key={k} className="text-xs text-accent-primary font-mono">
                            {typeof c.properties[k] === 'number'
                              ? (c.properties[k] as number).toFixed(2)
                              : String(c.properties[k] || '-')}
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })}

                  {/* Bottom spacer */}
                  {virtualRows.length > 0 && (() => {
                    const lastRow = virtualRows[virtualRows.length - 1];
                    const bottomSpace = totalHeight - lastRow.end;
                    return bottomSpace > 0 ? (
                      <TableRow style={{ height: bottomSpace }}>
                        <TableCell colSpan={propertyKeys.length + 2} className="p-0 border-0" />
                      </TableRow>
                    ) : null;
                  })()}
                </>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
};
