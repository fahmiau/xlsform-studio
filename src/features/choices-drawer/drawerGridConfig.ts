/** Compact grid config for the Choices Drawer (AD-13). */
import type { SheetGridConfig } from '@/features/grid/columns';

export const DRAWER_GRID_CONFIG: SheetGridConfig = {
  sheet: 'choices',
  frozenBases: ['label', 'name'],
  defaultWidthByBase: { label: 220, name: 130 },
  structural: false,
};
