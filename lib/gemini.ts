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
): Promise<{ reply: string; action?: { type: string; query?: string } }> {
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
  let action: { type: string; query?: string } | undefined = undefined;

  const actionMatch = rawText.match(/<<<ACTION:(.*?)>>>/);
  if (actionMatch && actionMatch[1]) {
    try {
      action = JSON.parse(actionMatch[1]);
      reply = rawText.replace(/<<<ACTION:(.*?)>>>/, '').trim();
    } catch (e) {
      console.warn('Failed to parse action JSON from Gemini', e);
    }
  }

  // Prevent blank answers if the model only generated an action tag
  if (!reply && action) {
    if (action.type === 'next') reply = 'Skipping to the next track.';
    else if (action.type === 'pause') reply = 'Paused playback.';
    else if (action.type === 'play') reply = 'Resuming playback.';
    else if (action.type === 'search_play') reply = `Queuing up "${action.query || 'your track'}".`;
    else reply = 'On it!';
  }

  return { reply: reply || 'Got it!', action };
}