import { LOCATION, SOCIAL } from '@/lib/site';

export default function Footer() {
  return (
    <footer className="site-footer">
      <p>© {new Date().getFullYear()} Aasish Shrestha · AI engineer · {LOCATION}</p>
      <p className="footer-links">{SOCIAL.map((s) => <a key={s.href} href={s.href} target="_blank" rel="noreferrer">{s.label}<span className="sr-only"> (opens in a new tab)</span></a>)}</p>
    </footer>
  );
}
