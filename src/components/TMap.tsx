/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useMemo } from 'react';
import * as d3 from 'd3';
import { Compound, Scaffold } from '../types';
import { computeSimilarity, matchesSubstructure } from '../lib/chemistry';

interface TMapProps {
  compounds: Compound[];
  scaffolds: Scaffold[];
  onSelectCompound: (compound: Compound) => void;
  thresholds: { property: string; min?: number; max?: number; color: string }[];
  smartsHighlight?: string;
}

export const TMap: React.FC<TMapProps> = ({ 
  compounds, 
  scaffolds, 
  onSelectCompound,
  thresholds,
  smartsHighlight = ''
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const graphData = useMemo(() => {
    if (scaffolds.length === 0) return { nodes: [], links: [] };

    // Nodes are scaffolds
    const nodes = scaffolds.map((s, i) => ({
      id: s.smiles,
      smiles: s.smiles,
      count: s.compoundIds.length,
      compounds: s.compoundIds.map(id => compounds.find(c => c.id === id)).filter(Boolean) as Compound[],
      index: i
    })).filter(node => node.compounds.length > 0);

    // TMAP Algorithm:
    // 1. Construct k-NN graph (k=10)
    // 2. Compute MST of k-NN graph
    const k = Math.min(10, nodes.length - 1);
    const links: { source: string; target: string; weight: number }[] = [];
    
    if (nodes.length > 1) {
      // 1a. Add structural hierarchy edges (substructure relationships)
      // This ensures the tree follows chemical hierarchy
      for (let i = 0; i < nodes.length; i++) {
        for (let j = 0; j < nodes.length; j++) {
          if (i === j) continue;
          // Check if scaffold i is a substructure of scaffold j
          if (matchesSubstructure(nodes[j].smiles, nodes[i].smiles)) {
            links.push({
              source: nodes[i].id,
              target: nodes[j].id,
              weight: 1.0 // Maximum weight for structural relationships
            });
          }
        }
      }

      // 1b. Add k-NN similarity edges
      nodes.forEach((node, i) => {
        const neighbors: { index: number; sim: number }[] = [];
        const fp1 = node.compounds[0]?.fingerprint || [];
        
        for (let j = 0; j < nodes.length; j++) {
          if (i === j) continue;
          const fp2 = nodes[j].compounds[0]?.fingerprint || [];
          const sim = computeSimilarity(fp1, fp2);
          neighbors.push({ index: j, sim });
        }
        
        // Sort by similarity descending and take top k
        neighbors.sort((a, b) => b.sim - a.sim);
        neighbors.slice(0, k).forEach(neighbor => {
          links.push({
            source: node.id,
            target: nodes[neighbor.index].id,
            weight: neighbor.sim
          });
        });
      });
    }

    const mstLinks = computeMST(nodes, links);

    return { nodes, links: mstLinks };
  }, [scaffolds, compounds]);

  const [dimensions, setDimensions] = React.useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!containerRef.current) return;
    
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        setDimensions({
          width: entries[0].contentRect.width,
          height: entries[0].contentRect.height
        });
      }
    });
    
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current || dimensions.width === 0 || graphData.nodes.length === 0) return;

    const { width, height } = dimensions;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const g = svg.append('g');

    // Zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 10])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    const simulation = d3.forceSimulation(graphData.nodes as any)
      .alphaDecay(0.01) // Slower decay to give more time for nodes to push apart
      .velocityDecay(0.3) // More friction for a more stable layout
      .force('link', d3.forceLink(graphData.links).id((d: any) => d.id).distance(120))
      .force('charge', d3.forceManyBody().strength(-1200).distanceMax(1000))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius((d: any) => Math.sqrt(d.count) * 12 + 35).iterations(4));

    const link = g.append('g')
      .attr('stroke', '#94a3b8')
      .attr('stroke-opacity', 0.2)
      .selectAll('line')
      .data(graphData.links)
      .join('line')
      .attr('stroke-width', (d: any) => Math.sqrt(d.weight) * 2);

    const node = g.append('g')
      .selectAll('g')
      .data(graphData.nodes)
      .join('g')
      .attr('cursor', 'pointer')
      .on('click', (event, d: any) => {
        if (d.compounds.length > 0) {
          onSelectCompound(d.compounds[0]);
        }
      });

    // Draw circles for scaffolds
    node.append('circle')
      .attr('r', (d: any) => Math.sqrt(d.count) * 5 + 5)
      .attr('fill', (d: any) => {
        // Check if any compound in this scaffold meets thresholds
        const meetsThreshold = d.compounds.some((c: Compound) => 
          thresholds.length > 0 && thresholds.every(t => {
            const val = Number(c.properties[t.property]);
            if (isNaN(val)) return false;
            if (t.min !== undefined && val < t.min) return false;
            if (t.max !== undefined && val > t.max) return false;
            return true;
          })
        );

        // SMARTS Match Highlight (Priority)
        if (smartsHighlight.trim()) {
          const hasSmartsMatch = d.compounds.some((c: Compound) => matchesSubstructure(c.smiles, smartsHighlight));
          if (hasSmartsMatch) return '#818cf8'; // accent-secondary
        }

        return meetsThreshold ? '#22c55e' : '#38bdf8';
      })
      .attr('fill-opacity', (d: any) => {
        const hasHighlight = thresholds.length > 0 || smartsHighlight.trim();
        if (!hasHighlight) return 1;

        const meetsThreshold = d.compounds.some((c: Compound) => 
          thresholds.length > 0 && thresholds.every(t => {
            const val = Number(c.properties[t.property]);
            if (isNaN(val)) return false;
            if (t.min !== undefined && val < t.min) return false;
            if (t.max !== undefined && val > t.max) return false;
            return true;
          })
        );

        const hasSmartsMatch = smartsHighlight.trim() && d.compounds.some((c: Compound) => matchesSubstructure(c.smiles, smartsHighlight));
        
        return (meetsThreshold || hasSmartsMatch) ? 1 : 0.15;
      })
      .attr('stroke', (d: any) => {
        const meetsThreshold = d.compounds.some((c: Compound) => 
          thresholds.length > 0 && thresholds.every(t => {
            const val = Number(c.properties[t.property]);
            if (isNaN(val)) return false;
            if (t.min !== undefined && val < t.min) return false;
            if (t.max !== undefined && val > t.max) return false;
            return true;
          })
        );
        const hasSmartsMatch = smartsHighlight.trim() && d.compounds.some((c: Compound) => matchesSubstructure(c.smiles, smartsHighlight));
        return (meetsThreshold || hasSmartsMatch) ? '#fff' : '#334155';
      })
      .attr('stroke-width', (d: any) => {
        const meetsThreshold = d.compounds.some((c: Compound) => 
          thresholds.length > 0 && thresholds.every(t => {
            const val = Number(c.properties[t.property]);
            if (isNaN(val)) return false;
            if (t.min !== undefined && val < t.min) return false;
            if (t.max !== undefined && val > t.max) return false;
            return true;
          })
        );
        const hasSmartsMatch = smartsHighlight.trim() && d.compounds.some((c: Compound) => matchesSubstructure(c.smiles, smartsHighlight));
        return (meetsThreshold || hasSmartsMatch) ? 2 : 1;
      })
      .style('filter', (d: any) => {
        const meetsThreshold = d.compounds.some((c: Compound) => 
          thresholds.length > 0 && thresholds.every(t => {
            const val = Number(c.properties[t.property]);
            if (isNaN(val)) return false;
            if (t.min !== undefined && val < t.min) return false;
            if (t.max !== undefined && val > t.max) return false;
            return true;
          })
        );
        const hasSmartsMatch = smartsHighlight.trim() && d.compounds.some((c: Compound) => matchesSubstructure(c.smiles, smartsHighlight));
        
        if (hasSmartsMatch) return 'drop-shadow(0 0 8px #818cf8)';
        if (meetsThreshold) return 'drop-shadow(0 0 8px #22c55e)';
        return 'none';
      });

    // Add labels
    node.append('text')
      .attr('dy', '.35em')
      .attr('text-anchor', 'middle')
      .text((d: any) => d.count > 1 ? `${d.count}` : '')
      .attr('font-size', '10px')
      .attr('font-weight', 'bold')
      .attr('fill', '#0f172a');

    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      node
        .attr('transform', (d: any) => `translate(${d.x},${d.y})`);
    });

    // Anchor the simulation after it cools down to prevent movement during updates
    simulation.alphaMin(0.01);
    simulation.on('end', () => {
      graphData.nodes.forEach((n: any) => {
        n.fx = n.x;
        n.fy = n.y;
      });
    });

    return () => simulation.stop();
  }, [graphData, onSelectCompound, dimensions]);

  // Separate effect for highlighting to preserve zoom state
  useEffect(() => {
    if (!svgRef.current || graphData.nodes.length === 0) return;
    
    const svg = d3.select(svgRef.current);
    const circles = svg.selectAll('circle');

    circles
      .transition()
      .duration(300)
      .attr('fill', (d: any) => {
        // Check if any compound in this scaffold meets thresholds
        const meetsThreshold = d.compounds.some((c: Compound) => 
          thresholds.length > 0 && thresholds.every(t => {
            const val = Number(c.properties[t.property]);
            if (isNaN(val)) return false;
            if (t.min !== undefined && val < t.min) return false;
            if (t.max !== undefined && val > t.max) return false;
            return true;
          })
        );

        // SMARTS Match Highlight (Priority)
        if (smartsHighlight.trim()) {
          const hasSmartsMatch = d.compounds.some((c: Compound) => matchesSubstructure(c.smiles, smartsHighlight));
          if (hasSmartsMatch) return '#818cf8'; // accent-secondary
        }

        return meetsThreshold ? '#22c55e' : '#38bdf8';
      })
      .attr('fill-opacity', (d: any) => {
        const hasHighlight = thresholds.length > 0 || smartsHighlight.trim();
        if (!hasHighlight) return 1;

        const meetsThreshold = d.compounds.some((c: Compound) => 
          thresholds.length > 0 && thresholds.every(t => {
            const val = Number(c.properties[t.property]);
            if (isNaN(val)) return false;
            if (t.min !== undefined && val < t.min) return false;
            if (t.max !== undefined && val > t.max) return false;
            return true;
          })
        );

        const hasSmartsMatch = smartsHighlight.trim() && d.compounds.some((c: Compound) => matchesSubstructure(c.smiles, smartsHighlight));
        
        return (meetsThreshold || hasSmartsMatch) ? 1 : 0.15;
      })
      .attr('stroke', (d: any) => {
        const meetsThreshold = d.compounds.some((c: Compound) => 
          thresholds.length > 0 && thresholds.every(t => {
            const val = Number(c.properties[t.property]);
            if (isNaN(val)) return false;
            if (t.min !== undefined && val < t.min) return false;
            if (t.max !== undefined && val > t.max) return false;
            return true;
          })
        );
        const hasSmartsMatch = smartsHighlight.trim() && d.compounds.some((c: Compound) => matchesSubstructure(c.smiles, smartsHighlight));
        return (meetsThreshold || hasSmartsMatch) ? '#fff' : '#334155';
      })
      .attr('stroke-width', (d: any) => {
        const meetsThreshold = d.compounds.some((c: Compound) => 
          thresholds.length > 0 && thresholds.every(t => {
            const val = Number(c.properties[t.property]);
            if (isNaN(val)) return false;
            if (t.min !== undefined && val < t.min) return false;
            if (t.max !== undefined && val > t.max) return false;
            return true;
          })
        );
        const hasSmartsMatch = smartsHighlight.trim() && d.compounds.some((c: Compound) => matchesSubstructure(c.smiles, smartsHighlight));
        return (meetsThreshold || hasSmartsMatch) ? 2 : 1;
      })
      .style('filter', (d: any) => {
        const meetsThreshold = d.compounds.some((c: Compound) => 
          thresholds.length > 0 && thresholds.every(t => {
            const val = Number(c.properties[t.property]);
            if (isNaN(val)) return false;
            if (t.min !== undefined && val < t.min) return false;
            if (t.max !== undefined && val > t.max) return false;
            return true;
          })
        );
        const hasSmartsMatch = smartsHighlight.trim() && d.compounds.some((c: Compound) => matchesSubstructure(c.smiles, smartsHighlight));
        
        if (hasSmartsMatch) return 'drop-shadow(0 0 8px #818cf8)';
        if (meetsThreshold) return 'drop-shadow(0 0 8px #22c55e)';
        return 'none';
      });
  }, [thresholds, smartsHighlight, graphData]);

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden bg-[radial-gradient(circle_at_center,#1e293b_0%,#0f172a_100%)]">
      <svg ref={svgRef} className="w-full h-full" />
      
      <div className="absolute bottom-6 left-6 bg-bg-deep/80 backdrop-blur p-4 rounded-xl border border-border-sleek space-y-2">
        <div className="flex items-center gap-3 text-[10px] font-bold tracking-wider text-text-muted uppercase mb-1">
          TMAP Legend
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <div className="w-2.5 h-2.5 rounded-full bg-success-sleek shadow-[0_0_8px_#22c55e]" />
          <span>Filtered Hits</span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <div className="w-2.5 h-2.5 rounded-full bg-accent-secondary shadow-[0_0_8px_#818cf8]" />
          <span>Substructure Match</span>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <div className="w-2.5 h-2.5 rounded-full bg-accent-primary shadow-[0_0_8px_#38bdf8]" />
          <span>Chemical Scaffold</span>
        </div>
      </div>

      <div className="absolute top-6 left-6 bg-bg-deep/40 backdrop-blur px-3 py-1.5 rounded-full border border-border-sleek/50 text-[10px] font-mono text-text-muted uppercase tracking-widest">
        Chemical Space MST Layout
      </div>
    </div>
  );
};

// Helper to compute MST (Kruskal's)
function computeMST(nodes: any[], links: any[]) {
  const sortedLinks = [...links].sort((a, b) => b.weight - a.weight);
  const parent = new Map<string, string>();
  
  function find(i: string): string {
    if (!parent.has(i)) parent.set(i, i);
    if (parent.get(i) === i) return i;
    const root = find(parent.get(i)!);
    parent.set(i, root);
    return root;
  }

  function union(i: string, j: string) {
    const rootI = find(i);
    const rootJ = find(j);
    if (rootI !== rootJ) {
      parent.set(rootI, rootJ);
      return true;
    }
    return false;
  }

  const mst: any[] = [];
  for (const link of sortedLinks) {
    if (union(link.source, link.target)) {
      mst.push(link);
    }
  }

  // If the graph is disconnected, we might want to add some extra links
  // or just leave it as multiple components
  return mst;
}
