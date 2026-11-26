// Aasish's five most-played songs of the last 7 days, from Last.fm (which Spotify scrobbles to). The key stays on the
// server: set LASTFM_API_KEY and LASTFM_USER on the host. Without them, or if Last.fm is down, this answers the last good
// list it had (or an empty one, and the game's music board shows his two favourites instead).
//
// It refreshes itself: asked at request time (never baked into the build), a good list is kept for an hour, and an empty
// or failed answer is tried again after 5 minutes instead of sticking for the hour. The CDN may hold the response as long.
export const dynamic = 'force-dynamic';

type Track = { name: string; artist: string; plays: number };
const HOUR = 3600, RETRY = 300;
let last: { tracks: Track[]; at: number } = { tracks: [], at: 0 };   // per server instance; a cold start just asks again

async function chart(key: string, user: string): Promise<Track[] | null> {
  const q = new URLSearchParams({ method: 'user.gettoptracks', user, period: '7day', limit: '5', api_key: key, format: 'json' });
  try {
    const r = await fetch(`https://ws.audioscrobbler.com/2.0/?${q}`, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    const list = r.ok ? (await r.json())?.toptracks?.track : null;
    if (!Array.isArray(list)) return null;
    // only what the board shows, trimmed: nothing else from the response reaches the page
    return list.slice(0, 5).map((t) => ({ name: String(t?.name ?? '').slice(0, 80), artist: String(t?.artist?.name ?? '').slice(0, 60), plays: Number(t?.playcount) || 0 })).filter((t) => t.name && t.artist);
  } catch { return null; }   // Last.fm unreachable
}

export async function GET() {
  const key = process.env.LASTFM_API_KEY, user = process.env.LASTFM_USER;
  const age = (Date.now() - last.at) / 1000;
  if (key && user && age > (last.tracks.length ? HOUR : RETRY)) {
    const fresh = await chart(key, user);
    if (fresh?.length || !last.tracks.length) last = { tracks: fresh ?? [], at: Date.now() };   // a failure keeps the last good list
    else last.at = Date.now() - (HOUR - RETRY) * 1000;                                          // ...and tries again in 5 minutes
  }
  const keep = last.tracks.length ? HOUR : RETRY;
  return Response.json({ tracks: last.tracks }, { headers: { 'Cache-Control': `public, max-age=0, s-maxage=${keep}, stale-while-revalidate=${keep}` } });
}
