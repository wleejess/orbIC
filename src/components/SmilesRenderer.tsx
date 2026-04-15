/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import SmiDrawer from 'smiles-drawer';

interface SmilesRendererProps {
  smiles: string;
  width?: number;
  height?: number;
  className?: string;
  highlightAtoms?: number[];
}

export const SmilesRenderer: React.FC<SmilesRendererProps> = ({ 
  smiles, 
  width = 150, 
  height = 100,
  className,
  highlightAtoms = []
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !smiles || smiles === 'Unknown') return;

    // Basic check to see if it's likely a SMILES string
    // SMILES shouldn't have spaces and should contain common atoms
    if (smiles.includes(' ') || (!smiles.includes('C') && !smiles.includes('c') && !smiles.includes('N') && !smiles.includes('O') && !smiles.includes('['))) {
      return;
    }

    try {
      const options = { 
        width, 
        height,
        highlightColor: '#38bdf8',
        highlightOpacity: 0.3
      };
      const smilesDrawer = new (SmiDrawer as any).Drawer(options);
      
      (SmiDrawer as any).parse(smiles, (tree: any) => {
        smilesDrawer.draw(tree, canvasRef.current, 'light', false, highlightAtoms);
      }, (err: any) => {
        console.error('SmilesDrawer parse error:', err);
      });
    } catch (e) {
      console.error('Error rendering SMILES:', smiles, e);
    }
  }, [smiles, width, height, highlightAtoms]);

  return (
    <canvas 
      ref={canvasRef} 
      width={width} 
      height={height} 
      className={className}
      style={{ maxWidth: '100%', height: 'auto' }}
    />
  );
};
