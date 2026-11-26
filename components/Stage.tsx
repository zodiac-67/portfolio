'use client';
import { useEffect, useRef, type ReactNode } from 'react';

// Marks its element `.in` the first time it scrolls into view. Unlike Reveal it adds no motion of its
// own: the CSS for its children plays the entrance, so each piece can arrive in its own order.
export default function Stage({ className = '', children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { el.classList.add('in'); io.disconnect(); } }, { rootMargin: '0px 0px -12% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={className}>{children}</div>;
}
