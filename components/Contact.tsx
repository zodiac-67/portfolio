import Stage from './Stage';
import ContactForm from './ContactForm';
import GameScreen from './GameScreen';
import { EMAIL, SOCIAL } from '@/lib/site';

const TITLE = [['Let\'s', 'automate'], ['something', 'together']];

// The finale: a royal panel with the contact form on the left and the Aasish World driving game on the right.
// On arrival the panel opens out, the headline rises word by word, then the intro, the form and the
// game card land in turn (the timing lives in globals.css under "contact entrance").
export default function Contact() {
  return (
    <section className="contact" id="contact" aria-labelledby="contact-title">
      <Stage className="contact-panel">
        <div className="contact-main">
          <h2 id="contact-title" className="contact-title">
            {TITLE.map((line, l) => (
              <span key={l} className="ct-line">
                {l > 0 && ' '}
                {line.map((w, i) => <span key={w}>{i > 0 && ' '}<span className="ct-w" style={{ ['--i' as string]: l * 2 + i }}>{w}</span></span>)}
              </span>
            ))}
          </h2>
          <p className="contact-lead">
            Tell me what eats your week. I&apos;ll come back with what an agent could take off your hands, and what it would cost to build safely.
          </p>
          <ContactForm />
          <p className="contact-mail">
            Prefer email? <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
            {/* on a line of its own, so the wrap never strands one link */}
            <span className="contact-social">
              {SOCIAL.map((s, i) => <span key={s.href}>{i > 0 && ' · '}<a href={s.href} target="_blank" rel="noreferrer">{s.label}<span className="sr-only"> (opens in a new tab)</span></a></span>)}
            </span>
          </p>
        </div>
        <GameScreen />
      </Stage>
    </section>
  );
}
