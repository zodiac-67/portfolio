import Reveal from './Reveal';

// simple line icons, drawn for this site: a node graph, a chat bubble with a spark, a loop
const ICONS = [
  <g key="a"><circle cx="10" cy="12" r="4" /><circle cx="34" cy="9" r="4" /><circle cx="24" cy="34" r="4" /><path d="M14 12 L30 9.5 M12.4 15.5 L21.6 30.6 M32.6 13 L25.6 30.2" /></g>,
  <g key="b"><path d="M6 10 Q6 6 10 6 H34 Q38 6 38 10 V26 Q38 30 34 30 H18 L10 37 V30 Q6 30 6 26 Z" /><path d="M22 12 V22 M17 17 H27" /></g>,
  <g key="c"><path d="M34 16 A13 13 0 0 0 10 14" /><path d="M10 8 V14 H16" /><path d="M10 28 A13 13 0 0 0 34 30" /><path d="M34 36 V30 H28" /></g>,
];

const SERVICES = [
  {
    title: 'AI agents',
    body: 'Agents that read, decide and act inside the tools you already use, and stop to ask you before anything risky.',
    note: 'Approval steps, audit trails and receipts are built in, not bolted on.',
  },
  {
    title: 'LLM-powered products',
    body: 'Chat, search and document features on the model you choose, with your keys and your data staying yours.',
    note: 'OpenAI, Gemini or open models through OpenRouter, behind one secure core.',
  },
  {
    title: 'Workflow automation',
    body: 'The repetitive parts of your week handled on a schedule: inboxes, reports, follow-ups, hand-offs.',
    note: 'Anything from a small Gmail script to a durable task queue with retries.',
  },
];

export default function Services() {
  return (
    <section className="services" aria-labelledby="services-title">
      <Reveal as="h2" className="kicker" id="services-title">What I build</Reveal>
      <div className="services-grid">
        {SERVICES.map((s, i) => (
          <Reveal key={s.title} className="service" delay={i * 90}>
            <article className="service-card">
              <div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
              <div className="service-foot" aria-hidden="true">
                <span>0{i + 1}</span>
                <svg viewBox="0 0 44 44" width="44" height="44">{ICONS[i]}</svg>
              </div>
            </article>
            <p className="service-note">{s.note}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
