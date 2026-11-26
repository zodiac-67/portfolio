import * as THREE from 'three';
import type { Island } from './island';

// The game's on-screen layer, driven straight from the game loop (plain DOM, no React re-renders per frame):
// world-anchored prompts and barks that follow characters, the conversation lower-third (letterbox subtitles with
// topic choices), a compass strip, the ink map (M), the journal (J), short toasts, and on touch screens an action button.

/** one choice under a line: a topic, a shared moment, or Goodbye (`done` once heard) */
export type Choice = { label: string; done?: boolean; bye?: boolean };
/** what the conversation shows: who speaks, the line, then either choices (`hot` is the one E picks) or Continue */
export type Bubble = { name: string; role: string; seal: string; line: string; last: boolean; link?: string; cta?: string; choices?: Choice[]; hot?: number };
export type Marker = { id: string; glyph: string; label: string; pos: THREE.Vector3; villager: boolean; met?: boolean };
export type ReadDoc = { title: string; kicker: string; body: string[]; link?: string; cta?: string; art?: (c: CanvasRenderingContext2D, w: number, h: number) => void };
export type Entry = { id: string; seal: string; name: string; role: string; where: string; summary: string; met: boolean; link?: string; cta?: string };

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement, text?: string) => {
  const e = document.createElement(tag); e.className = cls; if (text !== undefined) e.textContent = text; parent?.appendChild(e); return e;
};

