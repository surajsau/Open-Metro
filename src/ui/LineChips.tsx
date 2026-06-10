import { LINE_COLORS, MAX_LINES } from '../game/constants';
import type { Snapshot } from '../store';
import { store } from '../store';

export function LineChips({ snap }: { snap: Snapshot }) {
  const used = new Set(snap.linesInUse);
  // Unused palette ids, in order; the first (lineSlots - used) of them are
  // available to draw with, the rest are locked until rewarded.
  const free = Array.from({ length: MAX_LINES }, (_, id) => id).filter((id) => !used.has(id));
  const availableCount = Math.max(0, snap.lineSlots - used.size);
  const available = new Set(free.slice(0, availableCount));

  return (
    <div className="hud line-chips">
      {Array.from({ length: MAX_LINES }, (_, id) => {
        const color = LINE_COLORS[id];
        if (used.has(id)) {
          const selected = snap.selectedLine === id;
          return (
            <span key={id} className={`chip-wrap${selected ? ' selected' : ''}`}>
              <button
                className="chip used"
                style={{ background: color, borderColor: color }}
                aria-label={`select line`}
                onClick={() => store.selectLine(selected ? null : id)}
              />
              {selected && (
                <button className="chip-delete" aria-label="delete line" onClick={() => store.removeLine(id)}>
                  ×
                </button>
              )}
            </span>
          );
        }
        if (available.has(id)) {
          return <span key={id} className="chip available" style={{ borderColor: color }} title="Drag between stations to use" />;
        }
        return <span key={id} className="chip locked" title="Unlock with a weekly reward" />;
      })}
    </div>
  );
}
