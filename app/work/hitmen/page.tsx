import type { Metadata } from 'next';
import CaseStudy, { caseMetadata, type Case } from '@/components/CaseStudy';
import Reveal from '@/components/Reveal';

export const metadata: Metadata = caseMetadata(
  'Hitmen — Aasish Shrestha',
  'Case study: Hitmen, a Gmail agent that drafts replies in the right tone and never sends without you.',
  '/work/hitmen',
);

const FLOW = ['You tag an email “Auto D”', 'Hitmen reads the thread', 'It picks the tone', 'A threaded draft appears', 'You review and send'];

const HITMEN: Case = {
  name: 'Hitmen',
  kicker: 'Gmail auto-draft agent',
  intro: 'Tag an email and Hitmen drafts the reply in the right tone, formal for the invoice and casual for the friend, then waits for you to hit send. It never sends on its own.',
  meta: [
    ['Role', 'Solo build'],
    ['Timeline', 'July 2026'],
    ['Stack', 'Python, Gmail API (OAuth 2.0), Google Apps Script, Google GenAI SDK, OpenRouter'],
    ['Status', 'Working agent: drafts only, never sends'],
  ],
  hero: (
    <div className="flow" role="list" aria-label="How Hitmen works">
      {FLOW.map((s, i) => (
        <div key={s} role="listitem" className="flow-step"><span className="flow-n">0{i + 1}</span><span>{s}</span></div>
      ))}
    </div>
  ),
  problem: 'Replies pile up because each one needs a few minutes of the right tone, not because they are hard. I wanted the first draft to be waiting in the thread when I opened it, written the way I would write to that person, with nothing ever sent behind my back.',
  features: [
    ['Label-triggered', 'Only emails you tag “Auto D” are touched. Everything else in your inbox is left alone.'],
    ['The right tone', 'Tone comes from per-sender profiles, or is detected from keywords, the sender’s domain and the message itself.'],
    ['Threaded drafts', 'Drafts land inside the original thread, ready to edit, so replying feels like your own email.'],
    ['Never sends', 'Hitmen only writes drafts. A person always reads and sends.'],
    ['Tidy by design', 'It skips threads that already have a draft and cleans up its label afterwards.'],
    ['No server needed', 'The Apps Script version runs inside Gmail on a schedule, with nothing to host.'],
  ],
  showcase: (
    <>
      <Reveal as="h2">Two drafts, two tones</Reveal>
      <div className="drafts">
        <Reveal className="draft">
          <p className="mail-k">Formal · Re: Invoice #2041</p>
          <p>Hi Maya,</p>
          <p>Thank you for the reminder. The invoice was paid this morning and the receipt is attached for your records.</p>
          <p>Kind regards,<br />Aasish</p>
        </Reveal>
        <Reveal className="draft casual" delay={80}>
          <p className="mail-k">Casual · Re: Saturday?</p>
          <p>Hey Sam!</p>
          <p>Saturday works, count me in. I’ll bring snacks. What time are we thinking?</p>
          <p>Aasish</p>
        </Reveal>
      </div>
      <p className="case-fine">Example drafts written for this page.</p>
    </>
  ),
  decisions: [
    ['Built twice, on purpose', 'First in Python on the Gmail API for full control, then as a Google Apps Script that runs inside Gmail with no server to maintain.'],
    ['Drafts, never sends', 'Every reply waits for a human. An agent that writes in your voice should never speak for you without a look.'],
    ['Context-aware tone', 'A per-sender profile wins when one exists; otherwise the tone is inferred from the message, so a stranger’s invoice never gets a “hey!”.'],
    ['Model-agnostic', 'Prototyped on Llama 3.3 70B through OpenRouter and on Gemini through the Google GenAI SDK, behind the same drafting step.'],
  ],
  limits: [
    'Gmail only for now.',
    'Drafts only, by design: nothing is sent without a person.',
  ],
  next: { name: 'Nova OS', href: '/work/nova-os' },
};

export default function Hitmen() {
  return <CaseStudy c={HITMEN} />;
}
