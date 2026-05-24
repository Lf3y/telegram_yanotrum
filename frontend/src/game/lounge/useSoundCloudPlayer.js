import { useCallback, useEffect, useRef } from 'react';

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
 * @typedef {Object} SoundCloudWidget
 * @property {(event: string, listener: () => void) => void} bind
 * @property {() => void} play
 * @property {() => void} pause
 * @property {(ms: number) => void} seekTo
 * @property {(callback: (paused: boolean) => void) => void} isPaused
 */

/**
 * Синхронизирует общий SoundCloud-плеер лаунжа для всех игроков.
 * @param {JukeboxState | null} jukeboxState
 * @param {{ onFinished?: () => void }} [options]
 */
export function useSoundCloudPlayer(jukeboxState, options = {}) {
  const onFinishedRef = useRef(options.onFinished);
  const iframeRef = useRef(null);
  const widgetRef = useRef(/** @type {SoundCloudWidget | null} */ (null));
  const sessionRef = useRef(0);
  const activeTrackKeyRef = useRef('');
  const loadingTrackKeyRef = useRef('');
  const finishedTrackKeyRef = useRef('');
  const userActivatedRef = useRef(false);
  const pendingPlayRef = useRef(false);
  const retryTimerRef = useRef(0);

  useEffect(() => {
    onFinishedRef.current = options.onFinished;
  }, [options.onFinished]);

  useEffect(() => {
    loadSoundCloudApi().catch(() => {});
  }, []);

  /**
   * Помечает, что пользователь уже взаимодействовал со страницей.
   */
  const unlockPlayback = useCallback(() => {
    userActivatedRef.current = true;
    const widget = widgetRef.current;
    if (!widget || !pendingPlayRef.current) return;

    widget.isPaused((paused) => {
      if (paused) widget.play();
    });
  }, []);

  /**
   * Планирует повторную попытку play(), если браузер заблокировал autoplay.
   * @param {SoundCloudWidget} widget
   * @param {number} session
   * @param {number} attempt
   */
  const schedulePlayRetry = useCallback((widget, session, attempt = 0) => {
    window.clearTimeout(retryTimerRef.current);
    if (attempt >= 6 || session !== sessionRef.current) return;

    retryTimerRef.current = window.setTimeout(() => {
      if (session !== sessionRef.current) return;

      widget.isPaused((paused) => {
        if (!paused) {
          pendingPlayRef.current = false;
          return;
        }

        if (userActivatedRef.current) {
          widget.play();
        }

        schedulePlayRetry(widget, session, attempt + 1);
      });
    }, attempt === 0 ? 250 : 500);
  }, []);

  /**
   * Запускает воспроизведение с синхронизацией по startedAt.
   * @param {SoundCloudWidget} widget
   * @param {number} offsetMs
   * @param {number} session
   */
  const startSyncedPlayback = useCallback((widget, offsetMs, session) => {
    if (session !== sessionRef.current) return;

    pendingPlayRef.current = true;

    const playFromCurrentPosition = () => {
      if (session !== sessionRef.current) return;
      widget.play();
      schedulePlayRetry(widget, session);
    };

    if (offsetMs > 400) {
      widget.seekTo(offsetMs);
      window.setTimeout(playFromCurrentPosition, 120);
      return;
    }

    playFromCurrentPosition();
  }, [schedulePlayRetry]);

  const trackId = jukeboxState?.track?.id;
  const permalink = jukeboxState?.track?.permalink;
  const startedAt = Number(jukeboxState?.startedAt || 0);
  const durationMs = Number(jukeboxState?.track?.durationMs || 0);

  useEffect(() => {
    if (!permalink || !iframeRef.current) {
      sessionRef.current += 1;
      activeTrackKeyRef.current = '';
      loadingTrackKeyRef.current = '';
      finishedTrackKeyRef.current = '';
      pendingPlayRef.current = false;
      window.clearTimeout(retryTimerRef.current);
      widgetRef.current?.pause();
      return undefined;
    }

    const trackKey = `${trackId}:${startedAt}`;
    const offsetMs = Math.max(0, Date.now() - startedAt);

    if (durationMs > 0 && offsetMs >= durationMs) {
      activeTrackKeyRef.current = '';
      loadingTrackKeyRef.current = '';
      pendingPlayRef.current = false;
      widgetRef.current?.pause();
      if (finishedTrackKeyRef.current !== trackKey) {
        finishedTrackKeyRef.current = trackKey;
        onFinishedRef.current?.();
      }
      return undefined;
    }

    if (activeTrackKeyRef.current === trackKey || loadingTrackKeyRef.current === trackKey) {
      return undefined;
    }

    loadingTrackKeyRef.current = trackKey;
    finishedTrackKeyRef.current = '';
    const session = sessionRef.current + 1;
    sessionRef.current = session;
    let cancelled = false;

    /**
     * Загружает трек в iframe SoundCloud и запускает синхронизированное воспроизведение.
     */
    async function playTrack() {
      await loadSoundCloudApi();
      if (cancelled || session !== sessionRef.current || !iframeRef.current || !window.SC?.Widget) {
        if (loadingTrackKeyRef.current === trackKey) {
          loadingTrackKeyRef.current = '';
        }
        return;
      }

      const params = new URLSearchParams({
        url: permalink,
        auto_play: 'true',
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
        if (cancelled || session !== sessionRef.current) return;
        startSyncedPlayback(widget, offsetMs, session);
      });

      widget.bind(window.SC.Widget.Events.PLAY, () => {
        if (cancelled || session !== sessionRef.current) return;
        activeTrackKeyRef.current = trackKey;
        loadingTrackKeyRef.current = '';
        pendingPlayRef.current = false;
        window.clearTimeout(retryTimerRef.current);
      });

      widget.bind(window.SC.Widget.Events.FINISH, () => {
        if (cancelled || session !== sessionRef.current) return;
        widget.pause();
        activeTrackKeyRef.current = '';
        loadingTrackKeyRef.current = '';
        pendingPlayRef.current = false;
        if (finishedTrackKeyRef.current === trackKey) return;
        finishedTrackKeyRef.current = trackKey;
        onFinishedRef.current?.();
      });

      widget.bind(window.SC.Widget.Events.ERROR, () => {
        if (cancelled || session !== sessionRef.current) return;
        pendingPlayRef.current = true;
        schedulePlayRetry(widget, session);
      });
    }

    playTrack();

    return () => {
      cancelled = true;
      window.clearTimeout(retryTimerRef.current);
      if (loadingTrackKeyRef.current === trackKey) {
        loadingTrackKeyRef.current = '';
      }
    };
  }, [durationMs, permalink, schedulePlayRetry, startSyncedPlayback, startedAt, trackId]);

  useEffect(() => () => {
    window.clearTimeout(retryTimerRef.current);
  }, []);

  return { iframeRef, unlockPlayback };
}
