import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/icons';
import { useTelegram } from '../hooks/useTelegram';
import { LoungeCanvas } from '../game/lounge/LoungeCanvas';
import { VirtualJoystick } from '../game/lounge/VirtualJoystick';
import { LOUNGE_COLORS, PLAYER_SPEED } from '../game/lounge/constants';
import { useLoungeSocket } from '../game/lounge/useLoungeSocket';
import { useLoungeAudio } from '../game/lounge/useLoungeAudio';

/**
 * Ограничивает координату внутри комнаты.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Определяет направление по вектору движения.
 * @param {{ x: number, y: number }} vector
 * @returns {'down' | 'up' | 'left' | 'right'}
 */
function directionFromVector(vector) {
  if (Math.abs(vector.x) > Math.abs(vector.y)) {
    return vector.x >= 0 ? 'right' : 'left';
  }
  return vector.y >= 0 ? 'down' : 'up';
}

/**
 * Объединяет вектор джойстика и клавиатуры.
 * @param {{ x: number, y: number }} joystick
 * @param {Set<string>} keys
 * @returns {{ x: number, y: number }}
 */
function movementVector(joystick, keys) {
  const keyboard = {
    x: Number(keys.has('ArrowRight') || keys.has('KeyD')) - Number(keys.has('ArrowLeft') || keys.has('KeyA')),
    y: Number(keys.has('ArrowDown') || keys.has('KeyS')) - Number(keys.has('ArrowUp') || keys.has('KeyW')),
  };
  const raw = Math.abs(joystick.x) + Math.abs(joystick.y) > 0.05 ? joystick : keyboard;
  const length = Math.hypot(raw.x, raw.y);
  if (!length) return { x: 0, y: 0 };
  return { x: raw.x / length, y: raw.y / length };
}

