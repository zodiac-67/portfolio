import Link from 'next/link';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Header from './Header';
import Footer from './Footer';
import Reveal from './Reveal';

export type Case = {
  name: string;
  kicker: string;
  intro: string;
  meta: [string, string][];
  hero: ReactNode;
  problem: string;
  features: [string, string][];
  showcase?: ReactNode;
  decisions: [string, string][];
  proof?: string[];
  limits: string[];
  next: { name: string; href: string };
};

// A case study's own title, description, canonical address and share card (the site's card, public/og.png).
// Twitter's tags are filled in from these by Next.
export function caseMetadata(title: string, description: string, path: string): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, siteName: 'Aasish Shrestha', type: 'article', locale: 'en_US', images: [{ url: '/og.png', width: 1200, height: 630, alt: 'automation. Aasish Shrestha, AI engineer' }] },
  };
}

// One template for every project: big title, facts, what it does, how it was built, honest limits.
export default function CaseStudy({ c }: { c: Case }) {
  return (
    <>
      <Header />
      <main id="main" tabIndex={-1} className="case">
        <header className="case-head">
          <Reveal as="p" className="kicker"><Link href="/#work" className="case-back"><span aria-hidden="true">← </span>All work</Link> · {c.kicker}</Reveal>
          <Reveal as="h1" className="case-title" delay={60}>{c.name}</Reveal>
          <Reveal as="p" className="case-intro" delay={120}>{c.intro}</Reveal>
          <Reveal as="dl" className="case-meta" delay={180}>
            {c.meta.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </Reveal>
        </header>

        <Reveal className="case-hero">{c.hero}</Reveal>

        <section className="case-sec">
          <Reveal as="h2">The problem</Reveal>
          <Reveal as="p" className="case-prose">{c.problem}</Reveal>
        </section>

        <section className="case-sec">
          <Reveal as="h2">What it does</Reveal>
          <div className="case-grid">
            {c.features.map(([t, d], i) => (
              <Reveal key={t} className="case-card" delay={(i % 3) * 70}>
                <h3>{t}</h3>
                <p>{d}</p>
              </Reveal>
            ))}
          </div>
        </section>

        {c.showcase && <section className="case-sec">{c.showcase}</section>}

        <section className="case-sec">
          <Reveal as="h2">Decisions that matter</Reveal>
          <div className="case-cols">
            {c.decisions.map(([t, d], i) => (
              <Reveal key={t} className="case-col" delay={(i % 2) * 70}>
                <h3>{t}</h3>
                <p>{d}</p>
              </Reveal>
            ))}
          </div>
        </section>

        {c.proof && (
          <section className="case-sec">
            <Reveal as="h2">How I know it works</Reveal>
            <Reveal as="ul" className="case-ticks">{c.proof.map((p) => <li key={p}>{p}</li>)}</Reveal>
          </section>
        )}

        <section className="case-sec">
          <Reveal as="h2">Limits, honestly</Reveal>
          <Reveal as="ul" className="case-ticks muted">{c.limits.map((p) => <li key={p}>{p}</li>)}</Reveal>
        </section>

        <Link href={c.next.href} className="case-next">
          <span className="kicker">Next project</span>
          <span className="case-next-name">{c.next.name} <span aria-hidden="true">→</span></span>
        </Link>
      </main>
      <Footer />
    </>
  );
}
