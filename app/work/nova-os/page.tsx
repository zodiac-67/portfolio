import type { Metadata } from 'next';
import CaseStudy, { caseMetadata, type Case } from '@/components/CaseStudy';
import Reveal from '@/components/Reveal';

export const metadata: Metadata = caseMetadata(
  'Nova OS — Aasish Shrestha',
  'Case study: Nova OS, a private AI workspace built solo in three weeks. Your own model keys, approvals before actions, memory you control.',
  '/work/nova-os',
);

const SCREENS = [
  ['nova-connections-desktop', 'Connections: link Google, GitHub, Notion and Slack. Google runs through your own Cloud app'],
  ['nova-approval-desktop', 'An approval card: Nova asks before creating a document'],
  ['nova-routines-desktop', 'Routines: a morning briefing and a scheduled reminder'],
  ['nova-memory-desktop', 'Memory: notes from an Obsidian vault, only the ticked ones are used'],
  ['nova-documents-desktop', 'Documents: versioned drafts made by tasks'],
];

const NOVA: Case = {
  name: 'Nova OS',
  kicker: 'Private AI workspace',
  intro: 'A personal AI workspace that runs on your own model keys, does real work through tasks and routines, asks before it acts, and only remembers what you choose to share.',
  meta: [
    ['Role', 'Solo: product, design and engineering'],
    ['Timeline', '3 weeks · 30 Sep – 19 Oct 2026 · 176 commits'],
    ['Stack', 'TypeScript, React, Vite, Fastify, PostgreSQL (PGlite), Prisma, WebSockets, Zod, Three.js'],
    ['Status', 'Working foundation, in active development'],
  ],
  hero: <img className="case-hero-img" src="/work/nova-routines-desktop.webp" alt="Nova OS: a calm 3D valley with the routines panel open" width={1440} height={1000} fetchPriority="high" />,
  problem: 'Most AI assistants are a chat box on someone else’s server. Your keys, history and files sit with a vendor, they forget everything or quietly remember too much, and newer agents take actions without asking. I wanted the opposite: one owner, my own keys, memory I control line by line, and an assistant that does real work but checks with me first.',
  features: [
    ['Your keys, any model', 'Bring keys for OpenAI or any OpenAI-compatible provider. Keys are encrypted at rest and never reach the browser.'],
    ['Chat that survives', 'Streaming replies you can cancel. Partial answers are kept, and an interrupted turn recovers after a restart.'],
    ['Real work, queued', 'A durable task engine runs 1 to 10 jobs in parallel, with attempt history and downloadable receipts.'],
    ['Asks before acting', 'Tools that change anything wait for your approval, with a clear card showing exactly what will happen.'],
    ['Memory you choose', 'Opt-in notes from your own Obsidian vault. Only ticked notes are sent, re-read before every request.'],
    ['Locked down', 'Session revocation, two-factor sign-in, and protection against requests to internal addresses.'],
  ],
  showcase: (
    <>
      <Reveal as="h2">Real screens</Reveal>
      <div className="case-gallery">
        {SCREENS.map(([f, alt], i) => (
          <Reveal key={f} as="figure" className="case-shot" delay={(i % 2) * 70}>
            <img src={`/work/${f}.webp`} alt={alt} width={1440} height={1000} loading="lazy" />
            <figcaption>{alt}</figcaption>
          </Reveal>
        ))}
        <Reveal as="figure" className="case-shot phone">
          <img src="/work/nova-chat-mobile.webp" alt="Nova chat on a phone" width={390} height={844} loading="lazy" />
          <figcaption>Works on your phone</figcaption>
        </Reveal>
      </div>
      <p className="case-fine">Real screens from Nova&apos;s test runs, shown with test data.</p>
    </>
  ),
  decisions: [
    ['One core owns everything sensitive', 'The browser never touches a provider key. A single signed-in server holds credentials, makes every model call and runs the task queue: one place to secure.'],
    ['Work that survives failure', 'Tasks run from a durable queue with saved attempts, so a crash or restart never silently loses work.'],
    ['Memory is opt-in, not ambient', 'If a ticked note is missing or too large, the send is blocked rather than silently dropped.'],
    ['Local first', 'Development runs on embedded PostgreSQL, so the whole workspace starts with one command. The same code runs on hosted PostgreSQL.'],
  ],
  proof: [
    '101 test files covering the core, the task engine and the interface',
    'Failure drills: provider outage, core restart mid-reply, two tabs at once',
    'WCAG 2.2 AA accessibility audits across 23 screens',
  ],
  limits: [
    'It is a working foundation, not a finished product; the hosted version still has acceptance checks to pass.',
    'Automatic fallback between models and a cost dashboard are not built yet.',
    'Native Anthropic and Gemini APIs need their own adapters; today it speaks the OpenAI formats.',
  ],
  next: { name: 'Hitmen', href: '/work/hitmen' },
};

export default function NovaOS() {
  return <CaseStudy c={NOVA} />;
}
