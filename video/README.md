# The 45-second ad

Everything here is original: the film is an animated page (`ad.html`) recorded frame by frame,
and the music is composed and synthesised in code (`music.mjs`), so there are no licences to track.

## Re-render after editing

1. Change wording or timing in `ad.html` (each scene's start and end times are in `window.seek`).
   Open the file in a browser and run `seek(12.5)` in the console to preview any moment.
2. Rebuild the music (only needed if you change `music.mjs`):

   ```bash
   node video/music.mjs video/out/score.wav
   ```

3. Render the master (about 5–10 minutes):

   ```bash
   node video/render.mjs
   ```

4. Make the web copy and the cover image for the site:

   ```bash
   ffmpeg -y -i video/out/ad-master-1080p.mp4 -c:v libx264 -preset slow -crf 23 -maxrate 2.4M -bufsize 4.8M -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart public/film/aasish-ad.mp4
   ffmpeg -y -i video/out/ad-master-1080p.mp4 -c:v libvpx-vp9 -b:v 0 -crf 36 -row-mt 1 -pix_fmt yuv420p -c:a libopus -b:a 112k public/film/aasish-ad.webm
   ffmpeg -y -ss 25.3 -i video/out/ad-master-1080p.mp4 -frames:v 1 -c:v libwebp -quality 88 public/film/aasish-ad-poster.webp
   ```

Needs `ffmpeg` and the Playwright Chromium (`npx playwright-core install chromium`).

## Timeline (one bar of music = 2.5 s)

| Time | Scene |
|---|---|
| 0:00 | Cold open: **automation.** |
| 0:05 | The busywork piles up |
| 0:10 | Agents that handle it |
| 0:15 | They ask before they act |
| 0:20 | Product 01: Nova OS |
| 0:30 | Product 02: Hitmen |
| 0:37.5 | Security first |
| 0:40 | Let's automate something together |
