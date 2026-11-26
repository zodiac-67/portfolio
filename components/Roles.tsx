import Reveal from './Reveal';
import Cursor from './Cursor';
import { STACK } from '@/lib/site';

const PRINCIPLES = [
  ['Security first', 'Keys encrypted, sessions hardened, every outbound request checked. My degree is in breaking systems.'],
  ['You approve, it acts', 'Anything that sends, deletes or spends waits for a yes. Nothing happens behind your back.'],
  ['Proven, not promised', 'Automated tests, accessibility audits and failure drills before anything is called done.'],
];

// Solo, but covering every role a small team would: shown as the cursors of one person.
export default function Roles() {
  return (
    <section className="roles" aria-labelledby="roles-title">
      <div className="roles-stage">
        <Reveal as="h2" id="roles-title" className="roles-title">One engineer.<br />Every hat.</Reveal>
        <Cursor label="AI engineer" tone="royal" className="r1" />
        <Cursor label="Security reviewer" tone="ink" className="r2" />
        <Cursor label="Full-stack developer" tone="green" className="r3" />
        <Cursor label="Product designer" tone="amber" className="r4" />
        <Cursor label="QA & testing" tone="royal" className="r5" />
      </div>
      <div className="principles">
        {PRINCIPLES.map(([t, d], i) => (
          <Reveal key={t} className="principle" delay={i * 80}>
            <h3>{t}</h3>
            <p>{d}</p>
          </Reveal>
        ))}
      </div>
      <Reveal as="ul" className="stack" aria-label="Tools I use">
        {STACK.map((s) => <li key={s} className="chip">{s}</li>)}
      </Reveal>
    </section>
  );
}
