// Security headers on every response. Static hosts don't read this file: when the site is published,
// the same list goes into the host's own headers config.
const dev = process.env.NODE_ENV !== 'production';

const csp = [
  "default-src 'self'",
  // Next.js inlines its small boot scripts, and the motion flag in app/layout.tsx is inline too.
  // 'wasm-unsafe-eval' lets the game's physics engine compile its WebAssembly; it does not allow JS eval.
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "media-src 'self'",
  // the contact form sends to FormSubmit, and nowhere else; blob: is the game unpacking textures embedded in its own models
  "connect-src 'self' blob: https://formsubmit.co",
  "form-action 'self' https://formsubmit.co",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // NEXT_DIST lets a production test build live beside a running `next dev` (both would otherwise share .next)
  distDir: process.env.NEXT_DIST || '.next',
  reactStrictMode: true,
  poweredByHeader: false,
  // the site has no images to resize, so Next's image optimizer (and sharp with it) stays off
  images: { unoptimized: true },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  // the game's physics engine ships as a real .wasm file (smaller and faster to start than one inlined as text);
  // the server build writes one folder deeper, so both point at the same static/wasm folder
  webpack(config, { isServer }) {
    config.experiments = { ...config.experiments, asyncWebAssembly: true };
    config.output.environment = { ...config.output.environment, asyncFunction: true };   // every browser that runs WebGL2 has async/await
    config.output.webassemblyModuleFilename = isServer ? '../static/wasm/[modulehash].wasm' : 'static/wasm/[modulehash].wasm';
    return config;
  },
};

export default nextConfig;
