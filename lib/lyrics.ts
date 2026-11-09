// Free, Open-Source Synced Lyrics Client (Lrclib API - No Keys Needed)

export interface LyricLine {
  timeMs: number;
  text: string;
}

export async function fetchSyncedLyrics(
  trackName: string,
  artistName: string,
  albumName?: string,
  durationSec?: number
): Promise<LyricLine[] | null> {
  try {
    const params = new URLSearchParams({
      track_name: trackName,
      artist_name: artistName,
    });
    if (albumName) params.append('album_name', albumName);
    if (durationSec) params.append('duration', String(Math.round(durationSec)));

    const res = await fetch(`https://lrclib.net/api/get?${params.toString()}`);
    if (!res.ok) return null;

    const data = await res.json();
    if (!data.syncedLyrics) return null;

    // Parse [mm:ss.xx] lines into millisecond timestamps
    const lines = data.syncedLyrics.split('\n');
    const parsed: LyricLine[] = [];

    const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;

    for (const line of lines) {
      const match = line.match(timeRegex);
      if (match) {
        const mins = parseInt(match[1], 10);
        const secs = parseInt(match[2], 10);
        const msFraction = parseInt(match[3].padEnd(3, '0'), 10);
        const timeMs = mins * 60000 + secs * 1000 + msFraction;
        const text = line.replace(timeRegex, '').trim();

        if (text) {
          parsed.push({ timeMs, text });
        }
      }
    }

    return parsed.length > 0 ? parsed : null;
  } catch (e) {
    console.warn('Lyrics fetch failed', e);
    return null;
  }
}