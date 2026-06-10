import type { Vec } from '../game/types';

export type InventoryItem = 'locomotive' | 'carriage' | 'interchange';

export type DropTarget = { kind: 'line'; lineId: number } | { kind: 'station'; stationId: number } | null;

export type DragState =
  | { mode: 'newLine'; colorId: number; chain: number[]; isLoop: boolean; cursor: Vec; valid: boolean }
  | {
      mode: 'extend';
      lineId: number;
      grabbedEnd: 'head' | 'tail';
      chain: number[]; // oriented so the grabbed (growing) end is last
      isLoop: boolean;
      cursor: Vec;
      valid: boolean;
    }
  | { mode: 'insert'; lineId: number; legIndex: number; hoverStation: number | null; cursor: Vec; valid: boolean }
  | { mode: 'inventory'; item: InventoryItem; cursor: Vec; target: DropTarget };
