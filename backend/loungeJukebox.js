/** @typedef {Object} JukeboxTrack
 * @property {string} id
 * @property {string} title
 * @property {string} artist
 * @property {string} permalink
 * @property {string} artworkUrl
 * @property {number} durationMs
 */

/** @typedef {Object} JukeboxState
 * @property {JukeboxTrack | null} track
 * @property {string} queuedBy
 * @property {string} queuedByName
 * @property {number} startedAt
 */

/** @type {JukeboxState} */
let jukeboxState = {
  track: null,
  queuedBy: '',
  queuedByName: '',
  startedAt: 0,
};

/**
 * @returns {JukeboxState}
 */
function emptyJukeboxState() {
  return {
    track: null,
    queuedBy: '',
    queuedByName: '',
    startedAt: 0,
  };
}

/**
 * Проверяет, истёк ли трек по длительности.
 * @param {JukeboxState} state
 * @returns {boolean}
 */
function isJukeboxTrackExpired(state) {
  if (!state.track) return false;
  const durationMs = Number(state.track.durationMs || 0);
  if (!durationMs) return false;
  return Date.now() - Number(state.startedAt || 0) >= durationMs;
}

/** @type {((state: JukeboxState) => void) | null} */
let broadcastHandler = null;

/**
 * Подписывает broadcast jukebox-состояния в Socket.IO.
 * @param {(state: JukeboxState) => void} handler
 */
export function setJukeboxBroadcast(handler) {
  broadcastHandler = handler;
}

/**
 * @returns {JukeboxState}
 */
export function getJukeboxState() {
  if (isJukeboxTrackExpired(jukeboxState)) {
    jukeboxState = emptyJukeboxState();
  }
  return jukeboxState;
}

/**
 * Очищает текущий трек в jukebox.
 */
export function clearJukeboxTrack() {
  if (!jukeboxState.track) return;
  jukeboxState = emptyJukeboxState();
  broadcastHandler?.(jukeboxState);
}

/**
 * Ставит трек в общий плеер лаунжа.
 * @param {JukeboxTrack} track
 * @param {{ id: string, name: string }} queuedBy
 */
export function queueJukeboxTrack(track, queuedBy) {
  jukeboxState = {
    track,
    queuedBy: String(queuedBy.id),
    queuedByName: String(queuedBy.name || 'Игрок'),
    startedAt: Date.now(),
  };
  broadcastHandler?.(jukeboxState);
}

/**
 * Ищет треки в SoundCloud.
 * @param {string} query
 * @returns {Promise<JukeboxTrack[]>}
 */
export async function searchSoundCloudTracks(query) {
  const clientId = String(process.env.SOUNDCLOUD_CLIENT_ID || '').trim();
  if (!clientId) {
    const err = new Error('SoundCloud не настроен на сервере (SOUNDCLOUD_CLIENT_ID)');
    err.code = 'SOUNDCLOUD_NOT_CONFIGURED';
    throw err;
  }

  const q = String(query || '').trim();
  if (!q) return [];

  const url = new URL('https://api-v2.soundcloud.com/search/tracks');
  url.searchParams.set('q', q);
  url.searchParams.set('limit', '8');
  url.searchParams.set('client_id', clientId);

  const res = await fetch(url);
  if (!res.ok) {
    const err = new Error('SoundCloud search failed');
    err.code = 'SOUNDCLOUD_SEARCH_FAILED';
    throw err;
  }

  const data = await res.json();
  const collection = Array.isArray(data?.collection) ? data.collection : [];
  return collection
    .filter((item) => item?.permalink_url)
    .map((item) => ({
      id: String(item.id),
      title: String(item.title || 'Без названия'),
      artist: String(item.user?.username || item.user?.full_name || 'SoundCloud'),
      permalink: String(item.permalink_url),
      artworkUrl: String(item.artwork_url || item.user?.avatar_url || ''),
      durationMs: Number(item.duration || 0),
    }));
}
