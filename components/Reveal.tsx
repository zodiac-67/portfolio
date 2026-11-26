'use client';
import { useEffect, useRef, type ElementType, type ReactNode } from 'react';

// Fades and lifts its content into place the first time it scrolls into view.
export default function Reveal({ as: Tag = 'div', className = '', delay = 0, children, ...rest }: { as?: ElementType; className?: string; delay?: number; children: ReactNode; [k: string]: unknown }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { el.classList.add('in'); io.disconnect(); } }, { rootMargin: '0px 0px -12% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <Tag ref={ref} className={`rv ${className}`} style={delay ? { transitionDelay: `${delay}ms` } : undefined} {...rest}>{children}</Tag>;
}
