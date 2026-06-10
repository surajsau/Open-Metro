import type { RewardKind } from '../game/types';

const INK = '#35342F';

export function PassengerIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden>
      <circle cx="7" cy="4" r="3" fill={INK} />
      <path d="M2 13 Q2 8.5 7 8.5 Q12 8.5 12 13 Z" fill={INK} />
    </svg>
  );
}

export function LocomotiveIcon({ size = 26, color = INK }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size * 0.55} viewBox="0 0 26 14" aria-hidden>
      <rect x="1" y="1" width="24" height="12" rx="4" fill={color} />
    </svg>
  );
}

export function CarriageIcon({ size = 22, color = INK }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size * 0.55} viewBox="0 0 22 12" aria-hidden>
      <rect x="1" y="1" width="20" height="10" rx="3" fill="none" stroke={color} strokeWidth="2.4" />
    </svg>
  );
}

export function TunnelIcon({ size = 22, color = INK }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden>
      <path d="M3 19 V11 A8 8 0 0 1 19 11 V19" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" />
      <path d="M7 19 V12 A4 4 0 0 1 15 12 V19" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function InterchangeIcon({ size = 22, color = INK }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden>
      <circle cx="11" cy="11" r="8.5" fill="#fff" stroke={color} strokeWidth="3" />
      <circle cx="11" cy="11" r="3.5" fill="none" stroke={color} strokeWidth="2.4" />
    </svg>
  );
}

export function NewLineIcon({ size = 26, color = '#00843D' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" aria-hidden>
      <path d="M3 20 L11 12 L23 12" fill="none" stroke={color} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="3" cy="20" r="3" fill={color} />
      <circle cx="23" cy="12" r="3" fill={color} />
    </svg>
  );
}

export function rewardIcon(kind: RewardKind) {
  switch (kind) {
    case 'line':
      return <NewLineIcon size={34} />;
    case 'tunnels':
      return <TunnelIcon size={34} />;
    case 'carriage':
      return <CarriageIcon size={34} />;
    case 'interchange':
      return <InterchangeIcon size={34} />;
  }
}

export const REWARD_LABELS: Record<RewardKind, string> = {
  line: 'New line',
  tunnels: '2 tunnels',
  carriage: 'Carriage',
  interchange: 'Interchange',
};
