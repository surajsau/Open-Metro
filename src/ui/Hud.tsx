import type { Snapshot } from '../store';
import { store } from '../store';
import { PassengerIcon } from './Icons';

export function Hud({ snap }: { snap: Snapshot }) {
  return (
    <>
      <div className="hud score" aria-label="score">
        <PassengerIcon size={16} />
        <span>{snap.score}</span>
      </div>
      <div className="hud clock-panel">
        <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden>
          <circle cx="22" cy="22" r="19" fill="#fff" stroke="#35342F" strokeWidth="3" />
          <line
            x1="22"
            y1="22"
            x2="22"
            y2="7.5"
            stroke="#35342F"
            strokeWidth="3"
            strokeLinecap="round"
            transform={`rotate(${snap.dayFrac * 360} 22 22)`}
          />
          <circle cx="22" cy="22" r="2.4" fill="#35342F" />
        </svg>
        <div className="clock-text">
          <span className="clock-day">{snap.dayName}</span>
          <span className="clock-week">week {snap.week}</span>
        </div>
        <div className="speed-buttons">
          <button
            className={snap.speed === 0 ? 'active' : ''}
            onClick={() => store.togglePause()}
            aria-label="pause"
            title="Pause (also edit calmly while paused)"
          >
            ❚❚
          </button>
          <button className={snap.speed === 1 ? 'active' : ''} onClick={() => store.setSpeed(1)} aria-label="normal speed">
            ▶
          </button>
          <button className={snap.speed === 2 ? 'active' : ''} onClick={() => store.setSpeed(2)} aria-label="fast speed">
            ▶▶
          </button>
        </div>
      </div>
      {snap.mode === 'endless' && !snap.gameOver && (
        <div className="hud endless-hud">
          <span className="endless-badge">∞ endless</span>
          <button className="endrun" onClick={() => store.endRun()}>
            End run
          </button>
        </div>
      )}
    </>
  );
}
