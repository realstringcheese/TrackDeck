// Direct Browser-to-Google Gemini API Caller with Auto-Model Discovery

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  actionTaken?: string;
}

const PREFERRED_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-flash-latest',
  'gemini-1.5-flash-latest',
];

async function getAvailableModel(apiKey: string): Promise<string> {
  const cachedModel = localStorage.getItem('trackdeck_gemini_model');
  if (cachedModel) return cachedModel;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    if (res.ok) {
      const data = await res.json();
      const available = data.models || [];
      const match = available.find(
        (m: { name: string; supportedGenerationMethods?: string[] }) =>
          m.supportedGenerationMethods?.includes('generateContent') &&
          (m.name.includes('flash') || m.name.includes('gemini'))
      );
      if (match?.name) {
        const cleanName = match.name.replace(/^models\//, '');
        localStorage.setItem('trackdeck_gemini_model', cleanName);
        return cleanName;
      }
    }
  } catch (e) {
    console.warn('Could not query Gemini models, using default', e);
  }

  return 'gemini-2.5-flash';
}

export async function askGemini(
  prompt: string,
  history: ChatMessage[],
  apiKey: string,
  currentTrackInfo?: { name: string; artist: string; album: string; isPlaying: boolean } | null
): Promise<{ reply: string; action?: { type: string; query?: string } }> {
  const activeModel = await getAvailableModel(apiKey);
  const modelsToTry = [activeModel, ...PREFERRED_MODELS.filter((m) => m !== activeModel)];

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
- Keep conversational replies concise, stylish, and engaging (1-3 sentences max).
- Never output markdown backticks around the <<<ACTION>>> tag.
- Only include <<<ACTION>>> if the user gave an explicit command to change playback.`;

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

  let lastError: Error | null = null;

  // Try active model, automatically cascading to next model if Google returns 404
  for (const model of modelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

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

      if (res.status === 404) {
        localStorage.removeItem('trackdeck_gemini_model');
        continue;
      }

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Gemini API error [${res.status}]: ${errorText}`);
      }

      const data = await res.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.';

      // Save the confirmed working model
      localStorage.setItem('trackdeck_gemini_model', model);

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
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError || new Error('All Gemini model endpoints failed.');
}