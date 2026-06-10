import { CITIES } from '../game/cities';
import type { Snapshot } from '../store';
import { bestScoreFor, store } from '../store';
import { LocomotiveIcon, NewLineIcon, REWARD_LABELS, rewardIcon } from './Icons';

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
        {reward.unlockedLine && (
          <div className="reward-loco unlocked">
            <NewLineIcon size={24} />
            <span>New line unlocked!</span>
          </div>
        )}
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
        {snap.best > 0 && (
          <p className="final-best">
            best in {snap.cityName}: {snap.best}
          </p>
        )}
        <div className="button-row">
          <button className="primary" onClick={() => store.restart()}>
            Play again
          </button>
          <button className="secondary" onClick={() => store.toMenu()}>
            Change city
          </button>
        </div>
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
          <li>Crossing water costs a tunnel.</li>
          <li>Don't let any station stay overcrowded.</li>
          <li>Each week brings a locomotive, an upgrade — and every other week a new line.</li>
        </ul>
        <div className="city-grid">
          {CITIES.map((city) => {
            const best = bestScoreFor(city.id);
            return (
              <button key={city.id} className="city-card" onClick={() => store.startCity(city.id)}>
                <span className="city-top">
                  <span className="city-name">{city.name}</span>
                  <span className="city-dots" title={`difficulty ${city.difficulty}/3`}>
                    {'●'.repeat(city.difficulty)}
                    {'○'.repeat(3 - city.difficulty)}
                  </span>
                </span>
                <span className="city-blurb">{city.blurb}</span>
                {best > 0 && <span className="city-best">best {best}</span>}
              </button>
            );
          })}
        </div>
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
