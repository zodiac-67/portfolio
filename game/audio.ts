// Game sound: a calm, natural soundscape made live with Web Audio, and no music, ever. A breeze that swells and settles
// with the leaves stirring in it, a few distant birds, the stream and the waterfall, the campfire and the tea house's
// wind bell as you come near, soft one-shots (the temple bell, the anvil, koi, wings, deer, cranes) and recorded
// villager lines when they exist. Footsteps are real recordings (CC0, Fantozzi) in one file, 12 slots of 0.5 s, sand
// 0–5 then stone 6–11, shaped here for grass, stone, wood and water.
// Cheap by design: four shared noise loops and four short pre-rendered loops feed every bed, each bed is a filter or
// two, and the mix is refreshed ten times a second rather than every frame.
export type Surface = 'grass' | 'stone' | 'wood' | 'water';
/** where the island's sounds are: the stream's centre line (its last point is the waterfall's lip), the fire, the wind bell */
export type Places = { stream: number[][]; fire: number[]; chime: number[] };
/** the listener, each frame: the player's position, the camera's facing on the ground (fx, fz, any length), how exposed
 *  to the wind they stand (0 sheltered, 1 the castle top or the rim) and whether they're aboard the sky-boat */
export type Ears = { x: number; z: number; fx: number; fz: number; wind?: number; ride?: boolean };
type Legacy = { river?: number; wind?: number; [kart: string]: unknown };   // the old call shape, until start.ts passes Ears
type Note = [number, number, number, number, number, number?];             // start, length (s), from Hz, to Hz, loudness 0–1, attack (s)

