export interface CopilotAction {
  type: 'next' | 'pause' | 'play' | 'play_track' | 'play_artist' | 'queue_track';
  track?: string;
  artist?: string;
  query?: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  actionTaken?: string;
}

// Client-side regex intent parser (Fallback if AI forgets its tag)
function extractIntentFallback(text: string): CopilotAction | undefined {
  const clean = text.trim().toLowerCase();

  if (/^(skip|next|next track|skip song)$/i.test(clean)) {
    return { type: 'next' };
  }
  if (/^(pause|stop|freeze)$/i.test(clean)) {
    return { type: 'pause' };
  }
  if (/^(play|resume|unpause)$/i.test(clean)) {
    return { type: 'play' };
  }

  // Handle "queue [song]"
  const queueMatch = clean.match(/^queue\s+(.+)/i);
  if (queueMatch && queueMatch[1]) {
    const raw = queueMatch[1];
    if (raw.includes(' by ')) {
      const [t, a] = raw.split(' by ');
      return { type: 'queue_track', track: t.trim(), artist: a.trim() };
    }
    return { type: 'queue_track', track: raw.trim() };
  }

  // Handle "play [song/artist]"
  const playMatch = clean.match(/^(?:play|put on|spin|listen to)\s+(.+)/i);
  if (playMatch && playMatch[1]) {
    const raw = playMatch[1].replace(/^(some\s+|a\s+)/i, '').trim();

    if (raw.includes(' by ')) {
      const [t, a] = raw.split(' by ');
      return { type: 'play_track', track: t.trim(), artist: a.trim() };
    }

    return { type: 'play_track', track: raw, query: raw };
  }

  return undefined;
}

export async function askGemini(
  prompt: string,
  history: ChatMessage[],
  apiKey: string,
  currentTrackInfo?: { name: string; artist: string; album: string; isPlaying: boolean } | null
): Promise<{ reply: string; action?: CopilotAction }> {
  const res = await fetch('/api/copilot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, history, apiKey, currentTrackInfo }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP ${res.status}`);
  }

  const { rawText } = await res.json();
  let reply = rawText;
  let action: CopilotAction | undefined = undefined;

  // Multiline-safe regex
  const actionMatch = rawText.match(/<<<ACTION:([\s\S]*?)>>>/i);
  if (actionMatch && actionMatch[1]) {
    try {
      action = JSON.parse(actionMatch[1].trim());
      reply = rawText.replace(/<<<ACTION:([\s\S]*?)>>>/i, '').trim();
    } catch (e) {
      console.warn('Failed to parse action JSON from Copilot', e);
    }
  }

  // DOUBLE-LOCK: If the AI forgot its tag, extract the action directly from what the user typed!
  if (!action) {
    action = extractIntentFallback(prompt);
  }

  if (!reply && action) {
    if (action.type === 'next') reply = 'Skipping track.';
    else if (action.type === 'pause') reply = 'Paused playback.';
    else if (action.type === 'play') reply = 'Resuming playback.';
    else if (action.type === 'play_track') reply = `Playing "${action.track || action.query}".`;
    else if (action.type === 'queue_track') reply = `Queued "${action.track}".`;
    else reply = 'On it!';
  }

  return { reply: reply || 'Got it!', action };
}