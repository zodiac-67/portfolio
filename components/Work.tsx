import Link from 'next/link';
import Reveal from './Reveal';

// Two real projects as tilted cards, with the kind of messages each one sends while it works.
export default function Work() {
  return (
    <section className="work" id="work" aria-labelledby="work-title">
      <div className="work-copy">
        <Reveal as="h2" id="work-title" className="work-title">Built, tested,<br />shipped.</Reveal>
        <Reveal as="p" className="work-lead" delay={80}>
          Two systems I designed, built and verified end to end: a private AI workspace and an email agent that drafts replies but never sends without you.
        </Reveal>
        <Reveal className="work-actions" delay={140}>
          <Link className="btn" href="/work/nova-os">See Nova OS</Link>
          <Link className="btn ghost" href="/work/hitmen">See Hitmen</Link>
        </Reveal>
      </div>

      <div className="work-stage" aria-hidden="true">
        <Reveal className="wcard wcard-nova">
          <img src="/work/nova-routines-desktop.webp" alt="" width={1440} height={1000} loading="lazy" />
          <span className="wcard-label">Nova OS</span>
        </Reveal>
        <Reveal className="wcard wcard-hitmen" delay={120}>
          <div className="mail">
            <p className="mail-k">Draft · Re: Invoice #2041</p>
            <p className="mail-to">To: accounts@client.co</p>
            <p>Hi Maya,</p>
            <p>Thanks for the reminder. The invoice was paid this morning; the receipt is attached.</p>
            <p>Best,<br />Aasish</p>
            <p className="mail-foot">Tone: formal · Not sent</p>
          </div>
          <span className="wcard-label">Hitmen</span>
        </Reveal>
        <div className="bubble w-b1"><span className="avatar">N</span><span className="bubble-body"><span className="bubble-meta"><b>Nova</b> now</span><span>Task finished. Receipt saved.</span></span></div>
        <div className="bubble w-b2"><span className="avatar">H</span><span className="bubble-body"><span className="bubble-meta"><b>Hitmen</b> 2m</span><span>Draft ready for your review.</span></span></div>
      </div>

      <Reveal className="builtwith">
        <span className="kicker">Built with</span>
        <span className="bw-list">TypeScript · Python · Fastify · PostgreSQL · OpenAI · Gemini · Gmail API</span>
      </Reveal>
    </section>
  );
}