export default function Lounge() {
  const { tg, user } = useTelegram();
  const audio = useLoungeAudio();
  const {
    selfId,
    world,
    players,
    connected,
    error,
    color,
    vapeEvents,
    sendMove,
    sendChat,
    sendVape,
    setColor,
  } = useLoungeSocket(user);

  const [chatText, setChatText] = useState('');
  const [localPlayer, setLocalPlayer] = useState(null);
  const joystickRef = useRef({ x: 0, y: 0 });
  const keysRef = useRef(new Set());
  const positionRef = useRef(null);
  const selfPlayerRef = useRef(null);
  const lastSentAtRef = useRef(0);
  const wasMovingRef = useRef(false);

  useEffect(() => {
    tg?.disableVerticalSwipes?.();

    const previousOverscroll = document.body.style.overscrollBehavior;
    const previousTouchAction = document.body.style.touchAction;
    document.body.style.overscrollBehavior = 'none';
    document.body.style.touchAction = 'pan-x';

    /**
     * Не даём Telegram Mini App сворачивать экран при свайпе по игровой зоне.
     * @param {TouchEvent} event
     */
    function preventGameSwipe(event) {
      if (event.target instanceof Element && event.target.closest('.lounge-shell')) {
        event.preventDefault();
      }
    }

    document.addEventListener('touchmove', preventGameSwipe, { passive: false });
    return () => {
      tg?.enableVerticalSwipes?.();
      document.body.style.overscrollBehavior = previousOverscroll;
      document.body.style.touchAction = previousTouchAction;
      document.removeEventListener('touchmove', preventGameSwipe);
    };
  }, [tg]);

  const selfPlayer = useMemo(
    () => players.find((player) => player.id === selfId),
    [players, selfId],
  );

  useEffect(() => {
    selfPlayerRef.current = selfPlayer || null;
    if (!selfPlayer) return;

    if (!positionRef.current) {
      positionRef.current = { x: selfPlayer.x, y: selfPlayer.y, direction: selfPlayer.direction };
      setLocalPlayer(selfPlayer);
      return;
    }

    setLocalPlayer((prev) => ({
      ...selfPlayer,
      ...(prev ? { x: prev.x, y: prev.y, direction: prev.direction, moving: prev.moving } : positionRef.current),
    }));
  }, [selfPlayer]);

  const renderedPlayers = useMemo(() => {
    if (!localPlayer) return players;
    return players.map((player) => (player.id === selfId ? { ...player, ...localPlayer } : player));
  }, [localPlayer, players, selfId]);

  useEffect(() => {
    /**
     * Запоминает нажатые клавиши для desktop-управления.
     * @param {KeyboardEvent} event
     */
    function handleDown(event) {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName || '')) return;
      keysRef.current.add(event.code);
    }

    /**
     * Убирает отпущенные клавиши из набора.
     * @param {KeyboardEvent} event
     */
    function handleUp(event) {
      keysRef.current.delete(event.code);
    }

    window.addEventListener('keydown', handleDown);
    window.addEventListener('keyup', handleUp);
    return () => {
      window.removeEventListener('keydown', handleDown);
      window.removeEventListener('keyup', handleUp);
    };
  }, []);

  useEffect(() => {
    let frameId = 0;
    let previous = performance.now();

    /**
     * Двигает локального игрока и отправляет позицию на сервер.
     * @param {number} now
     */
    function tick(now) {
      const position = positionRef.current;
      if (position) {
        const dt = Math.min(0.04, (now - previous) / 1000);
        const vector = movementVector(joystickRef.current, keysRef.current);
        const moving = Math.abs(vector.x) + Math.abs(vector.y) > 0.01;

        if (moving) {
          audio.play('step');
          position.x = clamp(position.x + vector.x * PLAYER_SPEED * dt, 38, world.width - 38);
          position.y = clamp(position.y + vector.y * PLAYER_SPEED * dt, 58, world.height - 44);
          position.direction = directionFromVector(vector);
        }

        const basePlayer = selfPlayerRef.current;
        if (basePlayer) {
          setLocalPlayer({
            ...basePlayer,
            x: position.x,
            y: position.y,
            direction: position.direction,
            moving,
          });
        }

        if (moving && now - lastSentAtRef.current > 45) {
          sendMove({ ...position, moving: true });
          lastSentAtRef.current = now;
          wasMovingRef.current = true;
        } else if (!moving && wasMovingRef.current) {
          sendMove({ ...position, moving: false });
          wasMovingRef.current = false;
        }
      }

      previous = now;
      frameId = window.requestAnimationFrame(tick);
    }

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [sendMove, world.height, world.width]);

  /**
   * Отправляет сообщение в чат комнаты.
   * @param {React.FormEvent<HTMLFormElement>} event
   */
  function handleChatSubmit(event) {
    event.preventDefault();
    const text = chatText.trim();
    if (!text) return;
    audio.play('chat');
    sendChat(text);
    setChatText('');
  }

  /**
   * Меняет цвет персонажа со звуком.
   * @param {string} nextColor
   */
  function handleColorChange(nextColor) {
    audio.play('color');
    setColor(nextColor);
  }

  /**
   * Запускает анимацию дыма со звуком.
   */
  function handleVape() {
    audio.play('vape');
    sendVape();
  }

  return (
    <div className="page lounge-page">
      <div className="lounge-header">
        <Link to="/profile" className="lounge-back">
          ← Профиль
        </Link>
        <div>
          <div className="header-title">King Lounge</div>
          <div className="header-sub">
            {connected ? `Онлайн: ${players.length}` : 'Подключаемся...'}
          </div>
        </div>
      </div>

      {error && <div className="catalog-error-banner lounge-error">{error}</div>}

      <section className="lounge-shell card">
        <div className="lounge-stage">
          <LoungeCanvas players={renderedPlayers} selfId={selfId} world={world} vapeEvents={vapeEvents} />
        </div>

        <div className="lounge-hud">
          <VirtualJoystick
            onStart={audio.unlock}
            onChange={(vector) => {
              joystickRef.current = vector;
            }}
          />
          <div className="lounge-actions">
            <button type="button" className="lounge-action-btn" onClick={handleVape}>
              💨
              <span>Вейп</span>
            </button>
            <div className="lounge-colors" aria-label="Цвет персонажа">
              {LOUNGE_COLORS.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`lounge-color${item === color ? ' lounge-color--active' : ''}`}
                  style={{ background: item }}
                  onClick={() => handleColorChange(item)}
                  aria-label={`Цвет ${item}`}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      <form className="lounge-chat card" onSubmit={handleChatSubmit}>
        <input
          value={chatText}
          onChange={(event) => setChatText(event.target.value)}
          maxLength={90}
          placeholder="Написать в лаунж..."
        />
        <button type="submit" className="btn btn-primary">
          <Icon name="chat" size="xs" />
          Отправить
        </button>
      </form>
    </div>
  );
}
