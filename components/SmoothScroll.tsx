'use client';
import { useEffect, useLayoutEffect } from 'react';
import { usePathname } from 'next/navigation';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

type W = Window & { __lenis?: Lenis };
const useIso = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

// One Lenis instance for the whole site, driven by GSAP's ticker so ScrollTrigger stays in sync.
// Skipped entirely with reduced motion.
export default function SmoothScroll() {
  const pathname = usePathname();

  useIso(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    gsap.registerPlugin(ScrollTrigger);
    const lenis = new Lenis({ lerp: 0.1, anchors: true });
    (window as W).__lenis = lenis;
    lenis.on('scroll', ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
      delete (window as W).__lenis;
    };
  }, []);

  // a new page starts at the top, unless the link pointed at a section (/#work, /#contact): without this,
  // "All work" and "Let's talk" from a case study landed at the top of the home page
  useEffect(() => {
    const L = (window as W).__lenis, el = document.getElementById(location.hash.slice(1));
    L?.scrollTo(el || 0, { immediate: true });
    if (!L || !el) return;
    // the page above still settles for a moment (images, pinned sections) and the router may reset the scroll after us:
    // hold the section in place until it has, or until the reader scrolls themself
    const want = -(parseFloat(getComputedStyle(el).scrollMarginTop) || 0), end = performance.now() + 1500;
    let raf = 0;
    const quit = () => cancelAnimationFrame(raf), evs = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;
    const hold = () => {
      if (performance.now() > end) return;
      if (Math.abs(el.getBoundingClientRect().top - want) > 2 && L.scroll < L.limit - 1) L.scrollTo(el, { immediate: true });
      raf = requestAnimationFrame(hold);
    };
    raf = requestAnimationFrame(hold);
    evs.forEach((e) => addEventListener(e, quit, { passive: true }));
    return () => { quit(); evs.forEach((e) => removeEventListener(e, quit)); };
  }, [pathname]);

  return null;
}
