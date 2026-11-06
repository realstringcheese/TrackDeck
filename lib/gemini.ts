// Client Caller -> Calls our Vercel Bridge Route (No School Firewall Block)

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
  const res = await fetch('/api/chat', {
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

  return { reply, action };
}