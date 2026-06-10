import type { Snapshot } from '../store';
import { store } from '../store';
import { LocomotiveIcon, REWARD_LABELS, rewardIcon } from './Icons';

export function RewardModal({ snap }: { snap: Snapshot }) {
  const reward = snap.pendingReward;
  if (!reward) return null;
  return (
    <div className="overlay">
      <div className="panel reward">
        <h2>Week {reward.week} complete</h2>
        <div className="reward-loco">
          <LocomotiveIcon size={30} />
          <span>+1 locomotive added</span>
        </div>
        <p className="reward-hint">Choose one upgrade:</p>
        <div className="reward-options">
          {reward.options.map((kind) => (
            <button key={kind} className="reward-card" onClick={() => store.chooseReward(kind)}>
              {rewardIcon(kind)}
              <span>{REWARD_LABELS[kind]}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function GameOverOverlay({ snap }: { snap: Snapshot }) {
  return (
    <div className="overlay">
      <div className="panel gameover">
        <h2>Your metro closed</h2>
        <p>A station stayed overcrowded for too long.</p>
        <div className="final-score">{snap.score}</div>
        <p className="final-sub">
          passengers carried · {snap.week - 1} {snap.week - 1 === 1 ? 'week' : 'weeks'} survived
        </p>
        <button className="primary" onClick={() => store.restart()}>
          Play again
        </button>
      </div>
    </div>
  );
}

export function StartScreen() {
  return (
    <div className="overlay start">
      <div className="panel start-panel">
        <h1>
          mini <span>metro</span>
        </h1>
        <p className="tagline">an unofficial fan remake — local play only</p>
        <ul className="howto">
          <li>Drag between stations to draw metro lines.</li>
          <li>Passengers are shapes — take them to a matching station.</li>
          <li>Crossing the river costs a tunnel.</li>
          <li>Don't let any station stay overcrowded.</li>
          <li>Each week brings a new locomotive and an upgrade.</li>
        </ul>
        <button className="primary" onClick={() => store.start()}>
          Play
        </button>
      </div>
    </div>
  );
}

export function Toasts({ snap }: { snap: Snapshot }) {
  if (snap.toasts.length === 0) return null;
  return (
    <div className="toasts">
      {snap.toasts.map((t) => (
        <div key={t.id} className="toast">
          {t.msg}
        </div>
      ))}
    </div>
  );
}
