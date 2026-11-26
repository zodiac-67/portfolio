'use client';

import { useEffect, useRef, useState } from 'react';

type Game = Awaited<ReturnType<typeof import('@/game/start').startGame>> & { setVolume?: (v: number) => void };   // setVolume: optional until start.ts hands it on

// sound settings, remembered per browser (a convenience: private mode just forgets)
const SOUND_KEY = 'aasish-world-sound', LEVELS = { low: 0.35, high: 1 };
type Sound = { level: keyof typeof LEVELS; muted: boolean };

// The game card in the contact section. Nothing heavy loads until Play: then three.js, the physics engine and the
// models arrive in one lazy chunk. Keys are only read while the screen has focus, and the game pauses when it is
// scrolled out of view or the tab is hidden.
export default function GameScreen() {
  const screen = useRef<HTMLDivElement>(null);
  const game = useRef<Game | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'error'>('idle');
  const [full, setFull] = useState(false);      // real full screen
  const [pseudo, setPseudo] = useState(false);  // iPhone fallback
  const [sound, setSound] = useState<Sound>({ level: 'high', muted: false });
  const vol = useRef<HTMLDivElement>(null);
  const applySound = (s: Sound, save = true) => {
    setSound(s); game.current?.setMuted(s.muted); game.current?.setVolume?.(LEVELS[s.level]);
    if (save) try { localStorage.setItem(SOUND_KEY, JSON.stringify(s)); } catch { /* private mode */ }
  };
  // a mouse click hands the keys back to the game; from the keyboard, focus stays on the button
  const soundClick = (e: React.MouseEvent, s: Sound) => { applySound(s); if (e.detail) screen.current?.focus(); };

  async function play() {
    setState('loading');
    // sound may only start from a click, so the audio context is made here, before anything loads
    const audio = window.AudioContext ? new AudioContext() : undefined;
    try {
      const { startGame } = await import('@/game/start');
      const low = matchMedia('(pointer: coarse)').matches || (navigator.hardwareConcurrency || 8) <= 4;
      game.current = await startGame(screen.current!, { low, audio, onLink: follow, onExit: leave });
      game.current.setActive(true);
      let saved: Partial<Sound> = {};
      try { saved = JSON.parse(localStorage.getItem(SOUND_KEY) || '{}') ?? {}; } catch { /* none yet */ }
      applySound({ level: saved.level === 'low' ? 'low' : 'high', muted: saved.muted === true }, false);
      if (location.search.includes('gamedebug')) Object.assign(window, { __game: game.current });   // test hook only
      setState('playing');
      screen.current!.focus();
    } catch (e) {
      console.error(e);
      audio?.close();
      setState('error');
    }
  }

  useEffect(() => {
    if (state !== 'playing') return;
    const el = screen.current!;
    let visible = true;
    const apply = () => game.current?.setActive(visible && !document.hidden);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; apply(); }, { threshold: 0.15 });
    const fs = () => setFull(document.fullscreenElement === el);
    // Enter and Space work the sound buttons: stop the game's key handler (on the screen) from taking them first
    const keep = (e: KeyboardEvent) => e.stopPropagation(), group = vol.current;
    group?.addEventListener('keydown', keep);
    io.observe(el);
    document.addEventListener('visibilitychange', apply);
    document.addEventListener('fullscreenchange', fs);
    return () => { group?.removeEventListener('keydown', keep); io.disconnect(); document.removeEventListener('visibilitychange', apply); document.removeEventListener('fullscreenchange', fs); };
  }, [state]);

  useEffect(() => () => game.current?.dispose(), []);

  useEffect(() => {
    if (!pseudo) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setPseudo(false); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [pseudo]);

  // links from villagers: the tea house keeper hands over to the real contact form, page sections scroll into view,
  // case studies open in a new tab so the game keeps its place
  function follow(href: string) {
    if (href.startsWith('/')) { window.open(href, '_blank', 'noopener'); return; }
    if (document.fullscreenElement) document.exitFullscreen();
    setPseudo(false);
    if (href === 'contact') {
      const field = document.querySelector<HTMLInputElement>('#contact input');
      field?.scrollIntoView({ block: 'center' }); setTimeout(() => field?.focus(), 400);
    } else document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' });
  }

  // the ronin fell into the clouds: the game ends (the journal stays) and the visitor lands on the contact form
  function leave() {
    game.current?.dispose(); game.current = null;
    setState('idle'); follow('contact');
  }

  // iPhones have no element full screen, so fall back to a fixed layer that covers the viewport
  const toggleFull = () => {
    const el = screen.current!;
    if (document.fullscreenElement) return document.exitFullscreen();
    if (pseudo) return setPseudo(false);
    if (el.requestFullscreen) el.requestFullscreen().then(() => el.focus(), () => setPseudo(true));
    else setPseudo(true);
  };

  return (
    <div className="game">
      <p className="g-kicker">Aasish World</p>
      <h3 className="g-title">Visit the floating village</h3>
      <p className="g-text">Explore the ronin&apos;s island above the clouds at dawn.</p>
      <div ref={screen} className={`g-screen${pseudo ? ' is-full' : ''}`} tabIndex={state === 'playing' ? 0 : -1} aria-label="Game. Walk with W A S D or the arrow keys.">
        {state !== 'playing' && <img className="g-poster" src="/game/poster.webp" alt="" />}
        {state !== 'playing' && (
          <button className="btn g-play" onClick={play} disabled={state === 'loading'}>
            {state === 'loading' ? 'Loading…' : state === 'error' ? 'Couldn’t start. Try again' : 'Play'}
          </button>
        )}
        {state === 'playing' && (
          <div ref={vol} className="g-vol" role="group" aria-label="Sound">
            <span className="g-vol-lv">
              {(['low', 'high'] as const).map((l) => (
                <button key={l} aria-pressed={!sound.muted && sound.level === l} aria-label={`Volume ${l}`} onClick={(e) => soundClick(e, { level: l, muted: false })}>{l === 'low' ? 'Low' : 'High'}</button>
              ))}
            </span>
            <button className="g-mute" onClick={(e) => soundClick(e, { ...sound, muted: !sound.muted })}>{sound.muted ? 'Sound off' : 'Sound on'}</button>
          </div>
        )}
        {state === 'playing' && <button className="g-full" onClick={toggleFull}>{full || pseudo ? 'Exit full screen' : 'Full screen'}</button>}
      </div>
      <p className="g-hint">
        <span className="g-hint-keys">WASD walk · Shift run · E talk · M map</span>
        <span className="g-hint-touch">Left thumb walks · drag to look · tap the round button to talk</span>
      </p>
    </div>
  );
}
