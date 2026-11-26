// Original 45-second score for the ad, composed and synthesised from scratch (no samples, no
// third-party recordings): calm, warm and premium, 96 BPM, D major. One bar = 2.5 s, so every scene
// change in the film lands on a downbeat. Writes a 44.1 kHz stereo WAV.
//
//   node video/music.mjs video/out/score.wav

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const OUT = process.argv[2] || 'video/out/score.wav';
const SR = 44100, BPM = 96, BEAT = 60 / BPM, BAR = BEAT * 4, DUR = 45;
const N = Math.round(SR * DUR);
const L = new Float32Array(N), R = new Float32Array(N);       // dry
const sL = new Float32Array(N), sR = new Float32Array(N);     // reverb send

// deterministic noise so every render is identical
let seed = 1234567;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const at = (sec) => Math.round(sec * SR);
const add = (i, l, r, send = 0) => { if (i < 0 || i >= N) return; L[i] += l; R[i] += r; if (send) { sL[i] += l * send; sR[i] += r * send; } };

// Chords (MIDI notes), one per bar across the 18 bars of the film.
const D = [50, 57, 61, 64, 66], Bm = [47, 54, 57, 61, 62], G = [43, 50, 54, 57, 59], A = [45, 52, 57, 59, 64];
const PROG = [D, D, Bm, Bm, G, A, D, Bm, D, Bm, G, A, G, A, Bm, G, D, D];
// Section gains per bar: intro, problem, answer, trust, Nova OS, Hitmen, proof, call to action.
const padGain = [.7, .9, .8, .8, .7, .7, .7, .7, .6, .6, .6, .6, .6, .6, .6, .7, 1, 1];

// ---- pad: soft additive chords with slow attack, gentle detune and vibrato ----
const HARM = [1, .34, .12, .04, .015];
function pad(notes, t0, t1, gain) {
  const att = t0 === 0 ? 2.4 : .7, rel = 1.4;
  for (const m of notes) {
    const f = hz(m);
    for (let h = 0; h < HARM.length; h++) {
      const amp = .022 * gain * HARM[h] / (m < 48 ? 1.6 : 1);
      const dL = Math.pow(2, -3 / 1200), dR = Math.pow(2, 3 / 1200);
      for (let i = at(t0); i < at(t1 + rel); i++) {
        const t = i / SR, lt = t - t0;
        const env = Math.min(1, lt / att) * (t > t1 ? Math.max(0, 1 - (t - t1) / rel) : 1);
        if (env <= 0) continue;
        const vib = 1 + .0016 * Math.sin(2 * Math.PI * .23 * t + m);
        const ph = 2 * Math.PI * f * (h + 1) * lt * vib;
        add(i, amp * env * Math.sin(ph * dL), amp * env * Math.sin(ph * dR + .4), .55);
      }
    }
  }
}
PROG.forEach((ch, b) => pad(ch.slice(1), b * BAR, (b + 1) * BAR, padGain[b]));

// ---- warmth: a soft sine an octave under each chord's root ----
PROG.forEach((ch, b) => {
  const f = hz(ch[0] - 12), t0 = b * BAR, t1 = (b + 1) * BAR;
  for (let i = at(t0); i < at(t1 + .8); i++) {
    const lt = i / SR - t0, t = i / SR;
    const env = Math.min(1, lt / (b === 0 ? 2.4 : .6)) * (t > t1 ? Math.max(0, 1 - (t - t1) / .8) : 1);
    const s = Math.sin(2 * Math.PI * f * lt) * .03 * env;
    add(i, s, s);
  }
});

// ---- bass: warm sine on the root, half notes, from the problem scene on ----
function bass(m, t0, len, gain) {
  const f = hz(m);
  for (let i = at(t0); i < at(t0 + len + .3); i++) {
    const lt = i / SR - t0;
    const env = Math.min(1, lt / .012) * (lt < len ? .55 + .45 * Math.exp(-lt * 3) : Math.max(0, 1 - (lt - len) / .3) * .55);
    const s = Math.sin(2 * Math.PI * f * lt) + .28 * Math.sin(4 * Math.PI * f * lt);
    add(i, s * env * gain, s * env * gain);
  }
}
for (let b = 2; b < 16; b++) for (const k of [0, 2]) bass(PROG[b][0] - 12, b * BAR + k * BEAT, BEAT * 2 - .05, .16);
bass(38, 16 * BAR, 4.6, .2);

// ---- pluck: Karplus-Strong string arpeggio in eighth notes ----
function pluck(m, t0, gain, pan) {
  const f = hz(m), n = Math.max(2, Math.round(SR / f));
  const buf = new Float32Array(n);
  let prev = 0;
  for (let k = 0; k < n; k++) { const x = rnd(); prev = prev * .78 + x * .22; buf[k] = prev; }
  let idx = 0;
  const len = at(1.6);
  for (let j = 0; j < len; j++) {
    const a = buf[idx], b2 = buf[(idx + 1) % n];
    buf[idx] = .4975 * (a + b2);
    const env = Math.min(1, j / 40);
    const s = a * gain * env;
    add(at(t0) + j, s * (1 - pan), s * (1 + pan), .45);
    idx = (idx + 1) % n;
  }
}
const ARP = [0, 2, 1, 3, 2, 1, 3, 2];
for (let b = 4; b < 16; b++) {
  const tones = PROG[b].slice(1).map((m) => m + 12);
  const fade = b === 15 ? .5 : 1;
  for (let e = 0; e < 8; e++) {
    const accent = e % 2 === 0 ? 1 : .7;
    pluck(tones[ARP[e] % tones.length], b * BAR + e * BEAT / 2, .085 * accent * fade, e % 2 ? .25 : -.25);
  }
}
// final rolled chord on the call-to-action downbeat
[62, 66, 69, 73, 76, 81].forEach((m, k) => pluck(m, 16 * BAR + k * .06, .12, (k - 2.5) * .12));

