import { useEffect, useRef } from 'react';

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
 * Загружает SoundCloud Widget API один раз.
 * @returns {Promise<void>}
 */
function loadSoundCloudApi() {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.SC?.Widget) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-soundcloud-api="1"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', reject);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://w.soundcloud.com/player/api.js';
    script.dataset.soundcloudApi = '1';
    script.onload = () => resolve();
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

/**
 * Синхронизирует общий SoundCloud-плеер лаунжа для всех игроков.
 * @param {JukeboxState | null} jukeboxState
 */
export function useSoundCloudPlayer(jukeboxState) {
  const iframeRef = useRef(null);
  const widgetRef = useRef(null);
  const lastTrackIdRef = useRef('');

  useEffect(() => {
    loadSoundCloudApi().catch(() => {});
  }, []);

  useEffect(() => {
    const track = jukeboxState?.track;
    if (!track?.permalink || !iframeRef.current) return undefined;

    const trackKey = `${track.id}:${jukeboxState.startedAt}`;
    if (lastTrackIdRef.current === trackKey) return undefined;
    lastTrackIdRef.current = trackKey;

    let cancelled = false;

    /**
     * Запускает трек в iframe SoundCloud.
     */
    async function playTrack() {
      await loadSoundCloudApi();
      if (cancelled || !iframeRef.current || !window.SC?.Widget) return;

      const params = new URLSearchParams({
        url: track.permalink,
        auto_play: 'true',
        hide_related: 'true',
        show_comments: 'false',
        show_user: 'false',
        show_reposts: 'false',
        visual: 'false',
      });

      iframeRef.current.src = `https://w.soundcloud.com/player/?${params.toString()}`;
      widgetRef.current = window.SC.Widget(iframeRef.current);
      widgetRef.current.bind(window.SC.Widget.Events.READY, () => {
        widgetRef.current?.play();
      });
    }

    playTrack();
    return () => {
      cancelled = true;
    };
  }, [jukeboxState]);

  return iframeRef;
}
