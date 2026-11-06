export interface CopilotAction {
  type: 'next' | 'pause' | 'play' | 'play_track' | 'play_artist' | 'queue_track';
  track?: string;
  artist?: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  actionTaken?: string;
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

  const actionMatch = rawText.match(/<<<ACTION:(.*?)>>>/);
  if (actionMatch && actionMatch[1]) {
    try {
      action = JSON.parse(actionMatch[1]);
      reply = rawText.replace(/<<<ACTION:(.*?)>>>/, '').trim();
    } catch (e) {
      console.warn('Failed to parse action JSON from Copilot', e);
    }
  }

  if (!reply && action) {
    if (action.type === 'next') reply = 'Skipping to the next track.';
    else if (action.type === 'pause') reply = 'Paused playback.';
    else if (action.type === 'play') reply = 'Resuming playback.';
    else if (action.type === 'play_track') reply = `Playing "${action.track || 'track'}".`;
    else if (action.type === 'play_artist') reply = `Spinning ${action.artist || 'artist'}.`;
    else if (action.type === 'queue_track') reply = `Queued "${action.track || 'track'}".`;
    else reply = 'On it!';
  }

  return { reply: reply || 'Got it!', action };
}