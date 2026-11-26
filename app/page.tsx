import type { Metadata } from 'next';
import Header from '@/components/Header';
import Hero from '@/components/Hero';
import Statement from '@/components/Statement';
import Services from '@/components/Services';
import Film from '@/components/Film';
import Roles from '@/components/Roles';
import Work from '@/components/Work';
import Contact from '@/components/Contact';
import Footer from '@/components/Footer';

// canonical lives on each page, not the layout, so the case studies don't inherit '/'
export const metadata: Metadata = { alternates: { canonical: '/' } };

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <Statement />
        <Services />
        <Film />
        <Roles />
        <Work />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
