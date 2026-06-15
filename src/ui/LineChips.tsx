import { FREE_LINE_UNLOCK_UNTIL, LINE_COLORS, MAX_LINES } from '../game/constants';
import type { Snapshot } from '../store';
import { store } from '../store';

// Given the current number of unlocked slots and the current week, compute how
// many more weeks until the k-th locked slot (0-indexed from current slots) will
// be auto-unlocked. Returns 0 if it's unlocked now, or Infinity if capped.
// Unlock schedule (ENG-12/GD-35): every week while slots < FREE_LINE_UNLOCK_UNTIL,
// then every even week up to MAX_LINES.
function weeksUntilSlot(currentSlots: number, targetSlotIndex: number, currentWeek: number): number {
  if (currentSlots + targetSlotIndex >= MAX_LINES) return Infinity;
  let slots = currentSlots;
  let week = currentWeek;
  let needed = targetSlotIndex + 1; // how many more unlocks needed
  const MAX_SEARCH = 40;
  for (let i = 0; i < MAX_SEARCH; i++) {
    week++;
    if (slots < MAX_LINES) {
      const willUnlock = slots < FREE_LINE_UNLOCK_UNTIL || week % 2 === 0;
      if (willUnlock) {
        slots++;
        needed--;
        if (needed <= 0) return week - currentWeek;
      }
    }
  }
  return Infinity;
}

export function LineChips({ snap }: { snap: Snapshot }) {
  const used = new Set(snap.linesInUse);
  // Unused palette ids, in order; the first (lineSlots - used) of them are
  // available to draw with, the rest are locked until rewarded.
  const free = Array.from({ length: MAX_LINES }, (_, id) => id).filter((id) => !used.has(id));
  const availableCount = Math.max(0, snap.lineSlots - used.size);
  const available = new Set(free.slice(0, availableCount));
  const locked = free.slice(availableCount);

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
        // Locked chip: show weeks until auto-unlock (UI-17).
        const lockedIndex = locked.indexOf(id);
        const weeksLeft = lockedIndex >= 0
          ? weeksUntilSlot(snap.lineSlots, lockedIndex, snap.week)
          : Infinity;
        const label = weeksLeft === Infinity || weeksLeft > 5 ? '5+' : String(weeksLeft);
        return (
          <span key={id} className="chip locked" title={`Unlocks in ~${label} week(s)`}>
            <span className="chip-countdown">{label}</span>
          </span>
        );
      })}
    </div>
  );
}
