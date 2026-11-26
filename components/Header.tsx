'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';

// The "Let's talk" pill follows you down the page and steps aside while the contact section is on screen.
export default function Header() {
  const [away, setAway] = useState(false);
  useEffect(() => {
    const contact = document.getElementById('contact');
    if (!contact) return;
    const io = new IntersectionObserver(([e]) => setAway(e.isIntersecting), { rootMargin: '0px 0px -40% 0px' });
    io.observe(contact);
    return () => io.disconnect();
  }, []);

  return (
    <header className="site-header">
      <Link href="/" className="wordmark" aria-label="Aasish Shrestha, home">aasish</Link>
      <a href="/#contact" className={`pill${away ? ' away' : ''}`}>Let&apos;s talk</a>
    </header>
  );
}