export function createAudio(ctx: AudioContext, at?: Places) {
  const sr = ctx.sampleRate, rnd = Math.random, clamp = (v: number) => Math.min(1, Math.max(0, v));
  const gain = (v = 0) => { const g = ctx.createGain(); g.gain.value = v; return g; };
  const filter = (type: BiquadFilterType, f: number, q = 0.7, db = 0) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = db; return b; };
  const loop = (b: AudioBuffer, rate = 1) => { const s = ctx.createBufferSource(); s.buffer = b; s.loop = true; s.playbackRate.value = rate; s.start(0, rnd() * b.duration); return s; };

  // ---------------------------------------------------------------- buffers, made once
  const noise = (sec: number, brown: boolean) => {
    const b = ctx.createBuffer(1, sr * sec, sr), d = b.getChannelData(0), n = d.length;
    for (let i = 0, last = 0; i < n; i++) { const w = rnd() * 2 - 1; d[i] = brown ? (last = (last + 0.02 * w) / 1.02) * 3.5 : w; }
    if (brown) for (let i = 0, j = d[n - 1] - d[0]; i < n; i++) d[i] -= (j * i) / n;   // ends meet, so the loop never thumps
    return b;
  };
  const white = noise(3, false), brown = noise(4, true);
  const render = (sec: number, fill: (d: Float32Array, n: number, r: number) => void) => {   // a loop drawn sample by sample at 24 kHz
    const r = 24000, b = ctx.createBuffer(1, Math.floor(sec * r), r), d = b.getChannelData(0); fill(d, d.length, r);
    let m = 0; for (const v of d) m = Math.max(m, Math.abs(v)); for (let i = 0; i < d.length; i++) d[i] /= m || 1;
    return b;
  };
  // the brook's babble: hundreds of tiny bubbles, each a ring that climbs in pitch as it dies (wrapping, so it loops)
  const babble = (sec: number) => render(sec, (d, n, r) => {
    for (let k = Math.round(sec * 26); k--; ) {
      const f = 360 * Math.pow(4.4, rnd()), len = Math.floor(r * (0.01 + rnd() * 0.04)), a = 0.1 + rnd() ** 3, s0 = Math.floor(rnd() * n);
      for (let i = 0, ph = 0; i < len; i++) { const t = i / len; ph += (6.283 * f * (1 + 0.6 * t)) / r; d[(s0 + i) % n] += a * Math.sin(ph) * Math.exp(-5 * t) * Math.min(1, i / 30); }
    }
  });
  // the fire's crackle: pops, a few sharp snaps of sap that ring a little, and now and then a fizz of tiny ticks
  const crackle = (sec: number) => render(sec, (d, n, r) => {
    const pop = (s0: number, a: number, len: number) => { for (let i = 0; i < len * 5; i++) d[(s0 + i) % n] += a * (rnd() * 2 - 1) * Math.exp(-i / len); };
    for (let k = Math.round(sec * 7); k--; ) {
      const s0 = Math.floor(rnd() * n), u = rnd();
      if (u < 0.12) { pop(s0, 0.7 + 0.3 * rnd(), r * 0.004); const f = 1800 + rnd() * 1800; for (let i = 0; i < r * 0.012; i++) d[(s0 + i) % n] += 0.25 * Math.sin((6.283 * f * i) / r) * Math.exp(-i / (r * 0.0025)); }
      else if (u < 0.3) for (let j = 4 + rnd() * 8; j-- > 0; ) pop(s0 + Math.floor(rnd() * r * 0.09), 0.05 + 0.1 * rnd(), r * 0.0006);
      else pop(s0, 0.08 + 0.45 * rnd() ** 2, r * (0.0008 + rnd() * 0.0022));
    }
    for (let i = 0, x0 = 0, y = 0; i < n; i++) { const x = d[i]; y = 0.97 * (y + x - x0); x0 = x; d[i] = y; }   // high-pass: pops, never thumps
  });
  // an outdoor tail for far-off things: noise dying away and darkening after a short gap, like a valley answering
  const tail = () => {
    const n = Math.floor(sr * 1.8), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
    for (let i = Math.floor(sr * 0.012), lp = 0; i < n; i++) { const t = i / n, k = 0.5 + 0.45 * t; lp = lp * k + (rnd() * 2 - 1) * (1 - k); d[i] = lp * (1 - t) ** 3; }
    return b;
  };

  // ---------------------------------------------------------------- the mix
  let vol = 1, muted = false;
  const master = gain(0.9), comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.3;
  master.connect(comp).connect(ctx.destination);
  const amb = gain(1), fx = gain(1), send = gain(1), verb = ctx.createConvolver();   // ambience ducks under speech; effects don't
  amb.connect(master); fx.connect(master);
  send.channelCount = 1; send.channelCountMode = 'explicit'; verb.buffer = tail();     // one mono convolution is plenty for a tail
  send.connect(verb).connect(gain(0.6)).connect(master);
  // an output for a one-shot: panned, and partly sent to the tail (far things are mostly tail)
  const spot = (pan = 0, wet = 0.15, bus: AudioNode = fx) => {
    const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); p.connect(bus);
    if (wet) p.connect(gain(wet)).connect(send);
    return p;
  };

  // ---------------------------------------------------------------- the beds (always running, silent until near)
  const W = loop(white), W2 = loop(white, 0.87), B = loop(brown), B2 = loop(brown, 0.8);   // two of each, so beds don't share one noise
  // breeze: low air moving, and the leaves stirring in it when it gusts
  const airF = filter('lowpass', 300, 0.5), airG = gain(); B.connect(airF).connect(airG).connect(amb);
  const leafF = filter('bandpass', 3800, 0.5), leafG = gain(); W.connect(leafF).connect(leafG).connect(amb);
  // the stream: a wandering wash of water and the bubbles' babble, placed at its nearest point
  const flowP = ctx.createStereoPanner(), flowF = filter('bandpass', 1000, 0.8), flowG = gain(); flowP.connect(amb);
  W.connect(flowF).connect(flowG).connect(flowP);
  const bubF = filter('highpass', 300), bubG = gain(); loop(babble(5.3)).connect(bubF); loop(babble(7.1), 0.91).connect(bubF); bubF.connect(bubG).connect(flowP);
  // the waterfall: a roar that opens up as you come close, over a low rumble you hear across the village
  const fallP = ctx.createStereoPanner(), fallF = filter('lowpass', 1200, 0.5), fallG = gain(), rumF = filter('lowpass', 260), rumG = gain(); fallP.connect(amb);
  W2.connect(fallF).connect(fallG).connect(fallP); B2.connect(rumF).connect(rumG).connect(fallP);
  // the campfire: two crackle loops of different lengths (so the pattern never comes round) over the flames' soft breath
  const fireP = ctx.createStereoPanner(), fireG = gain(), roarF = filter('lowpass', 380, 0.6), roarG = gain(); fireP.connect(amb);
  loop(crackle(4.3)).connect(fireG); loop(crackle(6.1), 0.93).connect(fireG); fireG.connect(fireP); B2.connect(roarF).connect(roarG).connect(fireP);
  // piloting the sky-boat: air rushing past that brightens with speed, over the hull's deep hum
  const rushF = filter('bandpass', 600, 0.6), rushG = gain(), hullF = filter('lowpass', 140), hullG = gain();
  W.connect(rushF).connect(rushG).connect(amb); B.connect(hullF).connect(hullG).connect(amb);

  // ---------------------------------------------------------------- small sound makers
  // a struck partial: rises quickly, then dies away over d seconds
  const ring = (out: AudioNode, f: number, a: number, d: number, t: number, rise = 0.004, type: OscillatorType = 'sine') => {
    const o = ctx.createOscillator(), g = gain(0); o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + rise); g.gain.exponentialRampToValueAtTime(0.0001, t + rise + d);
    o.connect(g).connect(out); o.start(t); o.stop(t + rise + d + 0.02);
  };
  // a breath of filtered noise
  const burst = (out: AudioNode, b: AudioBuffer, type: BiquadFilterType, f: number, q: number, a: number, rise: number, d: number, t = ctx.currentTime) => {
    const s = ctx.createBufferSource(), g = gain(0); s.buffer = b;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + rise); g.gain.exponentialRampToValueAtTime(0.0001, t + rise + d);
    s.connect(filter(type, f, q)).connect(g).connect(out); s.start(t, rnd() * (b.duration - 1)); s.stop(t + rise + d + 0.02);
  };
  // a run of soft bumps through one filter: wing beats, a sail luffing, hooves on soil (len must stay under 0.8 gap)
  const beats = (type: BiquadFilterType, f: number, n: number, gap: number, a: number, len: number, out: AudioNode) => {
    const t = ctx.currentTime, s = ctx.createBufferSource(), g = gain(0); s.buffer = brown; s.connect(filter(type, f, 0.9)).connect(g).connect(out);
    let st = t;
    for (let i = 0; i < n; i++, st += gap * (0.8 + rnd() * 0.4)) { g.gain.setValueAtTime(0, st); g.gain.linearRampToValueAtTime(a * (1 - i / (n + 1)), st + len * 0.2); g.gain.exponentialRampToValueAtTime(0.0001, st + len); }
    s.start(t, rnd() * 2); s.stop(st + len);
  };
  // a bubble: a quick sine whose pitch climbs as it dies
  const bubble = (out: AudioNode, a: number, t: number, f = 500 + rnd() * 700, len = 0.06) => {
    const o = ctx.createOscillator(), g = gain(0); o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 1.8, t + len * 0.8);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(out); o.start(t); o.stop(t + len + 0.01);
  };
  // timber creaking: stick-slip friction, a buzzy low tone wandering in pitch through a woody resonance
  const creak = (a: number, pan: number) => {
    const t = ctx.currentTime, d = 0.25 + rnd() * 0.45, o = ctx.createOscillator(), g = gain(0), f = 70 + rnd() * 60;
    o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * (0.7 + rnd() * 0.6), t + d * 0.5); o.frequency.linearRampToValueAtTime(f * (0.8 + rnd() * 0.5), t + d);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + d * 0.3); g.gain.linearRampToValueAtTime(a * 0.6, t + d * 0.7); g.gain.linearRampToValueAtTime(0, t + d);
    o.connect(filter('bandpass', 700 + rnd() * 500, 5)).connect(g).connect(spot(pan, 0.1)); o.start(t); o.stop(t + d + 0.02);
  };
  // a bird's phrase on one oscillator: far birds are duller and mostly tail
  const sing = (notes: Note[], pan: number, near: number) => {
    const t = ctx.currentTime + 0.05, o = ctx.createOscillator(), g = gain(0);
    o.connect(g).connect(filter('lowpass', 2500 + 8000 * near, 0.5)).connect(spot(pan, 0.5 - 0.35 * near, amb));
    let end = 0;
    for (const [s, d, f0, f1, a, att = Math.min(0.012, d * 0.3)] of notes) {
      const st = t + s, k = a * 0.05 * (0.3 + near); end = Math.max(end, s + d);
      o.frequency.setValueAtTime(f0, st); o.frequency.exponentialRampToValueAtTime(f1, st + d);
      g.gain.setValueAtTime(0, st); g.gain.linearRampToValueAtTime(k, st + att); g.gain.setValueAtTime(k, st + d - Math.min(0.05, d * 0.3)); g.gain.linearRampToValueAtTime(0, st + d);
    }
    o.start(t); o.stop(t + end + 0.05);
  };
  // the tea house's iron wind bell: a clear high ring with a slow beat in it, struck once or twice by its clapper
  const furin = (a: number, pan: number) => {
    const out = spot(pan, 0.35, amb), hits = 1 + Math.floor(rnd() * rnd() * 3.5);
    for (let i = 0, st = ctx.currentTime; i < hits; i++, st += 0.18 + rnd() * 0.3) {
      const k = a * (i ? 0.4 + rnd() * 0.4 : 1);
      ring(out, 1870, k, 3.2, st); ring(out, 1874, k * 0.7, 2.8, st); ring(out, 4910, k * 0.3, 1.1, st); ring(out, 8020, k * 0.1, 0.35, st);
    }
  };

  // ---------------------------------------------------------------- the birds: a few residents, each with its own song
  const vary = (x: number, k = 0.06) => x * (1 - k + 2 * k * rnd());
  const songs = {
    // the bush warbler, spring's own bird: a long held "hoo", then "ho-ke-kyo"; sometimes its valley call "ke-kyo, ke-kyo"
    uguisu: (): Note[] => {
      const k = vary(1), h = 0.7 + rnd() * 0.5;
      if (rnd() < 0.75) return [[0, h, 1050 * k, 1150 * k, 0.6, h * 0.4], [h + 0.12, 0.07, 1500 * k, 2100 * k, 0.8], [h + 0.24, 0.06, 2900 * k, 2600 * k, 0.9], [h + 0.34, 0.34, 2500 * k, 1850 * k, 1]];
      return Array.from({ length: 4 + Math.floor(rnd() * 5) }, (_, i): Note[] => [[i * 0.4, 0.06, 2900 * k, 2600 * k, 0.7], [i * 0.4 + 0.1, 0.2, 2500 * k, 2000 * k, 0.9 - i * 0.06]]).flat();
    },
    // a small brown bird's tumbling trill, falling as it goes
    trill: (): Note[] => {
      const n = 7 + Math.floor(rnd() * 9), p = vary(0.065, 0.2), f = 3600 + rnd() * 2400;
      return Array.from({ length: n }, (_, i): Note => { const fi = f * (1.08 - (0.3 * i) / n); return [i * p, p * 0.7, fi * 1.1, fi * 0.82, 0.45 + 0.55 * Math.sin((Math.PI * (i + 1)) / (n + 1))]; });
    },
    // a tit's ringing "tsu-pi, tsu-pi"
    tsupi: (): Note[] => { const k = vary(1, 0.05); return Array.from({ length: 2 + Math.floor(rnd() * 3) }, (_, i): Note[] => [[i * 0.34, 0.08, 6000 * k, 5800 * k, 0.6], [i * 0.34 + 0.12, 0.11, 4100 * k, 3800 * k, 0.8]]).flat(); },
    // a turtle dove far off: a soft, low "de-de, po-po", twice
    dove: (): Note[] => { const k = vary(1, 0.04); return [0, 2.4].flatMap((s): Note[] => [[s, 0.22, 520 * k, 480 * k, 0.8, 0.07], [s + 0.3, 0.2, 560 * k, 500 * k, 0.9, 0.07], [s + 0.6, 0.3, 470 * k, 430 * k, 1, 0.09], [s + 1.02, 0.32, 470 * k, 420 * k, 0.8, 0.09]]); },
  };
  // a resident's own little whistled phrase, a touch different every time it sings (a note dropped, a slide bent)
  const motif = () => {
    const m = Array.from({ length: 3 + Math.floor(rnd() * 3) }, () => [0.08 + rnd() * 0.16, 2000 + rnd() * 2200, 0.75 + rnd() * 0.5]);
    return (): Note[] => {
      const out: Note[] = []; let s = 0;
      for (const [d, f, slide] of m) { if (rnd() < 0.12) continue; const dd = vary(d, 0.1); out.push([s, dd, vary(f, 0.03), vary(f * slide, 0.03), 0.6 + 0.4 * rnd()]); s += dd + 0.04 + rnd() * 0.06; }
      return out;
    };
  };
  const flock = ([[songs.uguisu, 35, 90], [songs.trill, 15, 40], [songs.tsupi, 20, 50], [songs.dove, 45, 100], [motif(), 14, 36], [motif(), 18, 45]] as const)
    .map(([song, lo, hi]) => ({ song, lo, hi, t: 2 + rnd() * 14, bearing: rnd() * 6.283, near: 0.2 + rnd() * 0.45 }));

  // ---------------------------------------------------------------- where things are, for the listener
  const toStream = (x: number, z: number) => {   // distance to the stream's centre line, and the nearest point on it
    const S = at!.stream; let best = Infinity, bx = 0, bz = 0;
    for (let i = 0; i < S.length - 1; i++) {
      const [ax, az] = S[i], dx = S[i + 1][0] - ax, dz = S[i + 1][1] - az, k = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1));
      const px = ax + dx * k, pz = az + dz * k, d = (px - x) ** 2 + (pz - z) ** 2; if (d < best) { best = d; bx = px; bz = pz; }
    }
    return [Math.sqrt(best), bx, bz];
  };
  // stereo position of a point (+1 hard right of the camera); things right beside you sit nearer the middle
  const panAt = (e: Ears, x: number, z: number) => {
    const dx = x - e.x, dz = z - e.z, d = Math.hypot(dx, dz) || 1;
    return ((dx * -e.fz + dz * e.fx) / (d * (Math.hypot(e.fx, e.fz) || 1))) * 0.75 * Math.min(1, d / 4);
  };

  let steps: AudioBuffer | null = null, foot = 0;
  fetch('/game/sfx/steps.mp3').then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)).then((b) => { steps = b; }).catch(() => {});
  let acc = 0, gust = 0.4, gustTo = 0.5, gustT = 0, chimeT = 2, chimePan = 0, creakT = 3, flapT = 7, helmT = 0;
  const sailing = { v: 0, steer: 0, boost: false, lift: 0, at: -1 };   // what sail() last said, and when

  /** a footstep: pace 0 (a stroll) to 1 (a sprint) */
  const step = (surface: Surface | boolean, pace = 0.4) => {
    if (!steps) return;
    const s = typeof surface === 'boolean' ? (surface ? 'stone' : 'grass') : surface, t = ctx.currentTime, v = 0.15 + 0.17 * clamp(pace);
    const src = ctx.createBufferSource(), slot = (s === 'stone' || s === 'wood' ? 6 : 0) + (foot++ % 2) + 2 * Math.floor(rnd() * 3);
    src.buffer = steps; src.playbackRate.value = (s === 'wood' ? 0.86 : 0.94) + rnd() * 0.12;
    let tone: AudioNode = src.connect(filter('lowpass', { grass: 1600, stone: 4800, wood: 2400, water: 650 }[s], 0.5));
    if (s === 'wood') tone = tone.connect(filter('peaking', 230, 1.4, 8));                               // hollow boards
    tone.connect(gain(v * { grass: 0.9, stone: 0.75, wood: 0.6, water: 0.6 }[s])).connect(fx); src.start(t, slot * 0.5, 0.48);
    if (s === 'grass') burst(fx, white, 'bandpass', 4200 + rnd() * 1500, 0.8, 0.06 * v, 0.02, 0.12, t);   // blades brushing the ankles
    if (s === 'wood') { ring(fx, 150 + rnd() * 50, 0.05 * v, 0.14, t + 0.01); if (rnd() < 0.15) creak(0.015, 0); }   // the knock of a board, now and then a creak
    if (s === 'water') { burst(fx, white, 'bandpass', 1300 + rnd() * 700, 0.7, 0.07 * v, 0.03, 0.28, t); burst(fx, brown, 'lowpass', 500, 0.7, 0.12 * v, 0.05, 0.35, t + 0.04); bubble(fx, 0.03 * v, t + 0.06 + rnd() * 0.1); }
  };

  // recorded lines (Kokoro, rendered offline by game-assets/tools/voices.py). index.json lists what exists, so a missing
  // line costs no request; one clip at a time, and the ambience ducks under it
  type Index = { ext: string; clips: Record<string, [number, string]> };
  let index: Promise<Index | null> | null = null, voice: { src: AudioBufferSourceNode; g: GainNode } | null = null, said = 0;
  const lines = new Map<string, Promise<AudioBuffer | null>>();
  const known = () => (index ??= fetch('/game/voice/index.json').then((r) => (r.ok ? r.json() : null)).catch(() => null));
  const clip = (k: string, ext: string) => {
    let p = lines.get(k);
    if (!p) {
      p = fetch(`/game/voice/${k}.${ext}`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status))).then((b) => ctx.decodeAudioData(b)).catch(() => null);
      lines.set(k, p); if (lines.size > 32) lines.delete(lines.keys().next().value!);
    }
    return p;
  };
  const duck = (on: boolean) => amb.gain.setTargetAtTime(on ? 0.45 : 1, ctx.currentTime, on ? 0.12 : 0.5);
  const hush = () => { if (!voice) return; const { src, g } = voice; voice = null; g.gain.setTargetAtTime(0, ctx.currentTime, 0.04); src.stop(ctx.currentTime + 0.2); };
  const level = () => master.gain.setTargetAtTime(muted ? 0 : 0.9 * vol, ctx.currentTime, 0.08);

  return {
    update(dt: number, e: Ears | Legacy) {
      if ((acc += dt) < 0.1) return;
      const tick = acc, t = ctx.currentTime, set = (p: AudioParam, v: number, tau = 0.4) => p.setTargetAtTime(v, t, tau); acc = 0;
      const P = at && typeof e.x === 'number' ? (e as Ears) : null, ride = !!P?.ride;
      // the wind drifts toward a new strength every few seconds, so it swells and settles without a pattern
      if ((gustT -= tick) < 0) { gustT = 3 + rnd() * 6; gustTo = 0.15 + 0.85 * rnd() ** 1.5; }
      gust += (gustTo - gust) * 0.3 * tick;
      const w = gust * (ride ? 1 : 0.4 + 0.6 * clamp(e.wind ?? 0.3));
      set(airF.frequency, 140 + 420 * w + (ride ? 700 : 0)); set(airG.gain, (0.02 + 0.07 * w) * (ride ? 2.2 : 1), 0.8);
      set(leafF.frequency, 2800 + 2200 * rnd(), 0.05); set(leafG.gain, ride ? 0 : 0.022 * w * w * (0.6 + 0.8 * rnd()), 0.06);   // leaves flicker
      let river = clamp(Number((e as Legacy).river ?? 0)), fall = 0, fire = 0, chime = 0;
      if (P) {
        const [ds, sx, sz] = toStream(P.x, P.z), lip = at!.stream[at!.stream.length - 1], [fx0, fz0] = at!.fire, [cx, cz] = at!.chime;
        river = clamp(1 - (ds - 1.2) / 18); set(flowP.pan, panAt(P, sx, sz));
        fall = clamp(1 - (Math.hypot(P.x - lip[0], P.z - lip[1]) - 4) / 55); set(fallP.pan, panAt(P, lip[0], lip[1]));
        fire = clamp(1 - (Math.hypot(P.x - fx0, P.z - fz0) - 1.2) / 14); set(fireP.pan, panAt(P, fx0, fz0));
        chime = clamp(1 - (Math.hypot(P.x - cx, P.z - cz) - 2) / 22); chimePan = panAt(P, cx, cz);
      }
      set(flowF.frequency, 700 + 900 * rnd(), 0.04);                                  // the gurgle: the water's voice wanders
      set(flowG.gain, 0.07 * river ** 1.5); set(bubG.gain, 0.16 * river ** 2.5);
      set(fallF.frequency, 400 + 5200 * fall * fall); set(fallG.gain, 0.11 * fall ** 1.6); set(rumG.gain, 0.1 * fall ** 1.3);
      set(fireG.gain, 0.2 * fire * fire); set(roarF.frequency, 300 + 200 * rnd(), 0.08); set(roarG.gain, 0.09 * fire * fire * (0.6 + 0.6 * rnd()), 0.1);
      if (chime > 0.02 && (chimeT -= tick) < 0) { chimeT = (1.5 + rnd() * 6) / (0.4 + gust); furin(0.05 * chime ** 1.3, chimePan); }   // more in the gusts
      for (const b of flock) {
        if ((b.t -= tick) > 0) continue;
        b.t = b.lo + rnd() * (b.hi - b.lo);
        if (fall > 0.7 || (ride && rnd() < 0.6)) continue;                            // the falls drown them; few birds out over the clouds
        b.bearing += (rnd() - 0.5) * 0.8; b.near = Math.min(0.7, Math.max(0.15, b.near + (rnd() - 0.5) * 0.2));   // they move about a little
        const sx = Math.sin(b.bearing), sz = Math.cos(b.bearing);
        sing(b.song(), (P ? (sx * -P.fz + sz * P.fx) / (Math.hypot(P.fx, P.fz) || 1) : sx) * 0.85, b.near);
      }
      if (ride && (creakT -= tick) < 0) { creakT = 1.5 + rnd() * 4; creak(0.035 * (0.5 + rnd()), (rnd() - 0.5) * 1.2); }   // the boat's timbers
      const helm = t - sailing.at < 0.25, sv = helm ? sailing.v : 0;                // sail() stops being called: the rush dies away
      set(rushF.frequency, 450 + 2600 * sv + 500 * sailing.lift * sv, 0.25); set(rushG.gain, 0.08 * sv ** 1.5, 0.25); set(hullG.gain, 0.07 * sv, 0.5);
      if (helm && Math.abs(sailing.steer) > 0.3 && (helmT -= tick) < 0) { helmT = 0.9 + rnd() * 1.4; creak(0.015 + 0.02 * Math.abs(sailing.steer), sailing.steer * 0.4); }   // the helm and the hull answer a turn
      if (ride && (flapT -= tick) < 0) { flapT = 5 + rnd() * 9; beats('bandpass', 380, 3 + Math.floor(rnd() * 5), 0.14, 0.05 * (0.5 + gust), 0.1, spot((rnd() - 0.5) * 0.6, 0.1)); }   // the sail luffing
    },
    step,
    /** while piloting the sky-boat, every frame: speed and steer from the controls (speed 0–1, steer -1 left to 1 right),
     *  boost held, lift -1 sinking to 1 climbing. Stop calling it and the rush fades on its own. */
    sail(speed: number, steer = 0, boost = false, lift = 0) {
      if (boost && !sailing.boost) {                                               // a gentle whoosh as the boost catches
        const t = ctx.currentTime, s = ctx.createBufferSource(), f = filter('bandpass', 400, 1.2), g = gain(0); s.buffer = white;
        f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(2400, t + 0.5);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.07, t + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
        s.connect(f).connect(g).connect(spot(0, 0.2)); s.start(t, rnd()); s.stop(t + 0.92);
      }
      Object.assign(sailing, { v: clamp(speed), steer: Math.max(-1, Math.min(1, steer)), boost, lift: Math.max(-1, Math.min(1, lift)), at: ctx.currentTime });
    },
    /** the boat bumping something: a padded wooden thud and a groan from the timbers, strength 0–1 */
    bump(strength: number) {
      const k = clamp(strength), t = ctx.currentTime, out = spot((rnd() - 0.5) * 0.4, 0.25);
      burst(out, brown, 'lowpass', 160, 0.7, 0.3 * k, 0.008, 0.3, t); ring(out, 85 + rnd() * 20, 0.1 * k, 0.35, t, 0.006);
      if (k > 0.3) creak(0.03 * k, (rnd() - 0.5) * 0.6);
    },
    /** coming down from a jump */
    land(surface: Surface) { step(surface, 1); burst(fx, brown, 'lowpass', 180, 0.7, 0.12, 0.01, 0.15); },
    /** a villager's voice when a line has no recording: soft wordless syllables through two moving vowel formants */
    murmur(pitch: number, chars: number) {
      const t0 = ctx.currentTime + 0.02, n = Math.min(24, Math.max(3, Math.round(chars / 5))), o = ctx.createOscillator(), g = gain(0), fm = pitch ** 0.3;
      const f1 = filter('bandpass', 600, 4), f2 = filter('bandpass', 1500, 5), out = filter('lowpass', 2600, 0.5);
      o.type = 'sawtooth'; o.connect(g); g.connect(f1).connect(out); g.connect(f2).connect(gain(0.6)).connect(out); out.connect(fx);
      let st = t0;
      for (let i = 0; i < n; i++) {
        const d = 0.07 + rnd() * 0.07, [a, b] = [[730, 1090], [270, 2290], [300, 870], [530, 1840], [570, 840]][Math.floor(rnd() * 5)];
        o.frequency.setValueAtTime(150 * pitch * (1.06 - (0.14 * i) / n) * (0.95 + rnd() * 0.1), st); f1.frequency.setValueAtTime(a * fm, st); f2.frequency.setValueAtTime(b * fm, st);
        g.gain.setValueAtTime(0, st); g.gain.linearRampToValueAtTime(0.18, st + 0.018); g.gain.setValueAtTime(0.18, st + d - 0.03); g.gain.linearRampToValueAtTime(0, st + d);
        st += d + 0.02 + (rnd() < 0.18 ? 0.12 : 0.01 * rnd());                          // little gaps, and a pause between "words"
      }
      o.start(t0); o.stop(st + 0.05);
    },
    /** play a recorded line, "<villagerId>/<key>" (e.g. "genzo/greet0"), stopping the one before; null just stops.
     *  Resolves to the clip's length in seconds, 0 when there's no recording (murmur instead), -1 if a newer call took over. */
    async speak(k: string | null) {
      const n = ++said; hush();
      const ix = k ? await known() : null, b = k && ix?.clips[k] ? await clip(k, ix.ext) : null;
      if (n !== said) return -1;
      if (!b) { duck(false); return 0; }
      const src = ctx.createBufferSource(), g = gain(0.9); src.buffer = b; src.connect(g).connect(master); g.connect(gain(0.08)).connect(send);   // a touch of the valley around it
      voice = { src, g }; duck(true); src.onended = () => { if (voice?.src === src) { voice = null; duck(false); } };
      src.start(ctx.currentTime + 0.03);
      return b.duration;
    },
    /** fetch and decode a line ahead of time (the next page of a conversation) */
    preload(k: string) { known().then((ix) => ix?.clips[k] && clip(k, ix.ext)); },
    /** hammer on an anvil across the village, softer and duller with distance */
    clang(dist: number) {
      if (dist > 34) return;
      const v = 0.07 / (1 + dist / 8), t = ctx.currentTime, k = 0.97 + rnd() * 0.06, out = filter('lowpass', 1800 + 6000 / (1 + dist / 10), 0.5);
      out.connect(spot(0, 0.15 + dist / 60));
      for (const [f, d] of [[523, 0.7], [1187, 0.5], [1831, 0.35], [2647, 0.22]]) ring(out, f * k, f < 600 ? v : v * 0.6, d, t);
    },
    /** the temple bell (ghanta), struck by its clapper: a bright brass clang that rings on and beats as it fades, each
     *  stroke (k) a touch different */
    ghanta(k = 0) {
      const t = ctx.currentTime + 0.005, out = spot(0, 0.45), v = 1 - 0.12 * k, d = 1 + 0.004 * ((k * 7) % 3);
      burst(out, white, 'bandpass', 4200, 2, 0.04 * v, 0.001, 0.03, t);             // the clapper's knock on the lip
      for (const [f, a, dur] of [[612, 0.1, 6], [615.5, 0.07, 5.5], [1405, 0.07, 4], [1650, 0.05, 3.2], [2290, 0.035, 2.2], [3160, 0.02, 1.4], [4380, 0.01, 0.7]]) ring(out, f * d, a * v, dur, t, 0.002);
    },
    /** the pandit's brass hand bell during the aarti: a small bright ting, softer with distance (unheard past the bridge) */
    handbell(dist: number) {
      if (dist > 26) return;
      const v = 0.035 / (1 + dist / 5), t = ctx.currentTime, k = 0.98 + rnd() * 0.04, out = filter('lowpass', 3000 + 7000 / (1 + dist / 6), 0.5);
      out.connect(spot(0, 0.2 + dist / 50));
      for (const [f, a, d] of [[1560, 1, 1.4], [1567, 0.6, 1.2], [3910, 0.35, 0.6], [6120, 0.15, 0.25]]) ring(out, f * k, v * a, d, t);
    },
    /** a voice from one oscillator through a formant filter that sweeps (a mouth opening and closing): the village's
     *  creatures and the vendor's wordless call. pts: [time, pitch, formant] */
    voice(pts: number[][], v: number, dist: number, type: OscillatorType = 'sawtooth', q = 3) {
      const t = ctx.currentTime, o = ctx.createOscillator(), g = gain(0), fo = filter('bandpass', pts[0][2], q), end = pts[pts.length - 1][0];
      fo.connect(filter('lowpass', 2000 + 8000 / (1 + dist / 8), 0.5)).connect(spot(0, 0.2 + Math.min(0.4, dist / 60)));
      o.type = type; o.frequency.setValueAtTime(pts[0][1], t); fo.frequency.setValueAtTime(pts[0][2], t);
      for (const [s, f, ff] of pts.slice(1)) { o.frequency.linearRampToValueAtTime(f, t + s); fo.frequency.linearRampToValueAtTime(ff, t + s); }
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.03); g.gain.setValueAtTime(v, t + end * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + end);
      o.connect(g).connect(fo); o.start(t); o.stop(t + end + 0.02);
    },
    /** a hen: one or two soft clucks pecking about; a quick, higher run of them when she scatters */
    cluck(dist: number, alarm = false) {
      if (dist > 25) return;
      const t0 = ctx.currentTime, n = alarm ? 3 + Math.floor(rnd() * 3) : 1 + Math.floor(rnd() * 2), v = (alarm ? 0.03 : 0.02) / (1 + dist / 6);
      const out = filter('bandpass', alarm ? 1100 : 850, 2); out.connect(filter('lowpass', 2500 + 6000 / (1 + dist / 6), 0.5)).connect(spot((rnd() - 0.5) * 0.6, 0.2 + dist / 60));
      for (let i = 0; i < n; i++) {
        const t = t0 + i * (alarm ? 0.11 : 0.16) + rnd() * 0.02, o = ctx.createOscillator(), g = gain(0), f = (alarm ? 520 : 400) * (0.95 + rnd() * 0.1);
        o.type = 'triangle'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.7, t + 0.08);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
        o.connect(g).connect(out); o.start(t); o.stop(t + 0.1); burst(out, white, 'bandpass', 1400, 1.5, v * 0.4, 0.004, 0.05, t);
      }
    },
    /** the rooster, crowing somewhere across the village: soft, never shrill */
    crow(dist: number) { if (dist < 70) this.voice([[0, 520, 900], [0.15, 700, 1300], [0.5, 720, 1200], [0.75, 760, 1100], [1.1, 470, 700]], 0.016 / (1 + dist / 20), dist, 'sawtooth', 4); },
    /** the cat, woken: a small sleepy "mi-aow" */
    meow(dist: number) { if (dist < 20) this.voice([[0, 470, 800], [0.2, 640, 1900], [0.5, 430, 900]], 0.03 / (1 + dist / 5), dist, 'sawtooth', 5); },
    /** the dog has spotted you: one or two short, friendly woofs */
    bark(dist: number) {
      if (dist > 30) return;
      const n = rnd() < 0.5 ? 1 : 2, v = 0.05 / (1 + dist / 8), out = filter('bandpass', 700, 1.2); out.connect(spot(0, 0.2 + dist / 60));
      for (let i = 0; i < n; i++) {
        const t = ctx.currentTime + i * 0.24, o = ctx.createOscillator(), g = gain(0);
        o.type = 'sawtooth'; o.frequency.setValueAtTime(300, t); o.frequency.exponentialRampToValueAtTime(190, t + 0.12);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
        o.connect(g).connect(out); o.start(t); o.stop(t + 0.16); burst(out, brown, 'bandpass', 500, 1, v * 0.6, 0.01, 0.12, t);
      }
    },
    /** children at play: a short run of giggles, light and breathy */
    giggle(dist: number) {
      if (dist > 30) return;
      const n = 3 + Math.floor(rnd() * 3), v = 0.018 / (1 + dist / 8), out = filter('bandpass', 1800, 1); out.connect(spot((rnd() - 0.5) * 0.6, 0.2 + dist / 60));
      for (let i = 0; i < n; i++) {
        const t = ctx.currentTime + i * (0.09 + rnd() * 0.03), o = ctx.createOscillator(), g = gain(0), f = (1000 + rnd() * 250) * (1 - i * 0.04);
        o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.82, t + 0.07);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
        o.connect(g).connect(out); o.start(t); o.stop(t + 0.09); burst(out, white, 'bandpass', 2500, 1, v * 0.5, 0.01, 0.06, t);
      }
    },
    /** the market vendor calling out to passers-by: a wordless, sing-song "hoo-oi" */
    call(dist: number) { if (dist < 30) this.voice([[0, 175, 650], [0.35, 215, 800], [0.6, 205, 1700], [0.95, 165, 1500]], 0.022 / (1 + dist / 8), dist, 'sawtooth', 4); },
    /** something small dropping into the pond */
    plop() { const t = ctx.currentTime, out = spot((rnd() - 0.5) * 0.4, 0.1); bubble(out, 0.05, t, 260 + rnd() * 160, 0.09); burst(out, white, 'highpass', 2500, 0.7, 0.012, 0.002, 0.04, t); },
    /** a bird taking off: wing beats, fading as it goes */
    flutter() { beats('bandpass', 750 + rnd() * 400, 6 + Math.floor(rnd() * 4), 0.058, 0.06, 0.045, spot((rnd() - 0.5) * 0.8, 0.1)); },
    /** a sika deer's call: a high, breathy whistle that rises and falls away, quieter and duller with distance */
    deer(dist: number) {
      const t = ctx.currentTime, v = 0.04 / (1 + dist / 10), o = ctx.createOscillator(), g = gain(0), vib = ctx.createOscillator(), vg = gain(12), out = filter('lowpass', 1600 + 6000 / (1 + dist / 12), 0.5);
      out.connect(spot(0, 0.2 + Math.min(0.4, dist / 80)));
      o.frequency.setValueAtTime(1150, t); o.frequency.exponentialRampToValueAtTime(1650, t + 0.14); o.frequency.exponentialRampToValueAtTime(880, t + 0.7);
      vib.frequency.value = 7; vib.connect(vg).connect(o.frequency);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.06); g.gain.setValueAtTime(v, t + 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
      o.connect(g).connect(out); o.start(t); o.stop(t + 0.78); vib.start(t); vib.stop(t + 0.78);
      burst(out, white, 'bandpass', 1500, 2, v * 0.5, 0.06, 0.5, t);                  // breath
    },
    /** cranes calling in a pair: soft bugle notes, answered */
    crane(dist: number) {
      const t = ctx.currentTime, v = 0.03 / (1 + dist / 14), out = filter('lowpass', 2200, 0.5);
      out.connect(spot(0, 0.3 + Math.min(0.4, dist / 60)));
      for (const [s, f] of [[0, 980], [0.3, 760], [0.62, 990], [0.92, 770]].slice(0, rnd() < 0.5 ? 2 : 4)) {
        const o = ctx.createOscillator(), g = gain(0), st = t + s; o.type = 'triangle'; o.frequency.setValueAtTime(f, st); o.frequency.linearRampToValueAtTime(f * 1.05, st + 0.22);
        g.gain.setValueAtTime(0, st); g.gain.linearRampToValueAtTime(v, st + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, st + 0.28);
        o.connect(g).connect(out); o.start(st); o.stop(st + 0.3);
      }
    },
    /** something bolting: a rustle through the grass and, for deer, a few hoofbeats on the soil */
    bolt(dist: number, hooves: boolean) {
      const v = 1 / (1 + dist / 6), out = spot((rnd() - 0.5) * 0.6, 0.1);
      burst(out, white, 'bandpass', 2600, 0.7, 0.05 * v, 0.04, 0.4);
      if (hooves) beats('lowpass', 240, 4 + Math.floor(rnd() * 3), 0.13, 0.12 * v, 0.09, out);
    },
    setMuted(on: boolean) { muted = on; level(); },
    /** overall loudness, 0–1 (the game's Low and High) */
    setVolume(v: number) { vol = clamp(v); level(); },
  };
}
