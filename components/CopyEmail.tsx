'use client';
import { useState } from 'react';

// "Copy" next to the email address, for visitors whose mailto link opens nothing.
export default function CopyEmail({ email }: { email: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copy = async () => {
    try { await navigator.clipboard.writeText(email); setState('copied'); } catch { setState('failed'); }
    setTimeout(() => setState('idle'), 2000);
  };
  return (
    <button type="button" className="copy-mail" onClick={copy}>
      <span aria-live="polite">{state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : 'Copy'}</span>
      {state === 'idle' && <span className="sr-only"> email address</span>}
    </button>
  );
}
