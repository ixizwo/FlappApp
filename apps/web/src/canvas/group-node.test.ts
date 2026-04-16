import { describe, expect, it } from 'vitest';
import { __kindPaletteForTests } from './group-node.tsx';

/**
 * Phase 5 — GroupNode kind palette mapping. Pins the colours so we can
 * tell VPC from REGION from ENV from LOGICAL at a glance.
 */
describe('GroupNode kindPalette', () => {
  it('VPC uses cyan', () => {
    const p = __kindPaletteForTests('VPC');
    expect(p.border).toContain('cyan');
    expect(p.label).toContain('cyan');
  });

  it('REGION uses purple', () => {
    const p = __kindPaletteForTests('REGION');
    expect(p.border).toContain('purple');
  });

  it('ENV uses amber', () => {
    const p = __kindPaletteForTests('ENV');
    expect(p.border).toContain('amber');
  });

  it('LOGICAL uses neutral surface', () => {
    const p = __kindPaletteForTests('LOGICAL');
    expect(p.border).toContain('surface');
  });
});
