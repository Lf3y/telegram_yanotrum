import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { useVisualViewportInset } from '../../hooks/useVisualViewportInset';

/**
 * @typedef {Object} JukeboxTrack
 * @property {string} id
 * @property {string} title
 * @property {string} artist
 * @property {string} permalink
 * @property {string} artworkUrl
 * @property {number} durationMs
 */

/**
 * @typedef {Object} JukeboxState
 * @property {JukeboxTrack | null} track
 * @property {string} queuedBy
 * @property {string} queuedByName
 * @property {number} startedAt
 */

/**
 * Панель музыкальной коробки лаунжа.
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   balance: number,
 *   songCost: number,
 *   userId: string | number,
 *   playerName: string,
 *   jukeboxState: JukeboxState | null,
 *   onQueued: (balance: number, jukebox?: JukeboxState | null) => void,
 *   onUserActivate?: () => void,
 * }} props
 */
export function JukeboxPanel({
  open,
  onClose,
  balance,
  songCost,
  userId,
  playerName,
  jukeboxState,
  onQueued,
  onUserActivate,
}) {
  const [query, setQuery] = useState('');
  const [tracks, setTracks] = useState(/** @type {JukeboxTrack[]} */ ([]));
  const [loading, setLoading] = useState(false);
  const [queueingId, setQueueingId] = useState('');
  const [error, setError] = useState('');
  const searchInputRef = useRef(/** @type {HTMLInputElement | null} */ (null));
  const viewport = useVisualViewportInset(open);
  const keyboardOpen = viewport.keyboardInset > 64;

  useEffect(() => {
    if (!open) return undefined;

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = overflow;
    };
  }, [open]);

  /**
   * Поднимает поле поиска над экранной клавиатурой на мобильных.
   */
  function handleSearchFocus() {
    window.setTimeout(() => {
      searchInputRef.current?.scrollIntoView({ block: 'center', inline: 'nearest' });
    }, 120);
  }

  if (!open) return null;

  /**
   * Ищет треки в SoundCloud через backend.
   * @param {React.FormEvent<HTMLFormElement>} event
   */
  async function handleSearch(event) {
    event.preventDefault();
    const q = query.trim();
    if (!q) return;

    setLoading(true);
    setError('');
    try {
      const res = await apiFetch(`/api/lounge/jukebox/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setTracks(Array.isArray(data.tracks) ? data.tracks : []);
    } catch (e) {
      setTracks([]);
      setError(String(e.message || 'Не удалось найти треки'));
    }
    setLoading(false);
  }

  /**
   * Ставит трек в общий плеер за монеты.
   * @param {JukeboxTrack} track
   */
  async function handleQueue(track) {
    if (balance < songCost) {
      setError(`Нужно ${songCost} монет, у тебя ${balance}`);
      return;
    }

    onUserActivate?.();
    setQueueingId(track.id);
    setError('');
    try {
      const res = await apiFetch('/api/lounge/jukebox/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegram_user_id: String(userId),
          player_name: playerName,
          track,
        }),
      });
      const data = await res.json();
      onQueued(Number(data.balance || 0), data.jukebox || null);
      onClose();
    } catch (e) {
      setError(String(e.message || 'Не удалось поставить трек'));
    }
    setQueueingId('');
  }

  return (
    <div
      className={`lounge-jukebox-backdrop${keyboardOpen ? ' lounge-jukebox-backdrop--keyboard' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Музыкальная коробка"
      style={{
        top: viewport.offsetTop,
        left: viewport.offsetLeft,
        width: viewport.width,
        height: viewport.height,
      }}
      onTouchMove={(event) => event.stopPropagation()}
    >
      <div
        className="lounge-jukebox card"
        onTouchMove={(event) => event.stopPropagation()}
      >
        <div className="lounge-jukebox-head">
          <div>
            <div className="lounge-jukebox-title">Музыкальная коробка</div>
            <div className="lounge-jukebox-sub">
              Баланс: {balance} · трек: {songCost} монет
            </div>
          </div>
          <button type="button" className="lounge-jukebox-close" onClick={onClose}>✕</button>
        </div>

        {jukeboxState?.track && (
          <div className="lounge-jukebox-now">
            Сейчас: {jukeboxState.track.title} — {jukeboxState.track.artist}
            {jukeboxState.queuedByName ? ` · от ${jukeboxState.queuedByName}` : ''}
          </div>
        )}

        <form className="lounge-jukebox-search" onSubmit={handleSearch}>
          <input
            ref={searchInputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={handleSearchFocus}
            placeholder="Найти трек в SoundCloud..."
            maxLength={80}
            enterKeyHint="search"
            autoComplete="off"
          />
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Ищем…' : 'Найти'}
          </button>
        </form>

        {error && <div className="catalog-error-banner lounge-jukebox-error">{error}</div>}

        <div className="lounge-jukebox-results">
          {tracks.length === 0 && !loading && (
            <div className="lounge-jukebox-empty">Найди трек и поставь его для всех в лаунже</div>
          )}
          {tracks.map((track) => (
            <button
              key={track.id}
              type="button"
              className="lounge-jukebox-track"
              disabled={queueingId === track.id}
              onClick={() => handleQueue(track)}
            >
              {track.artworkUrl ? (
                <img src={track.artworkUrl} alt="" className="lounge-jukebox-cover" />
              ) : (
                <div className="lounge-jukebox-cover lounge-jukebox-cover--empty">♪</div>
              )}
              <div className="lounge-jukebox-track-meta">
                <div className="lounge-jukebox-track-title">{track.title}</div>
                <div className="lounge-jukebox-track-artist">{track.artist}</div>
              </div>
              <div className="lounge-jukebox-track-cost">{songCost} 🪙</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
