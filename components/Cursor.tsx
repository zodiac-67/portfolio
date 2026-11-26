// A labelled multiplayer-style cursor: the arrow plus a coloured name tag.
export default function Cursor({ label, tone, className = '' }: { label: string; tone: 'royal' | 'ink' | 'green' | 'amber'; className?: string }) {
  return (
    <span className={`cursor cursor-${tone} ${className}`} aria-hidden="true">
      <svg width="18" height="20" viewBox="0 0 18 20"><path d="M1.5 1.5 L16 9.2 L9.4 10.6 L6.6 17.6 Z" /></svg>
      <span className="cursor-tag">{label}</span>
    </span>
  );
}
