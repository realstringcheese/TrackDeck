export interface CopilotResponse {
  message: string;
  command: 'play' | 'pause' | 'next' | 'prev' | 'queue' | null;
  query: string | null;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

function inferFallbackCommand(
  prompt: string
): Pick<CopilotResponse, 'command' | 'query'> {
  const clean = prompt.trim();
  if (!clean || clean.endsWith('?')) return { command: null, query: null };

  if (/^(?:pause|stop)(?:\s+(?:the\s+)?(?:music|song|track|it))?$/i.test(clean)) {
    return { command: 'pause', query: null };
  }
  if (/^(?:skip|next)(?:\s+(?:song|track))?$/i.test(clean)) {
    return { command: 'next', query: null };
  }
  if (/^(?:prev|previous|go back|back)(?:\s+(?:song|track))?$/i.test(clean)) {
    return { command: 'prev', query: null };
  }
  if (/^(?:play|resume|unpause)(?:\s+(?:the\s+)?(?:music|song|track|it))?$/i.test(clean)) {
    return { command: 'play', query: null };
  }

  const queueMatch = clean.match(/^(?:queue|add to queue)\s+(.+)$/i);
  if (queueMatch?.[1]) {
    return { command: 'queue', query: queueMatch[1].trim() };
  }

  const playMatch = clean.match(/^(?:play|put on)\s+(.+)$/i);
  if (playMatch?.[1] && !/^with\b/i.test(playMatch[1])) {
    return { command: 'play', query: playMatch[1].trim() };
  }

  return { command: null, query: null };
}

export async function askGemini(
  prompt: string,
  history: ChatMessage[],
  currentTrackInfo?: { name: string; artist: string; album: string; isPlaying: boolean } | null
): Promise<CopilotResponse> {
  const res = await fetch('/api/copilot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, history, currentTrackInfo }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP ${res.status}`);
  }

  const data: CopilotResponse = await res.json();
  const fallback = !data.command ? inferFallbackCommand(prompt) : { command: null, query: null };

  return {
    message: data.message || 'On it.',
    command: data.command || fallback.command,
    query: data.query || fallback.query,
  };
}