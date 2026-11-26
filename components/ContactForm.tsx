'use client';
import { useEffect, useRef, useState } from 'react';
import { EMAIL, FORM_ACTION, FORM_ENDPOINT } from '@/lib/site';

// The contact form: name, email, message.
// Sends through FormSubmit (free, no account, no backend). FormSubmit can take a few seconds to
// answer, so the confirmation shows instantly and the request finishes in the background (keepalive,
// so it completes even if the visitor leaves). If it fails while they're still here, the confirmation
// turns into a note offering their own email app with the message already written.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Field = 'name' | 'email' | 'message';
type Status = 'idle' | 'sent' | 'failed';

function validate(v: Record<Field, string>) {
  const errs: Partial<Record<Field, string>> = {};
  if (!v.name) errs.name = 'Add your name.';
  if (!v.email) errs.email = 'Add your email so I can reply.';
  else if (!EMAIL_RE.test(v.email)) errs.email = 'That email doesn’t look right. Check for a typo.';
  if (v.message.length < 10) errs.message = 'Tell me a little more: what you do by hand today, and what should happen instead.';
  return errs;
}

export default function ContactForm() {
  const [status, setStatus] = useState<Status>('idle');
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [first, setFirst] = useState('');
  const [fallback, setFallback] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const done = useRef<HTMLHeadingElement>(null);

  // move focus to the confirmation so screen readers announce it
  useEffect(() => { if (status === 'sent') done.current?.focus(); }, [status]);
  // until the script runs, the browser's own checks guard the plain form post
  useEffect(() => setHydrated(true), []);

  // open the connection to FormSubmit as soon as someone starts filling in the form
  const warmed = useRef(false);
  const warm = () => {
    if (warmed.current) return;
    warmed.current = true;
    const l = document.createElement('link');
    l.rel = 'preconnect';
    l.href = new URL(FORM_ENDPOINT).origin;
    document.head.appendChild(l);
  };

  // clear a field's error as soon as it is edited
  const onEdit = (e: React.FormEvent<HTMLFormElement>) => {
    const name = (e.target as HTMLInputElement).name as Field;
    if (errors[name]) setErrors((prev) => { const next = { ...prev }; delete next[name]; return next; });
  };

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const d = new FormData(form);
    const get = (k: string) => String(d.get(k) ?? '').trim();
    const v = { name: get('name'), email: get('email'), message: get('message') };

    const errs = validate(v);
    setErrors(errs);
    const bad = (Object.keys(errs) as Field[])[0];
    if (bad) { form.querySelector<HTMLElement>(`[name="${bad}"]`)?.focus(); return; }
    if (get('_honey')) { setStatus('sent'); return; } // a bot filled the hidden field

    setFallback(`mailto:${EMAIL}?subject=${encodeURIComponent(`Project enquiry from ${v.name}`)}&body=${encodeURIComponent(`${v.message}\n\n${v.name}`)}`);
    // confirm straight away; the request carries on in the background
    form.reset();
    setFirst(v.name.split(' ')[0]);
    setStatus('sent');
    try {
      const res = await fetch(FORM_ENDPOINT, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ name: v.name, email: v.email, message: v.message, _subject: `Portfolio enquiry from ${v.name}`, _template: 'table' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || String(json.success) !== 'true') throw new Error(json.message || 'send failed');
    } catch {
      setStatus('failed');
    }
  }

  const err = (f: Field) => errors[f] && <p id={`${f}-err`} className="field-err">{errors[f]}</p>;
  const aria = (f: Field) => ({ 'aria-invalid': errors[f] ? true : undefined, 'aria-describedby': errors[f] ? `${f}-err` : undefined });

  return (
    <div className="cform-card">
      {status !== 'idle' ? (
        <div className="cform-done">
          <span className={`done-mark${status === 'failed' ? ' bad' : ''}`} aria-hidden="true">{status === 'sent' ? '✓' : '!'}</span>
          <h3 ref={done} tabIndex={-1}>{status === 'sent' ? `Message sent${first ? `, ${first}` : ''}.` : 'That didn’t go through.'}</h3>
          <p role="status">
            {status === 'sent'
              ? 'Thanks for reaching out. I’ll reply by email.'
              : <>Sorry about that. <a href={fallback}>Open your message in your email app</a> instead, or write to <a href={`mailto:${EMAIL}`}>{EMAIL}</a>.</>}
          </p>
          <button type="button" className="btn ghost" onClick={() => setStatus('idle')}>Send another</button>
        </div>
      ) : (
        <form className="cform" method="post" action={FORM_ACTION} onSubmit={onSubmit} onInput={onEdit} onFocus={warm} noValidate={hydrated}>
          <div className="field-row">
            <div className="field">
              <label htmlFor="c-name">Your name</label>
              <input id="c-name" name="name" type="text" autoComplete="name" required {...aria('name')} />
              {err('name')}
            </div>
            <div className="field">
              <label htmlFor="c-email">Email</label>
              <input id="c-email" name="email" type="email" autoComplete="email" inputMode="email" required {...aria('email')} />
              {err('email')}
            </div>
          </div>
          <div className="field">
            <label htmlFor="c-message">Message</label>
            <textarea id="c-message" name="message" rows={3} required minLength={10} placeholder="What do you do by hand today, and what should happen on its own?" {...aria('message')} />
            {err('message')}
          </div>
          <input className="hp" type="text" name="_honey" tabIndex={-1} autoComplete="off" aria-hidden="true" />
          {/* only read by the plain post; the script sends its own subject */}
          <input type="hidden" name="_subject" value="Portfolio enquiry" />
          <input type="hidden" name="_template" value="table" />
          <div className="cform-foot">
            <button className="btn" type="submit">Send message</button>
            <p className="cform-note">Sent to my inbox through <a href="https://formsubmit.co" target="_blank" rel="noopener noreferrer">FormSubmit</a>. Used only to reply, never shared.</p>
          </div>
        </form>
      )}
    </div>
  );
}