export function createHud(host: HTMLElement, I: Island, o: { touch: boolean; onAct: () => void; onNext: () => void; onLink: (href: string) => void; onChoose?: (i: number) => void }) {
  const root = el('div', 'gw', host);
  // world-anchored prompt ("E  Talk to Genzo") and, on touch, a big action button
  const prompt = el('div', 'gw-prompt', root); const key = el('kbd', '', prompt, 'E'); const label = el('span', '', prompt);
  if (o.touch) key.remove();
  const act = el('button', 'gw-act', root); act.type = 'button';
  act.addEventListener('click', (e) => { e.stopPropagation(); o.onAct(); });
  // the conversation, as a letterbox lower-third: a dark gradient rising from the bottom, the speaker (seal, name, role,
  // "speaking" bars), the line, then the choices in a row of text links (stacked tap rows on phones) or Continue
  const sub = el('div', 'gw-sub', root); sub.setAttribute('role', 'dialog'); sub.setAttribute('aria-live', 'polite');
  const head = el('p', 'gw-sub-head', sub), seal = el('span', 'gw-sub-seal', head), who = el('b', 'gw-sub-name', head), role = el('small', 'gw-sub-role', head);
  const bars = el('span', 'gw-sub-talk', head); for (let i = 0; i < 3; i++) el('i', '', bars); bars.setAttribute('aria-hidden', 'true');
  const line = el('p', 'gw-sub-line', sub), link = el('a', 'gw-sub-link', sub), choices = el('div', 'gw-sub-choices', sub);
  const cont = el('p', 'gw-sub-cont', sub, o.touch ? 'Tap' : 'Continue '); if (!o.touch) el('kbd', 'gw-sub-k', cont, 'E'); el('i', 'gw-sub-tri', cont); cont.setAttribute('aria-hidden', 'true');
  let picks: Choice[] = [], talkT = 0;
  sub.addEventListener('pointerdown', (e) => e.stopPropagation());              // a tap here is for the conversation, never a camera drag
  sub.addEventListener('click', (e) => {
    const t = e.target as HTMLElement; e.stopPropagation(); if (t.closest('a')) return;
    const c = t.closest<HTMLElement>('.gw-sub-choice'); if (c) return o.onChoose?.(Number(c.dataset.i));
    if (!picks.length) o.onNext();                                                // anywhere else: the next line (choices need a pick)
  });
  link.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); o.onLink(link.getAttribute('href')!); });
  host.addEventListener('keydown', (e) => {                                       // 1-9 pick a choice (start.ts leaves digits alone)
    const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code); if (!m || !picks.length || !sub.classList.contains('is-on')) return;
    const i = Number(m[1]) - 1; if (i < picks.length) { e.preventDefault(); o.onChoose?.(i); }
  });
  const bark = el('div', 'gw-bark', root);
  // compass strip
  const compass = el('div', 'gw-compass', root), strip = el('div', 'gw-c-strip', compass); el('i', 'gw-c-mid', compass);
  const cardinals = [['N', 0], ['E', -Math.PI / 2], ['S', Math.PI], ['W', Math.PI / 2]].map(([t, a]) => ({ a: a as number, e: el('span', 'gw-c-card', strip, t as string) }));
  const pins = new Map<string, HTMLElement>();
  // toasts, buttons for the map and journal
  const toast = el('p', 'gw-toast', root); let toastT = 0;
  const btns = el('div', 'gw-btns', root);
  const mapBtn = el('button', 'gw-btn', btns, o.touch ? 'Map' : 'Map  M'), jBtn = el('button', 'gw-btn', btns, o.touch ? 'Journal' : 'Journal  J');
  // overlays
  const mapWrap = el('div', 'gw-sheet gw-map', root), canvas = el('canvas', '', mapWrap); canvas.width = 720; canvas.height = 620;
  const mapClose = el('button', 'gw-close', mapWrap, 'Close'); mapClose.type = 'button';
  const journal = el('div', 'gw-sheet gw-journal', root), jHead = el('div', 'gw-j-head', journal); el('h4', '', jHead, 'Journal');
  const jCount = el('p', 'gw-j-count', jHead), jList = el('ol', 'gw-j-list', journal), jCred = el('details', 'gw-j-cred', journal), jClose = el('button', 'gw-close', journal, 'Close'); jClose.type = 'button';
  el('summary', '', jCred, 'Credits');
  el('p', '', jCred, 'Statue: Nataraja, Cleveland Museum of Art scan (CC0). Textures: Poly Haven (CC0). Movement: Quaternius Universal Animation Library (CC0). Characters: made with MPFB / MakeHuman (CC0). Voices: Kokoro (Apache-2.0); Pandit Shankar speaks with Piper and the OHF-Voice chitwan Nepali dataset (CC0). Sounds: CC0 recordings. Built with three.js and Rapier.');
  const thanks = el('div', 'gw-sheet gw-thanks', root);
  el('p', 'gw-t-seal', thanks, '謝'); el('h4', '', thanks, 'You met everyone on the island');
  el('p', '', thanks, 'Thank you for walking the village. If something on your plate could use an agent, Aasish would love to hear about it.');
  const tWrite = el('button', 'gw-t-go', thanks, 'Write to Aasish'), tStay = el('button', 'gw-close', thanks, 'Keep exploring');
  tWrite.addEventListener('click', () => { thanks.classList.remove('is-open'); o.onLink('contact'); });
  tStay.addEventListener('click', () => thanks.classList.remove('is-open'));
  // the reading sheet for posters, scrolls and boards: the print on one side, the full text on the other
  const reader = el('div', 'gw-sheet gw-read', root), rArt = el('canvas', 'gw-r-art', reader), rText = el('div', 'gw-r-text', reader);
  const rClose = el('button', 'gw-close', reader, 'Close'); rClose.type = 'button'; rClose.addEventListener('click', () => reader.classList.remove('is-open'));
  let openSheet: 'map' | 'journal' | null = null;
  const show = (s: 'map' | 'journal' | null) => {
    openSheet = s; mapWrap.classList.toggle('is-open', s === 'map'); journal.classList.toggle('is-open', s === 'journal');
  };
  mapBtn.addEventListener('click', (e) => { e.stopPropagation(); show(openSheet === 'map' ? null : 'map'); });
  jBtn.addEventListener('click', (e) => { e.stopPropagation(); show(openSheet === 'journal' ? null : 'journal'); });
  mapClose.addEventListener('click', () => show(null)); jClose.addEventListener('click', () => show(null));

  const v = new THREE.Vector3();
  const toScreen = (p: THREE.Vector3, cam: THREE.Camera) => {
    v.copy(p).project(cam); if (v.z > 1 || v.z < -1) return null;
    return { x: (v.x + 1) / 2 * host.clientWidth, y: (1 - v.y) / 2 * host.clientHeight };
  };
  const place = (e: HTMLElement, at: { x: number; y: number }, dx: number, dy: number) => {
    const w = e.offsetWidth, h = e.offsetHeight, W = host.clientWidth, H = host.clientHeight;
    const x = Math.round(Math.min(W - w - 8, Math.max(8, at.x + dx))), y = Math.round(Math.min(H - h - 8, Math.max(8, at.y + dy)));   // whole pixels keep text crisp
    const t = `translate(${x}px, ${y}px)`; if (e.style.transform !== t) e.style.transform = t; return { x, y };
  };
  let promptAt: THREE.Vector3 | null = null, barkAt: THREE.Vector3 | null = null, barkT = 0;

  // ---- the ink map: washi, brushed island outline, stream, paths, buildings, villager seals, you
  const S = 3.0, CX = 380, CY = 330;
  const mx = (x: number) => CX - x * S, my = (z: number) => CY - z * S;            // east (-x) to the right, north (+z) up
  const base = document.createElement('canvas'); base.width = canvas.width; base.height = canvas.height;
  {
    const c = base.getContext('2d')!;
    c.fillStyle = '#f3ead6'; c.fillRect(0, 0, base.width, base.height);
    let k = 7; const r = () => ((k = (k * 16807) % 2147483647) / 2147483647);
    c.strokeStyle = 'rgba(120, 96, 60, .08)'; for (let i = 0; i < 260; i++) { c.beginPath(); const x = r() * 720, y = r() * 620; c.moveTo(x, y); c.lineTo(x + r() * 40 - 20, y + r() * 12 - 6); c.stroke(); }
    c.strokeStyle = 'rgba(70, 90, 120, .18)'; c.lineWidth = 1.2;                  // a sea of clouds in loose ink swirls
    for (let i = 0; i < 70; i++) { const x = r() * 720, y = r() * 620; c.beginPath(); c.arc(x, y, 8 + r() * 14, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); }
    const outline = (pts: [number, number][], fill: string, w: number) => {
      c.beginPath(); pts.forEach(([x, z], i) => (i ? c.lineTo(mx(x), my(z)) : c.moveTo(mx(x), my(z)))); c.closePath();
      c.fillStyle = fill; c.fill(); c.strokeStyle = '#2b2620'; c.lineWidth = w; c.stroke(); c.lineWidth = w * 0.4; c.stroke();
    };
    outline(I.rim, '#e7dcc0', 2.6);
    for (const isl of I.islets) { c.beginPath(); c.arc(mx(isl.x), my(isl.z), isl.r * S, 0, Math.PI * 2); c.fillStyle = '#e7dcc0'; c.fill(); c.strokeStyle = '#2b2620'; c.lineWidth = 2; c.stroke(); }
    c.setLineDash([2, 4]); c.strokeStyle = '#6b5a44'; c.lineWidth = 1.6;
    for (const b of I.bridges) { c.beginPath(); c.moveTo(mx(b.a[0]), my(b.a[2])); c.lineTo(mx(b.b[0]), my(b.b[2])); c.stroke(); }
    c.setLineDash([5, 4]); c.strokeStyle = 'rgba(80, 64, 44, .55)'; c.lineWidth = 2.2;
    for (const p of I.paths) { c.beginPath(); p.forEach(([x, z], i) => (i ? c.lineTo(mx(x), my(z)) : c.moveTo(mx(x), my(z)))); c.stroke(); }
    c.setLineDash([]); c.strokeStyle = '#3f7ea0'; c.lineWidth = 3.2;
    c.beginPath(); I.stream.forEach(([x, z], i) => (i ? c.lineTo(mx(x), my(z)) : c.moveTo(mx(x), my(z)))); c.stroke();
    const P = I.spots.pond; c.beginPath(); c.ellipse(mx(P.x), my(P.z), 8.5 * S / 1.6, 6.4 * S / 1.6, 0, 0, Math.PI * 2); c.fillStyle = '#9cc6d6'; c.fill(); c.stroke();
    c.fillStyle = '#3a312a';
    for (const [x, z, yaw] of I.houses) { c.save(); c.translate(mx(x), my(z)); c.rotate(yaw); c.fillRect(-10, -11, 20, 22); c.restore(); }
    c.font = '600 15px "Hiragino Mincho ProN", "Yu Mincho", serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const glyph = (t: string, x: number, z: number, col = '#2b2620', size = 18) => { c.font = `600 ${size}px "Hiragino Mincho ProN", "Yu Mincho", serif`; c.fillStyle = col; c.fillText(t, mx(x), my(z)); };
    glyph('塔', I.spots.pagoda.x, I.spots.pagoda.z, '#b3261e', 24); glyph('城', I.spots.castle.x, I.spots.castle.z, '#2b2620', 26);
    glyph('⛩', I.spots.torii.x, I.spots.torii.z, '#b3261e', 20); glyph('茶', I.spots.teahouse.x, I.spots.teahouse.z, '#2b2620', 18);
    glyph('桜', I.spots.sakura.x, I.spots.sakura.z, '#c4577a', 18); glyph('竹', I.spots.bamboo.x, I.spots.bamboo.z, '#3d6b3a', 22);
    glyph('森', I.spots.forest.x, I.spots.forest.z, '#3d6b3a', 22); glyph('野', I.spots.meadow.x, I.spots.meadow.z, '#6b7a3a', 20);
    const sh = I.props.shrine[0]; glyph('像', sh[0], sh[1], '#b3261e', 18);   // the stone Nataraja
    c.font = '700 22px Georgia, serif'; c.fillStyle = '#2b2620'; c.textAlign = 'left'; c.fillText('The floating village', 22, 34);
    c.font = '500 13px Georgia, serif'; c.fillStyle = '#6b5a44'; c.fillText('浮島の村  ·  north is up', 22, 56);
    c.font = '700 16px Georgia, serif'; c.textAlign = 'center'; c.fillText('N', 690, 34); c.beginPath(); c.moveTo(690, 44); c.lineTo(684, 62); c.lineTo(696, 62); c.closePath(); c.fill();
  }
  const drawMap = (player: THREE.Vector3, heading: number, markers: Marker[]) => {
    const c = canvas.getContext('2d')!; c.drawImage(base, 0, 0);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const m of markers.filter((q) => q.villager)) {
      const x = mx(m.pos.x), y = my(m.pos.z), met = !!m.met;
      c.fillStyle = met ? '#b3261e' : '#f3ead6'; c.strokeStyle = '#b3261e'; c.lineWidth = 2;
      c.beginPath(); c.roundRect(x - 11, y - 11, 22, 22, 4); c.fill(); c.stroke();
      c.font = '600 14px "Hiragino Mincho ProN", "Yu Mincho", serif'; c.fillStyle = met ? '#fff6ec' : '#b3261e'; c.fillText(m.glyph, x, y + 1);
    }
    const px = mx(player.x), py = my(player.z);
    c.save(); c.translate(px, py); c.rotate(-heading); c.fillStyle = '#b3261e';                  // the arrow points where you look
    c.beginPath(); c.moveTo(0, -13); c.lineTo(7, 6); c.lineTo(0, 2); c.lineTo(-7, 6); c.closePath(); c.fill(); c.restore();
    c.beginPath(); c.arc(px, py, 18, 0, Math.PI * 2); c.strokeStyle = 'rgba(179, 38, 30, .35)'; c.lineWidth = 2; c.stroke();
  };

  return {
    get open() { return openSheet !== null || thanks.classList.contains('is-open') || reader.classList.contains('is-open'); },
    toggle(s: 'map' | 'journal') { show(openSheet === s ? null : s); },
    close() { const was = this.open; show(null); thanks.classList.remove('is-open'); reader.classList.remove('is-open'); return was; },
    prompt(text: string | null, at: THREE.Vector3 | null, actLabel = 'Talk') {
      promptAt = text ? at : null; prompt.classList.toggle('is-on', !!text); if (text) label.textContent = text;
      act.classList.toggle('is-on', !!text && o.touch && !sub.classList.contains('is-on')); act.textContent = actLabel;
    },
    /** show a line of the conversation (null ends it). The lower-third sits on the screen, so `at` (the speaker's head) is unused. */
    bubble(b: Bubble | null, _at?: THREE.Vector3 | null) {
      sub.classList.toggle('is-on', !!b); root.classList.toggle('is-talking', !!b); picks = b?.choices ?? [];
      if (!b) { talkT = 0; sub.classList.remove('is-speaking'); return; }
      act.classList.remove('is-on');                                              // the phone's action button would sit on the choices
      seal.textContent = b.seal; who.textContent = b.name; role.textContent = b.role; line.textContent = b.line;
      link.hidden = !b.link; if (b.link) { link.setAttribute('href', b.link); link.textContent = `${b.cta ?? 'Open'} ↗`; }
      choices.replaceChildren(...picks.map((c, i) => {
        const btn = el('button', `gw-sub-choice${c.done ? ' is-asked' : ''}${c.bye ? ' is-bye' : ''}${i === b.hot ? ' is-focus' : ''}`); btn.type = 'button'; btn.dataset.i = String(i);
        if (!o.touch) el('kbd', 'gw-sub-k', btn, String(i + 1));
        el('span', '', btn, c.label); if (c.done) el('b', 'gw-sub-ok', btn, '✓');
        return btn;
      }));
      choices.hidden = !picks.length; cont.hidden = !!picks.length;
      cont.firstChild!.textContent = o.touch ? (b.last ? 'Tap to close ' : 'Tap ') : b.last ? 'Close ' : 'Continue ';
      this.speaking(Math.min(7, Math.max(1.2, b.line.length * 0.055)));          // until the voice says how long it really is
      line.classList.remove('is-new'); void line.offsetWidth; line.classList.add('is-new');
    },
    /** the "speaking" bars by the name, for this many seconds (call with the voice clip's length once it is known) */
    speaking(sec: number) { talkT = sec; sub.classList.toggle('is-speaking', sec > 0); },
    bark(text: string, at: THREE.Vector3) { bark.textContent = text; barkAt = at; barkT = 2.8; bark.classList.add('is-on'); },
    toast(text: string) { toast.textContent = text; toast.classList.add('is-on'); toastT = 3; },
    journal(entries: Entry[]) {
      const met = entries.filter((e) => e.met).length; jCount.textContent = `Met ${met} of ${entries.length}`;
      jList.replaceChildren(...entries.map((e) => {
        const li = el('li', e.met ? 'is-met' : ''), s2 = el('span', 'gw-j-seal', li, e.met ? e.seal : '?'), body = el('div', '', li);
        void s2; el('b', '', body, e.met ? `${e.name}, ${e.role}` : 'Not met yet'); el('p', '', body, e.met ? e.summary : e.where);
        if (e.met && e.link) { const a = el('a', 'gw-j-link', body, `${e.cta} ↗`); a.setAttribute('href', e.link); a.addEventListener('click', (ev) => { ev.preventDefault(); o.onLink(e.link!); }); }
        return li;
      }));
    },
    thanks() { show(null); thanks.classList.add('is-open'); },
    read(d: ReadDoc) {
      show(null); thanks.classList.remove('is-open'); reader.classList.toggle('no-art', !d.art); rArt.hidden = !d.art;
      if (d.art) { const k = Math.min(2, devicePixelRatio); rArt.width = 460 * k; rArt.height = 494 * k; d.art(rArt.getContext('2d')!, rArt.width, rArt.height); }
      rText.replaceChildren(); el('p', 'gw-r-kicker', rText, d.kicker); el('h4', '', rText, d.title); for (const b of d.body) el('p', '', rText, b);
      if (d.link) { const go = el('button', 'gw-t-go', rText, `${d.cta} ↗`); go.type = 'button'; go.addEventListener('click', () => { reader.classList.remove('is-open'); o.onLink(d.link!); }); }
      reader.classList.add('is-open'); reader.scrollTop = 0;
    },
    /** heading: the direction the camera looks (0 = north, +pi/2 = west in this world) */
    update(dt: number, cam: THREE.PerspectiveCamera, heading: number, player: THREE.Vector3, markers: Marker[]) {
      if (promptAt) { const s = toScreen(promptAt, cam); prompt.style.visibility = s ? 'visible' : 'hidden'; if (s) place(prompt, s, -prompt.offsetWidth / 2, -prompt.offsetHeight - 8); }
      if (talkT > 0 && (talkT -= dt) <= 0) sub.classList.remove('is-speaking');
      if (barkT > 0) {
        barkT -= dt; if (barkT <= 0) bark.classList.remove('is-on');
        const s = barkAt && toScreen(barkAt, cam); if (s) place(bark, s, -bark.offsetWidth / 2, -bark.offsetHeight - 10);
      }
      if (toastT > 0) { toastT -= dt; if (toastT <= 0) toast.classList.remove('is-on'); }
      // compass: what lies ahead of the camera, +-75 degrees across the strip
      const W = compass.clientWidth, span = (75 * Math.PI) / 180, pos = (a: number) => { const d = Math.atan2(Math.sin(a - heading), Math.cos(a - heading)); return Math.abs(d) < span ? W / 2 - (d / span) * (W / 2) : null; };
      for (const c of cardinals) { const x = pos(c.a); c.e.style.opacity = x === null ? '0' : '1'; if (x !== null) c.e.style.transform = `translateX(${x}px)`; }
      const seen = new Set<string>();
      for (const m of markers) {
        if (m.villager && m.met) continue;                                         // met villagers leave the compass
        seen.add(m.id); let e = pins.get(m.id);
        if (!e) { e = el('span', m.villager ? 'gw-c-pin is-v' : 'gw-c-pin', strip, m.glyph); e.title = m.label; pins.set(m.id, e); }
        const x = pos(Math.atan2(m.pos.x - player.x, m.pos.z - player.z)); e.style.opacity = x === null ? '0' : '1'; if (x !== null) e.style.transform = `translateX(${x}px)`;
      }
      for (const [id, e] of pins) if (!seen.has(id)) { e.remove(); pins.delete(id); }
      if (openSheet === 'map') drawMap(player, heading, markers);
    },
    dispose() { root.remove(); },
  };
}
