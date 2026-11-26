'use client';
import { useEffect, useRef, useState } from 'react';
import Cursor from './Cursor';

const WORD = 'automation.';

// Three small jobs the agent works through on repeat. The second message always asks before acting.
const SCENES = [
  { b1: 'Drafted 14 replies while you were in a meeting.', b2: '3 invoices filed. Approve the summary?', work: ['Drafting replies…', 'Filing invoices…'] },
  { b1: 'Built the weekly report from 4 spreadsheets.', b2: 'The report is ready. Send it to the team?', work: ['Building the report…', 'Checking the numbers…'] },
  { b1: 'Sorted 62 emails. 5 need you today.', b2: 'Book the 3 meetings they asked for?', work: ['Sorting the inbox…', 'Finding free times…'] },
];

type Tone = 'royal' | 'amber' | 'green';
type Shot = {
  m1: number; m2: number;          // which scene each bubble is showing
  t1: boolean; t2: boolean;        // bubble is typing
  chip: 'ask' | 'press' | 'done' | 'none';
  pill: [string, Tone];
  to: string;                      // where the Approval cursor has travelled (CSS translate, so the press scale can't shrink the trip)
  busy: boolean;                   // Approval cursor is away from home
};
const START: Shot = { m1: 0, m2: 0, t1: false, t2: false, chip: 'ask', pill: ['Agent running', 'royal'], to: 'none', busy: false };

// A message line. While typing, the old text keeps the bubble's size and the dots sit on top.
function Line({ text, typing }: { text: string; typing: boolean }) {
  return (
    <span className="msg">
      <span key={text} className={typing ? 'ghost' : 'swap'}>{text}</span>
      {typing && <span className="typing"><i /><i /><i /></span>}
    </span>
  );
}

// One giant word, with the small signs of an agent at work floating around it: a status pill, two
// messages, and the cursors of everyone involved. Once it has arrived it plays a loop: the agent asks,
// the Approval cursor clicks Approve, and the agent moves on to the next job.
// With reduced motion (or no script) it stays as the still first frame.
export default function Hero() {
  const [s, setS] = useState<Shot>(START);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const wakeRef = useRef(() => {});
  const root = useRef<HTMLElement>(null);
  const chip = useRef<HTMLSpanElement>(null);
  const hand = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const html = document.documentElement;
    if (!html.classList.contains('js-motion')) return;
    if (html.classList.contains('motion-paused')) { pausedRef.current = true; setPaused(true); }

    let alive = true, inView = true, timer = 0;
    let wake: (() => void) | null = null;
    const ready = () => inView && !document.hidden && !pausedRef.current;
    const nudge = () => { if (wake && ready()) { const w = wake; wake = null; w(); } };
    wakeRef.current = nudge;
    const io = new IntersectionObserver(([e]) => { inView = e.isIntersecting; nudge(); });
    io.observe(root.current!);
    document.addEventListener('visibilitychange', nudge);

    // wait, then hold while the hero is off screen, the tab is hidden or motion is paused
    const beat = async (ms: number) => {
      await new Promise<void>((r) => { timer = window.setTimeout(r, ms); });
      if (!ready()) await new Promise<void>((r) => { wake = r; });
      return alive;
    };
    const set = (p: Partial<Shot>) => setS((prev) => ({ ...prev, ...p }));
    // measured while the Approval cursor is home (no transform), so the offset to the chip is direct
    const reach = () => {
      const c = chip.current!.getBoundingClientRect(), h = hand.current!.getBoundingClientRect();
      return `${Math.round(c.left + c.width * 0.45 - h.left)}px ${Math.round(c.top + c.height * 0.55 - h.top)}px`;
    };

    (async () => {
      let n = 0;
      if (!(await beat(2600))) return; // let the entrance finish
      while (true) {
        set({ pill: ['Waiting for you', 'amber'] });
        if (!(await beat(700))) return;
        set({ to: reach(), busy: true });
        if (!(await beat(1050))) return;
        set({ chip: 'press' });
        if (!(await beat(200))) return;
        set({ chip: 'done', pill: ['Approved · on it', 'green'], to: 'none' });
        if (!(await beat(2600))) return;
        n = (n + 1) % SCENES.length;
        set({ t1: true, busy: false, pill: [SCENES[n].work[0], 'royal'] });
        if (!(await beat(1500))) return;
        set({ t1: false, m1: n });
        if (!(await beat(1600))) return;
        set({ t2: true, chip: 'none', pill: [SCENES[n].work[1], 'royal'] });
        if (!(await beat(1500))) return;
        set({ t2: false, m2: n, chip: 'ask' });
        if (!(await beat(1800))) return;
      }
    })();

    return () => {
      alive = false;
      wake = null;
      window.clearTimeout(timer);
      io.disconnect();
      document.removeEventListener('visibilitychange', nudge);
    };
  }, []);

  // stops every looping animation on the site (WCAG 2.2.2); one-off entrances still finish
  const toggle = () => {
    const p = !pausedRef.current;
    pausedRef.current = p;
    setPaused(p);
    document.documentElement.classList.toggle('motion-paused', p);
    if (!p) wakeRef.current();
  };

  return (
    <section ref={root} className="hero" aria-labelledby="hero-title">
      <h1 id="hero-title" className="sr-only">Aasish Shrestha, AI engineer. I build automation that runs itself, safely.</h1>
      <div className="hero-stage">
        <p className="hero-word" aria-hidden="true">
          {WORD.split('').map((c, i) => <span key={i} style={{ ['--i' as string]: i }}>{c}</span>)}
        </p>

        <div className="hero-float" aria-hidden="true">
          <span className={`status-pill f-status tone-${s.pill[1]}`}><i /><span key={s.pill[0]} className="swap">{s.pill[0]}</span></span>

          <div className="bubble f-b1">
            <span className="avatar">A</span>
            <span className="bubble-body">
              <span className="bubble-meta"><b>Aasish</b> just now</span>
              <Line text={SCENES[s.m1].b1} typing={s.t1} />
            </span>
          </div>

          <div className="bubble f-b2">
            <span className="avatar">A</span>
            <span className="bubble-body">
              <span className="bubble-meta"><b>Aasish</b> just now</span>
              <Line text={SCENES[s.m2].b2} typing={s.t2} />
              <span ref={chip} className={`approve ${s.chip}`}>{s.chip === 'done' ? '✓ Approved' : 'Approve'}</span>
            </span>
          </div>

          <Cursor label="You" tone="royal" className="f-c1" />
          <Cursor label="Agent" tone="ink" className="f-c2" />
          <Cursor label="Data" tone="green" className="f-c3" />
          <span className={`f-c4${s.busy ? ' busy' : ''}`}>
            <span ref={hand} className={`travel${s.chip === 'press' ? ' press' : ''}`} style={{ translate: s.to }}>
              <Cursor label="Approval" tone="amber" />
            </span>
          </span>
        </div>
      </div>
      <p className="hero-sub">
        <span>Aasish Shrestha</span>
        <button type="button" className="motion-toggle" onClick={toggle}>
          <i className={paused ? 'play' : 'pause'} aria-hidden="true" />{paused ? 'Play motion' : 'Pause motion'}
        </button>
        <span>AI engineer · Fort Worth, Texas</span>
      </p>
    </section>
  );
}
