import type { Metadata } from 'next';
import Link from 'next/link';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

export const metadata: Metadata = { title: 'Page not found — Aasish Shrestha' };

// Any address that doesn't exist: the case-study type, with a way back.
export default function NotFound() {
  return (
    <>
      <Header />
      <main className="case nf">
        <p className="kicker">Error 404</p>
        <h1 className="case-title">Page not found.</h1>
        <p className="case-intro">The link may be old, or the page has moved. Everything on the site is one click away.</p>
        <div className="work-actions nf-actions">
          <Link className="btn" href="/">Back to the home page</Link>
          <Link className="btn ghost" href="/#work">See the work</Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
