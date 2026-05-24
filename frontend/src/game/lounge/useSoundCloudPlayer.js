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
 * @param {{ onFinished?: () => void }} [options]
 */
export function useSoundCloudPlayer(jukeboxState, options = {}) {
  const onFinishedRef = useRef(options.onFinished);
  const iframeRef = useRef(null);
  const widgetRef = useRef(null);
  const lastTrackKeyRef = useRef('');
  const finishedTrackKeyRef = useRef('');

  useEffect(() => {
    onFinishedRef.current = options.onFinished;
  }, [options.onFinished]);

  useEffect(() => {
    loadSoundCloudApi().catch(() => {});
  }, []);

  useEffect(() => {
    const track = jukeboxState?.track;
    if (!track?.permalink || !iframeRef.current) {
      lastTrackKeyRef.current = '';
      finishedTrackKeyRef.current = '';
      widgetRef.current?.pause();
      return undefined;
    }

    const startedAt = Number(jukeboxState.startedAt || 0);
    const durationMs = Number(track.durationMs || 0);
    const offsetMs = Math.max(0, Date.now() - startedAt);
    const trackKey = `${track.id}:${startedAt}`;

    if (durationMs > 0 && offsetMs >= durationMs) {
      lastTrackKeyRef.current = '';
      widgetRef.current?.pause();
      onFinishedRef.current?.();
      return undefined;
    }

    if (lastTrackKeyRef.current === trackKey && widgetRef.current) {
      return undefined;
    }

    lastTrackKeyRef.current = trackKey;
    finishedTrackKeyRef.current = '';
    let cancelled = false;

    /**
     * Запускает трек в iframe SoundCloud с синхронизацией по startedAt.
     */
    async function playTrack() {
      await loadSoundCloudApi();
      if (cancelled || !iframeRef.current || !window.SC?.Widget) return;

      const params = new URLSearchParams({
        url: track.permalink,
        auto_play: 'false',
        hide_related: 'true',
        show_comments: 'false',
        show_user: 'false',
        show_reposts: 'false',
        show_teaser: 'false',
        visual: 'false',
      });

      iframeRef.current.src = `https://w.soundcloud.com/player/?${params.toString()}`;
      const widget = window.SC.Widget(iframeRef.current);
      widgetRef.current = widget;

      widget.bind(window.SC.Widget.Events.READY, () => {
        if (cancelled) return;
        if (offsetMs > 0) {
          widget.seekTo(offsetMs);
        }
        widget.play();
      });

      widget.bind(window.SC.Widget.Events.FINISH, () => {
        widget.pause();
        if (finishedTrackKeyRef.current === trackKey) return;
        finishedTrackKeyRef.current = trackKey;
        onFinishedRef.current?.();
      });
    }

    playTrack();
    return () => {
      cancelled = true;
    };
  }, [jukeboxState]);

  return iframeRef;
}
