export interface CopilotResponse {
  message: string;
  command: 'play' | 'pause' | 'next' | 'prev' | 'queue' | null;
  query: string | null;
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
): Promise<CopilotResponse> {
  const res = await fetch('/api/copilot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, history, apiKey, currentTrackInfo }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP ${res.status}`);
  }

  const data: CopilotResponse = await res.json();
  return {
    message: data.message || 'On it.',
    command: data.command || null,
    query: data.query || null,
  };
}