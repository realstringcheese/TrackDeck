// Direct Browser-to-Google Gemini API Caller (Zero Backend)

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
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const trackContext = currentTrackInfo
    ? `Current playing track: "${currentTrackInfo.name}" by ${currentTrackInfo.artist} (Album: ${currentTrackInfo.album}). Status: ${currentTrackInfo.isPlaying ? 'Playing' : 'Paused'}.`
    : `No track is currently playing.`;

  const systemInstruction = `You are TrackDeck's AI Music Companion. You are an expert music nerd, encyclopedic crate-digger, and friendly co-listener.
You have two jobs:
1. Converse naturally, enthusiastically, and insightfully about music, artists, genres, album histories, production styles, and recommendations.
2. If the user explicitly asks to control playback (e.g. skip, pause, play something, search a song), append a special JSON action tag at the very end of your response formatted exactly like this:
<<<ACTION:{"type":"next"|"pause"|"play"|"search_play","query":"song or artist or empty"}>>>

Context:
${trackContext}

Rules:
- Keep conversational replies concise, stylish, and engaging.
- Never output markdown backticks around the <<<ACTION>>> tag.
- Only include <<<ACTION>>> if the user gave a command to change playback.`;

  const contents = [
    ...history.slice(-8).map((m) => ({
      role: m.role === 'model' ? 'model' : 'user',
      parts: [{ text: m.text }],
    })),
    {
      role: 'user',
      parts: [{ text: prompt }],
    },
  ];

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 500,
      },
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Gemini API error: ${errorText}`);
  }

  const data = await res.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.';

  // Extract action tag if present
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