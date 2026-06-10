import type { InventoryItem } from '../input/dragState';
import type { Snapshot } from '../store';
import { CarriageIcon, InterchangeIcon, LocomotiveIcon, TunnelIcon } from './Icons';

interface Props {
  snap: Snapshot;
  onItemDrag: (item: InventoryItem, e: React.PointerEvent) => void;
}

export function InventoryBar({ snap, onItemDrag }: Props) {
  const items: { item: InventoryItem; count: number; icon: React.ReactNode; label: string }[] = [
    { item: 'locomotive', count: snap.locomotives, icon: <LocomotiveIcon />, label: 'Locomotive — drag onto a line' },
    { item: 'carriage', count: snap.carriages, icon: <CarriageIcon />, label: 'Carriage — drag onto a line' },
    { item: 'interchange', count: snap.interchanges, icon: <InterchangeIcon />, label: 'Interchange — drag onto a station' },
  ];
  return (
    <div className="hud inventory">
      {items.map(({ item, count, icon, label }) => (
        <button
          key={item}
          className="inv-item"
          disabled={count === 0}
          title={label}
          onPointerDown={(e) => {
            if (count > 0) onItemDrag(item, e);
          }}
        >
          {icon}
          <span className="inv-count">×{count}</span>
        </button>
      ))}
      <div className="inv-item passive" title="Tunnels free / owned">
        <TunnelIcon />
        <span className="inv-count">
          {snap.tunnelsFree}/{snap.tunnels}
        </span>
      </div>
    </div>
  );
}
