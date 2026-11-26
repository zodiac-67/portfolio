// Facts about Aasish used across the site. Keep copy here so pages stay consistent.

export const NAME = 'Aasish Shrestha';
export const ROLE = 'AI engineer';
export const LOCATION = 'Fort Worth, Texas';
export const EMAIL = 'work.aasishshrestha@gmail.com';
export const SOCIAL = [
  { label: 'GitHub', href: 'https://github.com/zodiac-67' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/aasish~shrestha' },
];
// the public address, set NEXT_PUBLIC_SITE_URL on the host (share cards, robots.txt and the sitemap point here)
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3200';
export const MAILTO = `mailto:${EMAIL}?subject=${encodeURIComponent('Project enquiry')}`;

// Contact form delivery (FormSubmit, free, no account). After the one-time activation you can swap
// the address for the random alias FormSubmit gives you by setting NEXT_PUBLIC_FORM_ENDPOINT.
export const FORM_ENDPOINT = process.env.NEXT_PUBLIC_FORM_ENDPOINT || `https://formsubmit.co/ajax/${EMAIL}`;
// Where the form posts if JavaScript hasn't loaded: FormSubmit's normal endpoint, which keeps the
// details in the request body (never the address bar) and shows its own thank-you page.
export const FORM_ACTION = FORM_ENDPOINT.replace('/ajax/', '/');

export const STACK = [
  'TypeScript', 'Python', 'React', 'Next.js', 'Node.js', 'Fastify', 'PostgreSQL', 'Prisma',
  'WebSockets', 'OpenAI API', 'Gemini', 'OpenRouter', 'Gmail API', 'Apps Script', 'Playwright', 'Vitest',
];
