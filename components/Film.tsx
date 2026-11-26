'use client';
import { useEffect, useRef, useState } from 'react';
import Reveal from './Reveal';
import { MAILTO } from '@/lib/site';

// The dark panel: the 45-second film.
// It plays muted when scrolled into view (never with reduced motion) and pauses when it leaves.

export default function Film() {
  const video = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !still) v.play().catch(() => {});
      else if (!e.isIntersecting) v.pause();
    }, { threshold: 0.5 });
    io.observe(v);
    const vol = () => setMuted(v.muted);
    v.addEventListener('volumechange', vol);
    return () => { io.disconnect(); v.removeEventListener('volumechange', vol); };
  }, []);

  const toggleSound = () => {
    const v = video.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
    if (!v.muted) v.play().catch(() => {});
  };

  return (
    <section className="process" aria-labelledby="film-title">
      <div className="process-panel film-panel">

        <div className="process-copy">
          <Reveal as="p" className="kicker kicker-light">45-second film</Reveal>
          <Reveal as="h2" id="film-title" className="process-title" delay={60}>What I build,<br />in 45 seconds.</Reveal>
          <Reveal as="p" className="process-body" delay={120}>
            How my agents work, why they always ask before acting, and the two products I’ve shipped: Nova OS and Hitmen.
          </Reveal>
          <Reveal delay={200}><a className="btn" href={MAILTO}>Book a call</a></Reveal>
        </div>

        <Reveal className="film" delay={100}>
          <video
            ref={video}
            className="film-video"
            controls
            muted
            loop
            playsInline
            preload="metadata"
            poster="/film/aasish-ad-poster.webp"
            width={1920}
            height={1080}
            aria-label="45-second film: Aasish Shrestha, AI engineer"
            aria-describedby="film-desc"
          >
            <source src="/film/aasish-ad.mp4" type="video/mp4" />
            <source src="/film/aasish-ad.webm" type="video/webm" />
            <track kind="captions" src="/film/aasish-ad.vtt" srcLang="en" label="English" />
          </video>
          <button type="button" className="film-sound" aria-pressed={!muted} onClick={toggleSound}>
            {muted ? 'Sound off' : 'Sound on'}
          </button>
          <p id="film-desc" className="sr-only">
            A 45-second film with music and on-screen text. It opens on the word “automation.”, then shows a pile of busywork (inbox, invoices, reports, follow-ups)
            that an AI agent ticks off one by one, giving back 11.5 hours. An approval card asks “Send 3 follow-up emails?” and is approved before anything is sent.
            Nova OS is shown as a private AI workspace: your own keys and any model, work that survives failure, and memory you choose; built solo in 3 weeks.
            Hitmen drafts email replies in the right tone and never sends without you. “Security first”: trained in ethical hacking at Coventry University,
            176 commits, 101 test files, 23 screens audited for accessibility. It ends with “Let’s automate something together” and Aasish’s email and LinkedIn.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