// ---- percussion: soft kick, light hats, a gentle snap in the product scenes ----
function kick(t0, gain) {
  let ph = 0;
  for (let j = 0; j < at(.45); j++) {
    const lt = j / SR, f = 46 + 70 * Math.exp(-lt * 28);
    ph += 2 * Math.PI * f / SR;
    const s = Math.sin(ph) * Math.exp(-lt * 7.5) * gain + (j < 120 ? rnd() * .04 * gain : 0);
    add(at(t0) + j, s, s);
  }
}
function hat(t0, gain) {
  let last = 0, lp = 0;
  for (let j = 0; j < at(.05); j++) {
    const x = rnd(), hp = x - last; last = x;
    lp += .45 * (hp - lp);
    const s = lp * Math.exp(-j / SR * 70) * gain;
    add(at(t0) + j, s * .8, s, .2);
  }
}
function snap(t0, gain) {
  let lp1 = 0, lp2 = 0;
  for (let j = 0; j < at(.18); j++) {
    const lt = j / SR, x = rnd();
    lp1 += .2 * (x - lp1); lp2 += .05 * (x - lp2);
    const burst = lt < .012 ? 1 : lt < .02 ? .6 : 1;
    const s = (lp1 - lp2) * Math.exp(-lt * 26) * gain * burst;
    add(at(t0) + j, s, s * .9, .5);
  }
}
for (let b = 4; b < 15; b++) {
  kick(b * BAR, .34); kick(b * BAR + 2 * BEAT, .3);
  if (b >= 6) for (let e = 0; e < 4; e++) hat(b * BAR + e * BEAT + BEAT / 2, .03);
  if (b >= 8) { snap(b * BAR + BEAT, .1); snap(b * BAR + 3 * BEAT, .1); }
}
kick(15 * BAR, .3);

// ---- riser into the call to action (bar 16), then an impact and a bell ----
{
  let lp = 0;
  const t0 = 15 * BAR, t1 = 16 * BAR - .08;
  for (let i = at(t0); i < at(t1); i++) {
    const k = (i / SR - t0) / (t1 - t0);
    lp += (.01 + .25 * k * k) * (rnd() - lp);
    const s = lp * .2 * k * k;
    add(i, s, s * .95, .3);
  }
}
{
  const t0 = 16 * BAR;
  let ph = 0;
  for (let j = 0; j < at(2.6); j++) {
    const lt = j / SR, f = 38 + 22 * Math.exp(-lt * 5);
    ph += 2 * Math.PI * f / SR;
    const s = Math.sin(ph) * Math.exp(-lt * 1.9) * .32;
    add(at(t0) + j, s, s);
  }
  const PART = [[1, .06], [2.76, .02], [5.4, .006]];
  for (const [r, a] of PART) for (let j = 0; j < at(3.4); j++) {
    const lt = j / SR, s = Math.sin(2 * Math.PI * 587.33 * r * lt) * a * Math.exp(-lt * (1.1 + r * .25));
    add(at(t0) + j, s, s, .6);
  }
}

// ---- reverb (Freeverb-style combs + allpasses) on the send ----
function reverb(input, offset) {
  const out = new Float32Array(N);
  const combs = [1116, 1188, 1277, 1356, 1422, 1491].map((d) => ({ buf: new Float32Array(d + offset), i: 0, lp: 0 }));
  for (let n = 0; n < N; n++) {
    let acc = 0;
    for (const c of combs) {
      const y = c.buf[c.i];
      c.lp = y * .55 + c.lp * .45;
      c.buf[c.i] = input[n] + c.lp * .84;
      c.i = (c.i + 1) % c.buf.length;
      acc += y;
    }
    out[n] = acc / combs.length;
  }
  for (const d of [556 + offset, 441 + offset]) {
    const buf = new Float32Array(d); let i = 0;
    for (let n = 0; n < N; n++) { const b = buf[i]; const y = -out[n] + b; buf[i] = out[n] + b * .5; i = (i + 1) % d; out[n] = y; }
  }
  return out;
}
const wL = reverb(sL, 0), wR = reverb(sR, 23);

// ---- master: mix, gentle saturation, fade to silence at 45 s, normalise ----
const mix = new Float32Array(N * 2);
const lpa = 1 - Math.exp(-2 * Math.PI * 6000 / SR);
let peak = 0, yl = 0, yr = 0;
for (let n = 0; n < N; n++) {
  const t = n / SR;
  const fade = t > 43.2 ? Math.max(0, 1 - (t - 43.2) / 1.8) : 1;
  const fin = Math.min(1, t / .05);
  yl += lpa * (L[n] + wL[n] * .9 - yl); yr += lpa * (R[n] + wR[n] * .9 - yr);
  const l = Math.tanh(yl * 1.3) * fade * fin;
  const r = Math.tanh(yr * 1.3) * fade * fin;
  mix[2 * n] = l; mix[2 * n + 1] = r;
  peak = Math.max(peak, Math.abs(l), Math.abs(r));
}
const g = .89 / peak;
const pcm = Buffer.alloc(44 + N * 4);
pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + N * 4, 4); pcm.write('WAVE', 8); pcm.write('fmt ', 12);
pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(2, 22); pcm.writeUInt32LE(SR, 24);
pcm.writeUInt32LE(SR * 4, 28); pcm.writeUInt16LE(4, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(N * 4, 40);
for (let k = 0; k < N * 2; k++) pcm.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(mix[k] * g * 32767))), 44 + k * 2);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, pcm);
console.log(`wrote ${OUT}: ${DUR}s, ${SR} Hz stereo, peak gain ${g.toFixed(2)}`);
