import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import 'lenis/dist/lenis.css';
import './globals.css';
import SmoothScroll from '@/components/SmoothScroll';
import { SITE_URL } from '@/lib/site';

// Inter's optical-size axis gives the tight "display" cut at headline sizes automatically.
const sans = Inter({ subsets: ['latin'], axes: ['opsz'], variable: '--font-sans', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono', display: 'swap', preload: false });

// the share card (public/og.png): the hero's word with its bubbles and cursors. Case studies reuse it (CaseStudy.tsx).
const OG_IMAGE = { url: '/og.png', width: 1200, height: 630, alt: 'automation. Aasish Shrestha, AI engineer' };

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Aasish Shrestha — AI engineer',
  description: 'AI engineer in Fort Worth, Texas. I build AI agents, LLM-powered products and workflow automation, with security designed in from the first commit.',
  openGraph: { title: 'Aasish Shrestha — AI engineer', description: 'AI agents, LLM-powered products and workflow automation, built secure.', url: '/', siteName: 'Aasish Shrestha', type: 'website', locale: 'en_US', images: [OG_IMAGE] },
  // title, description and image come from openGraph (Next fills them in), per page
  twitter: { card: 'summary_large_image' },
};

export const viewport: Viewport = { themeColor: '#ffffff', width: 'device-width', initialScale: 1 };

// set before first paint, so motion-dependent initial states never flash
const motionFlag = `try{var lk=new URLSearchParams(location.search).get('look');if(lk)document.documentElement.dataset.look=lk}catch(e){}try{if(!matchMedia('(prefers-reduced-motion: reduce)').matches)document.documentElement.classList.add('js-motion')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: motionFlag }} />
      </head>
      <body>
        <SmoothScroll />
        {children}
      </body>
    </html>
  );
}
