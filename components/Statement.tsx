'use client';
import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

const LINE = 'I build AI agents and automation for teams who can’t afford to leak their data.';

// A pinned statement that fills in word by word, grey to ink, as you scroll through it.
// With reduced motion it is simply shown in full.
export default function Statement() {
  const section = useRef<HTMLElement>(null);
  const words = useRef<HTMLSpanElement[]>([]);
  const sub = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = section.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      words.current.forEach((w) => w.classList.add('on'));
      sub.current?.classList.add('on');
      return;
    }
    gsap.registerPlugin(ScrollTrigger);
    let lit = -1;
    const st = ScrollTrigger.create({
      trigger: el,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => {
        // words finish filling at 80% so the last one rests on screen before the pin releases
        const n = Math.min(words.current.length, Math.floor((self.progress / 0.8) * words.current.length));
        if (n !== lit) {
          words.current.forEach((w, i) => w.classList.toggle('on', i < n));
          lit = n;
        }
        sub.current?.classList.toggle('on', self.progress > 0.84);
      },
    });
    return () => st.kill();
  }, []);

  return (
    <section ref={section} className="statement" aria-labelledby="statement-title">
      <div className="statement-pin">
        <h2 id="statement-title" className="statement-line">
          {LINE.split(' ').map((w, i) => (
            <span key={i} ref={(n) => { if (n) words.current[i] = n; }} className="sw">{w} </span>
          ))}
        </h2>
        <p ref={sub} className="statement-sub">Trained in ethical hacking, so security is designed in from the first commit, not patched on at the end.</p>
      </div>
    </section>
  );
}
